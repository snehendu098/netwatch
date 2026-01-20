//! Socket.IO client wrapper for server communication.
//!
//! Uses HTTP polling transport for reliable connections through proxies.
//! WebSocket upgrade is optional and can be added if needed.

use crate::config::{Config, ServerConfig};
use crate::socket::events::*;
use crate::utils::system_info::SystemInfo;
use reqwest::Client as HttpClient;
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{debug, error, info, warn};

/// Engine.IO packet type for connection open
const ENGINE_OPEN: char = '0';

type EventCallback<T> = Arc<Mutex<Option<Box<dyn Fn(T) + Send + Sync + 'static>>>>;
type EventCallbackList<T> = Arc<Mutex<Vec<Box<dyn Fn(T) + Send + Sync + 'static>>>>;

/// Socket.IO client for communication with the server
pub struct SocketClient {
    config: Arc<RwLock<Config>>,
    connected: Arc<RwLock<bool>>,
    computer_id: Arc<RwLock<Option<String>>>,
    http_client: HttpClient,
    session_id: Arc<RwLock<Option<String>>>,
    base_url: Arc<RwLock<String>>,
    socket_path: Arc<RwLock<String>>,
    outgoing_tx: Arc<Mutex<Option<mpsc::Sender<String>>>>,

    // Event callbacks
    on_auth_success: EventCallback<ServerConfigPayload>,
    on_auth_error: EventCallback<String>,
    on_command: EventCallbackList<CommandPayload>,
    on_start_screen_stream: EventCallback<(u32, u32)>,
    on_stop_screen_stream: EventCallback<()>,
    on_capture_screenshot: EventCallback<()>,
    on_remote_input: EventCallback<RemoteInputPayload>,
    on_start_remote_control: EventCallback<StartRemoteControlPayload>,
    on_start_terminal: EventCallback<StartTerminalPayload>,
    on_terminal_input: EventCallback<TerminalInputPayload>,
    on_file_transfer: EventCallback<FileTransferPayload>,
    on_list_directory: EventCallback<ListDirectoryPayload>,
}

impl SocketClient {
    pub fn new(config: Arc<RwLock<Config>>) -> Self {
        Self {
            config,
            connected: Arc::new(RwLock::new(false)),
            computer_id: Arc::new(RwLock::new(None)),
            http_client: HttpClient::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            session_id: Arc::new(RwLock::new(None)),
            base_url: Arc::new(RwLock::new(String::new())),
            socket_path: Arc::new(RwLock::new(String::new())),
            outgoing_tx: Arc::new(Mutex::new(None)),
            on_auth_success: Arc::new(Mutex::new(None)),
            on_auth_error: Arc::new(Mutex::new(None)),
            on_command: Arc::new(Mutex::new(Vec::new())),
            on_start_screen_stream: Arc::new(Mutex::new(None)),
            on_stop_screen_stream: Arc::new(Mutex::new(None)),
            on_capture_screenshot: Arc::new(Mutex::new(None)),
            on_remote_input: Arc::new(Mutex::new(None)),
            on_start_remote_control: Arc::new(Mutex::new(None)),
            on_start_terminal: Arc::new(Mutex::new(None)),
            on_terminal_input: Arc::new(Mutex::new(None)),
            on_file_transfer: Arc::new(Mutex::new(None)),
            on_list_directory: Arc::new(Mutex::new(None)),
        }
    }

    /// Connect to the server using HTTP polling transport
    pub async fn connect(&self) -> Result<(), SocketError> {
        let config = self.config.read().await;
        let server_url = config.server_url.clone();
        drop(config);

        if server_url.is_empty() {
            return Err(SocketError::Config("No server URL configured".into()));
        }

        info!("Connecting to server: {}", server_url);

        // Parse URL
        let parsed_url = url::Url::parse(&server_url)
            .map_err(|e| SocketError::Config(format!("Invalid URL: {}", e)))?;

        let base_url = format!(
            "{}://{}{}",
            parsed_url.scheme(),
            parsed_url.host_str().unwrap_or("localhost"),
            parsed_url.port().map(|p| format!(":{}", p)).unwrap_or_default()
        );

        // Get socket.io path from URL path (e.g., /nw-socket -> /nw-socket/socket.io)
        let path_prefix = parsed_url.path().trim_end_matches('/');
        let socket_path = if path_prefix.is_empty() || path_prefix == "/" {
            "/socket.io".to_string()
        } else {
            format!("{}/socket.io", path_prefix)
        };

        *self.base_url.write().await = base_url.clone();
        *self.socket_path.write().await = socket_path.clone();

        info!("Using HTTP polling transport");
        info!("Base URL: {}, Socket path: {}", base_url, socket_path);

        // Step 1: HTTP handshake to get session ID
        let handshake_url = format!("{}{}/?EIO=4&transport=polling", base_url, socket_path);
        info!("Handshake URL: {}", handshake_url);

        let response = self.http_client
            .get(&handshake_url)
            .send()
            .await
            .map_err(|e| SocketError::Connection(format!("Handshake failed: {}", e)))?;

        let text = response
            .text()
            .await
            .map_err(|e| SocketError::Connection(format!("Failed to read handshake: {}", e)))?;

        info!("Handshake response: {}", text);

        if !text.starts_with(ENGINE_OPEN) {
            return Err(SocketError::Connection(format!(
                "Invalid handshake: expected '0{{...}}', got: {}",
                text
            )));
        }

        #[derive(serde::Deserialize)]
        struct Handshake {
            sid: String,
            #[serde(rename = "pingInterval")]
            ping_interval: u64,
            #[serde(rename = "pingTimeout")]
            ping_timeout: u64,
        }

        let handshake: Handshake = serde_json::from_str(&text[1..])
            .map_err(|e| SocketError::Connection(format!("Failed to parse handshake: {}", e)))?;

        info!("Session ID: {}, Ping interval: {}ms", handshake.sid, handshake.ping_interval);
        *self.session_id.write().await = Some(handshake.sid.clone());

        // Step 2: Connect to /agent namespace
        info!("Connecting to /agent namespace...");
        self.send_polling_packet("40/agent,").await?;

        // Read namespace connect acknowledgment
        let resp = self.read_polling().await?;
        if resp.starts_with("40/agent,") {
            info!("Connected to /agent namespace: {}", resp);
        } else {
            warn!("Unexpected namespace response: {}", resp);
        }

        *self.connected.write().await = true;
        info!("Socket.IO connection established!");

        // Step 3: Send authentication
        let system_info = SystemInfo::gather().await;
        let auth_payload = AuthPayload {
            machine_id: system_info.machine_id,
            hostname: system_info.hostname.clone(),
            os_type: system_info.os_type,
            os_version: system_info.os_version,
            mac_address: system_info.mac_address,
            ip_address: system_info.ip_address,
            agent_version: crate::VERSION.to_string(),
        };

        info!("Sending authentication for host: {}", system_info.hostname);
        self.emit(outgoing::AUTH, &auth_payload).await?;

        // Wait for auth response
        let auth_response = self.read_polling().await?;
        info!("Auth response: {}", auth_response);

        // Process auth response
        if auth_response.starts_with("42/agent,") {
            let json_part = &auth_response[9..];
            if let Ok(arr) = serde_json::from_str::<Vec<Value>>(json_part) {
                if let Some(event) = arr.get(0).and_then(|v| v.as_str()) {
                    let data = arr.get(1).cloned().unwrap_or(Value::Null);
                    match event {
                        "auth_success" => {
                            if let Ok(payload) = serde_json::from_value::<AuthSuccessPayload>(data) {
                                info!("Authenticated as computer: {}", payload.computer_id);
                                *self.computer_id.write().await = Some(payload.computer_id.clone());

                                if let Some(cfg) = &payload.config {
                                    let mut c = self.config.write().await;
                                    c.update_from_server(&ServerConfig {
                                        screenshot_interval: cfg.screenshot_interval,
                                        activity_log_interval: cfg.activity_log_interval,
                                        keystroke_buffer_size: cfg.keystroke_buffer_size,
                                    });
                                }

                                if let Some(cb) = self.on_auth_success.lock().await.as_ref() {
                                    cb(payload.config.unwrap_or_default());
                                }
                            }
                        }
                        "auth_error" => {
                            if let Ok(payload) = serde_json::from_value::<AuthErrorPayload>(data) {
                                error!("Authentication failed: {}", payload.message);
                                if let Some(cb) = self.on_auth_error.lock().await.as_ref() {
                                    cb(payload.message.clone());
                                }
                                return Err(SocketError::Connection(format!("Auth failed: {}", payload.message)));
                            }
                        }
                        _ => {
                            warn!("Unexpected event during auth: {}", event);
                        }
                    }
                }
            }
        }

        // Create outgoing message channel
        let (tx, mut rx) = mpsc::channel::<String>(100);
        *self.outgoing_tx.lock().await = Some(tx);

        // Clone for tasks
        let base_url_clone = base_url.clone();
        let socket_path_clone = socket_path.clone();
        let session_id = handshake.sid.clone();
        let http_client = self.http_client.clone();
        let connected = self.connected.clone();

        // Spawn outgoing message sender task
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if !*connected.read().await {
                    break;
                }
                let url = format!(
                    "{}{}/?EIO=4&transport=polling&sid={}",
                    base_url_clone, socket_path_clone, session_id
                );
                if let Err(e) = http_client
                    .post(&url)
                    .header("Content-Type", "text/plain;charset=UTF-8")
                    .body(msg)
                    .send()
                    .await
                {
                    error!("Failed to send message: {}", e);
                }
            }
            debug!("Outgoing message task ended");
        });

        // Clone for polling task
        let base_url_poll = base_url.clone();
        let socket_path_poll = socket_path.clone();
        let session_id_poll = handshake.sid.clone();
        let http_client_poll = self.http_client.clone();
        let connected_poll = self.connected.clone();
        let on_command = self.on_command.clone();
        let on_start_screen_stream = self.on_start_screen_stream.clone();
        let on_stop_screen_stream = self.on_stop_screen_stream.clone();
        let on_capture_screenshot = self.on_capture_screenshot.clone();
        let on_remote_input = self.on_remote_input.clone();
        let on_start_remote_control = self.on_start_remote_control.clone();
        let on_start_terminal = self.on_start_terminal.clone();
        let on_terminal_input = self.on_terminal_input.clone();
        let on_file_transfer = self.on_file_transfer.clone();
        let on_list_directory = self.on_list_directory.clone();
        let ping_interval = handshake.ping_interval;

        // Spawn long-polling task for incoming messages
        tokio::spawn(async move {
            let mut last_ping = std::time::Instant::now();

            loop {
                if !*connected_poll.read().await {
                    break;
                }

                // Send ping if needed
                if last_ping.elapsed().as_millis() as u64 > ping_interval - 5000 {
                    let ping_url = format!(
                        "{}{}/?EIO=4&transport=polling&sid={}",
                        base_url_poll, socket_path_poll, session_id_poll
                    );
                    let _ = http_client_poll
                        .post(&ping_url)
                        .header("Content-Type", "text/plain;charset=UTF-8")
                        .body("2")
                        .send()
                        .await;
                    last_ping = std::time::Instant::now();
                }

                // Long poll for messages
                let poll_url = format!(
                    "{}{}/?EIO=4&transport=polling&sid={}",
                    base_url_poll, socket_path_poll, session_id_poll
                );

                match http_client_poll.get(&poll_url).send().await {
                    Ok(response) => {
                        if let Ok(text) = response.text().await {
                            // Parse multiple messages (can be batched)
                            for msg in Self::parse_polling_response(&text) {
                                // Skip pong and noop
                                if msg == "3" || msg == "6" {
                                    continue;
                                }

                                debug!("Received: {}", msg);

                                if msg.starts_with("42/agent,") {
                                    let json_part = &msg[9..];
                                    if let Ok(arr) = serde_json::from_str::<Vec<Value>>(json_part) {
                                        if let Some(event) = arr.get(0).and_then(|v| v.as_str()) {
                                            let data = arr.get(1).cloned().unwrap_or(Value::Null);
                                            Self::handle_event_static(
                                                event,
                                                data,
                                                &on_command,
                                                &on_start_screen_stream,
                                                &on_stop_screen_stream,
                                                &on_capture_screenshot,
                                                &on_remote_input,
                                                &on_start_remote_control,
                                                &on_start_terminal,
                                                &on_terminal_input,
                                                &on_file_transfer,
                                                &on_list_directory,
                                            ).await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("Polling error: {}", e);
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
            info!("Polling task ended");
        });

        // Start heartbeat
        self.start_heartbeat();

        Ok(())
    }

    /// Send a packet via polling
    async fn send_polling_packet(&self, data: &str) -> Result<(), SocketError> {
        let base_url = self.base_url.read().await.clone();
        let socket_path = self.socket_path.read().await.clone();
        let session_id = self.session_id.read().await.clone()
            .ok_or(SocketError::NotConnected)?;

        let url = format!("{}{}/?EIO=4&transport=polling&sid={}", base_url, socket_path, session_id);

        self.http_client
            .post(&url)
            .header("Content-Type", "text/plain;charset=UTF-8")
            .body(data.to_string())
            .send()
            .await
            .map_err(|e| SocketError::Emit(format!("Failed to send: {}", e)))?;

        Ok(())
    }

    /// Read from polling
    async fn read_polling(&self) -> Result<String, SocketError> {
        let base_url = self.base_url.read().await.clone();
        let socket_path = self.socket_path.read().await.clone();
        let session_id = self.session_id.read().await.clone()
            .ok_or(SocketError::NotConnected)?;

        let url = format!("{}{}/?EIO=4&transport=polling&sid={}", base_url, socket_path, session_id);

        let response = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SocketError::Connection(format!("Polling failed: {}", e)))?;

        response
            .text()
            .await
            .map_err(|e| SocketError::Connection(format!("Failed to read poll: {}", e)))
    }

    /// Parse polling response (can contain multiple messages)
    fn parse_polling_response(text: &str) -> Vec<String> {
        let mut messages = Vec::new();
        let mut remaining = text;

        // Messages can be length-prefixed or just concatenated
        // Format: <length>:<message><length>:<message>... or just <message>
        while !remaining.is_empty() {
            // Check for length prefix (digits followed by colon)
            if let Some(colon_pos) = remaining.find(':') {
                if let Ok(len) = remaining[..colon_pos].parse::<usize>() {
                    let start = colon_pos + 1;
                    let end = (start + len).min(remaining.len());
                    messages.push(remaining[start..end].to_string());
                    remaining = &remaining[end..];
                    continue;
                }
            }
            // No length prefix, treat as single message
            messages.push(remaining.to_string());
            break;
        }

        messages
    }

    /// Handle incoming events (static version for use in spawned tasks)
    #[allow(clippy::too_many_arguments)]
    async fn handle_event_static(
        event: &str,
        data: Value,
        on_command: &EventCallbackList<CommandPayload>,
        on_start_screen_stream: &EventCallback<(u32, u32)>,
        on_stop_screen_stream: &EventCallback<()>,
        on_capture_screenshot: &EventCallback<()>,
        on_remote_input: &EventCallback<RemoteInputPayload>,
        on_start_remote_control: &EventCallback<StartRemoteControlPayload>,
        on_start_terminal: &EventCallback<StartTerminalPayload>,
        on_terminal_input: &EventCallback<TerminalInputPayload>,
        on_file_transfer: &EventCallback<FileTransferPayload>,
        on_list_directory: &EventCallback<ListDirectoryPayload>,
    ) {
        match event {
            "command" => {
                if let Ok(payload) = serde_json::from_value::<CommandPayload>(data) {
                    debug!("Received command: {}", payload.command);
                    for cb in on_command.lock().await.iter() {
                        cb(payload.clone());
                    }
                }
            }
            "start_screen_stream" => {
                if let Ok(payload) = serde_json::from_value::<StartScreenStreamPayload>(data) {
                    info!("Starting screen stream: {}fps, {}% quality", payload.fps, payload.quality);
                    if let Some(cb) = on_start_screen_stream.lock().await.as_ref() {
                        cb((payload.quality, payload.fps));
                    }
                }
            }
            "stop_screen_stream" => {
                info!("Stopping screen stream");
                if let Some(cb) = on_stop_screen_stream.lock().await.as_ref() {
                    cb(());
                }
            }
            "capture_screenshot" => {
                debug!("Screenshot requested");
                if let Some(cb) = on_capture_screenshot.lock().await.as_ref() {
                    cb(());
                }
            }
            "remote_input" => {
                if let Ok(payload) = serde_json::from_value::<RemoteInputPayload>(data) {
                    if let Some(cb) = on_remote_input.lock().await.as_ref() {
                        cb(payload);
                    }
                }
            }
            "start_remote_control" => {
                if let Ok(payload) = serde_json::from_value::<StartRemoteControlPayload>(data) {
                    info!("Starting remote control session: {}", payload.session_id);
                    if let Some(cb) = on_start_remote_control.lock().await.as_ref() {
                        cb(payload);
                    }
                }
            }
            "start_terminal" => {
                if let Ok(payload) = serde_json::from_value::<StartTerminalPayload>(data) {
                    info!("Starting terminal session: {}", payload.session_id);
                    if let Some(cb) = on_start_terminal.lock().await.as_ref() {
                        cb(payload);
                    }
                }
            }
            "terminal_input" => {
                if let Ok(payload) = serde_json::from_value::<TerminalInputPayload>(data) {
                    if let Some(cb) = on_terminal_input.lock().await.as_ref() {
                        cb(payload);
                    }
                }
            }
            "file_transfer" => {
                if let Ok(payload) = serde_json::from_value::<FileTransferPayload>(data) {
                    info!("File transfer request: {} ({})", payload.transfer_id, payload.direction);
                    if let Some(cb) = on_file_transfer.lock().await.as_ref() {
                        cb(payload);
                    }
                }
            }
            "list_directory" => {
                if let Ok(payload) = serde_json::from_value::<ListDirectoryPayload>(data) {
                    debug!("List directory request: {}", payload.path);
                    if let Some(cb) = on_list_directory.lock().await.as_ref() {
                        cb(payload);
                    }
                }
            }
            _ => {
                debug!("Unhandled event: {}", event);
            }
        }
    }

    /// Start application-level heartbeat loop
    fn start_heartbeat(&self) {
        let config = self.config.clone();
        let outgoing_tx = self.outgoing_tx.clone();
        let connected = self.connected.clone();

        tokio::spawn(async move {
            loop {
                let interval = {
                    let cfg = config.read().await;
                    cfg.heartbeat_interval
                };

                tokio::time::sleep(Duration::from_millis(interval)).await;

                if !*connected.read().await {
                    break;
                }

                let mut sys = sysinfo::System::new_all();
                sys.refresh_cpu_usage();
                let cpu_usage = sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() as f64
                    / sys.cpus().len().max(1) as f64;
                let memory_usage = (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0;

                let disks = sysinfo::Disks::new_with_refreshed_list();
                let disk_usage = disks.list().first().map(|d| {
                    let total = d.total_space() as f64;
                    let available = d.available_space() as f64;
                    ((total - available) / total) * 100.0
                }).unwrap_or(0.0);

                let heartbeat = HeartbeatPayload {
                    cpu_usage,
                    memory_usage,
                    disk_usage,
                    active_window: None,
                    active_process: None,
                    is_idle: false,
                    idle_time: 0,
                };

                if let Some(tx) = outgoing_tx.lock().await.as_ref() {
                    let msg = format!(
                        "42/agent,[\"heartbeat\",{}]",
                        serde_json::to_string(&heartbeat).unwrap()
                    );
                    let _ = tx.send(msg).await;
                }
            }
            debug!("Heartbeat task ended");
        });
    }

    /// Disconnect from server
    pub async fn disconnect(&self) {
        *self.connected.write().await = false;
        *self.session_id.write().await = None;
        *self.outgoing_tx.lock().await = None;
        info!("Disconnected from server");
    }

    /// Check if connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.read().await
    }

    /// Emit an event to the server
    pub async fn emit<T: Serialize>(&self, event: &str, data: &T) -> Result<(), SocketError> {
        let json_data = serde_json::to_string(data)
            .map_err(|e| SocketError::Serialization(e.to_string()))?;
        let msg = format!("42/agent,[\"{}\",{}]", event, json_data);

        // If we have an outgoing channel, use it
        if let Some(tx) = self.outgoing_tx.lock().await.as_ref() {
            tx.send(msg).await.map_err(|e| SocketError::Emit(e.to_string()))?;
        } else {
            // Otherwise send directly via polling
            self.send_polling_packet(&msg).await?;
        }

        Ok(())
    }

    // Event registration methods
    pub async fn on_auth_success<F>(&self, callback: F)
    where F: Fn(ServerConfigPayload) + Send + Sync + 'static {
        *self.on_auth_success.lock().await = Some(Box::new(callback));
    }

    pub async fn on_auth_error<F>(&self, callback: F)
    where F: Fn(String) + Send + Sync + 'static {
        *self.on_auth_error.lock().await = Some(Box::new(callback));
    }

    pub async fn on_command<F>(&self, callback: F)
    where F: Fn(CommandPayload) + Send + Sync + 'static {
        self.on_command.lock().await.push(Box::new(callback));
    }

    pub async fn on_start_screen_stream<F>(&self, callback: F)
    where F: Fn((u32, u32)) + Send + Sync + 'static {
        *self.on_start_screen_stream.lock().await = Some(Box::new(callback));
    }

    pub async fn on_stop_screen_stream<F>(&self, callback: F)
    where F: Fn(()) + Send + Sync + 'static {
        *self.on_stop_screen_stream.lock().await = Some(Box::new(callback));
    }

    pub async fn on_capture_screenshot<F>(&self, callback: F)
    where F: Fn(()) + Send + Sync + 'static {
        *self.on_capture_screenshot.lock().await = Some(Box::new(callback));
    }

    pub async fn on_remote_input<F>(&self, callback: F)
    where F: Fn(RemoteInputPayload) + Send + Sync + 'static {
        *self.on_remote_input.lock().await = Some(Box::new(callback));
    }

    pub async fn on_start_remote_control<F>(&self, callback: F)
    where F: Fn(StartRemoteControlPayload) + Send + Sync + 'static {
        *self.on_start_remote_control.lock().await = Some(Box::new(callback));
    }

    pub async fn on_start_terminal<F>(&self, callback: F)
    where F: Fn(StartTerminalPayload) + Send + Sync + 'static {
        *self.on_start_terminal.lock().await = Some(Box::new(callback));
    }

    pub async fn on_terminal_input<F>(&self, callback: F)
    where F: Fn(TerminalInputPayload) + Send + Sync + 'static {
        *self.on_terminal_input.lock().await = Some(Box::new(callback));
    }

    pub async fn on_file_transfer<F>(&self, callback: F)
    where F: Fn(FileTransferPayload) + Send + Sync + 'static {
        *self.on_file_transfer.lock().await = Some(Box::new(callback));
    }

    pub async fn on_list_directory<F>(&self, callback: F)
    where F: Fn(ListDirectoryPayload) + Send + Sync + 'static {
        *self.on_list_directory.lock().await = Some(Box::new(callback));
    }

    // Convenience emit methods
    pub async fn send_screenshot(&self, image: String, active_window: String) -> Result<(), SocketError> {
        let payload = ScreenshotPayload { image, timestamp: Self::timestamp(), active_window };
        self.emit(outgoing::SCREENSHOT, &payload).await
    }

    pub async fn send_screen_frame(&self, frame: String, monitor_index: u32) -> Result<(), SocketError> {
        let payload = ScreenFramePayload { frame, timestamp: Self::timestamp(), monitor_index };
        self.emit(outgoing::SCREEN_FRAME, &payload).await
    }

    pub async fn send_activity_logs(&self, logs: Vec<ActivityLogEntry>) -> Result<(), SocketError> {
        let payload = ActivityLogPayload { logs };
        self.emit(outgoing::ACTIVITY_LOG, &payload).await
    }

    pub async fn send_keystrokes(&self, strokes: Vec<KeystrokeEntry>) -> Result<(), SocketError> {
        let payload = KeystrokesPayload { strokes };
        self.emit(outgoing::KEYSTROKES, &payload).await
    }

    pub async fn send_clipboard(&self, content: String, content_type: String) -> Result<(), SocketError> {
        let payload = ClipboardPayload { content, content_type, timestamp: Self::timestamp() };
        self.emit(outgoing::CLIPBOARD, &payload).await
    }

    pub async fn send_process_list(&self, processes: Vec<ProcessInfo>) -> Result<(), SocketError> {
        let payload = ProcessListPayload { processes };
        self.emit(outgoing::PROCESS_LIST, &payload).await
    }

    pub async fn send_command_response(
        &self,
        command_id: String,
        success: bool,
        response: Option<String>,
        error: Option<String>,
    ) -> Result<(), SocketError> {
        let payload = CommandResponsePayload { command_id, success, response, error };
        self.emit(outgoing::COMMAND_RESPONSE, &payload).await
    }

    pub async fn send_terminal_output(&self, session_id: String, output: String) -> Result<(), SocketError> {
        let payload = TerminalOutputPayload { session_id, output };
        self.emit(outgoing::TERMINAL_OUTPUT, &payload).await
    }

    pub async fn send_file_transfer_progress(
        &self,
        transfer_id: String,
        progress: u32,
        bytes_transferred: u64,
    ) -> Result<(), SocketError> {
        let payload = FileTransferProgressPayload { transfer_id, progress, bytes_transferred };
        self.emit(outgoing::FILE_TRANSFER_PROGRESS, &payload).await
    }

    pub async fn send_file_content(
        &self,
        transfer_id: String,
        file_name: String,
        file_data: String,
        file_size: u64,
    ) -> Result<(), SocketError> {
        let payload = FileContentPayload { transfer_id, file_name, file_data, file_size };
        self.emit(outgoing::FILE_CONTENT, &payload).await
    }

    pub async fn send_directory_listing(&self, path: String, entries: Vec<DirectoryEntry>) -> Result<(), SocketError> {
        let payload = DirectoryListingPayload { path, entries };
        self.emit(outgoing::DIRECTORY_LISTING, &payload).await
    }

    fn timestamp() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

#[derive(Debug)]
pub enum SocketError {
    Config(String),
    Connection(String),
    NotConnected,
    Serialization(String),
    Emit(String),
}

impl std::fmt::Display for SocketError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SocketError::Config(msg) => write!(f, "Configuration error: {}", msg),
            SocketError::Connection(msg) => write!(f, "Connection error: {}", msg),
            SocketError::NotConnected => write!(f, "Not connected to server"),
            SocketError::Serialization(msg) => write!(f, "Serialization error: {}", msg),
            SocketError::Emit(msg) => write!(f, "Emit error: {}", msg),
        }
    }
}

impl std::error::Error for SocketError {}
