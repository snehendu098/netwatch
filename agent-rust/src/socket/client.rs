//! Socket.IO client wrapper for server communication.
//!
//! Provides a high-level API for connecting to the NetWatch server
//! and sending/receiving events.

use crate::config::{Config, ServerConfig};
use crate::socket::events::*;
use crate::utils::system_info::SystemInfo;
use rust_socketio::{
    asynchronous::{Client, ClientBuilder},
    Payload,
};
use serde::Serialize;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};

type EventCallback<T> = Arc<Mutex<Option<Box<dyn Fn(T) + Send + Sync + 'static>>>>;
type EventCallbackList<T> = Arc<Mutex<Vec<Box<dyn Fn(T) + Send + Sync + 'static>>>>;

/// Socket.IO client for communication with the server
pub struct SocketClient {
    config: Arc<RwLock<Config>>,
    client: Arc<RwLock<Option<Client>>>,
    connected: Arc<RwLock<bool>>,
    computer_id: Arc<RwLock<Option<String>>>,

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
    /// Create a new socket client
    pub fn new(config: Arc<RwLock<Config>>) -> Self {
        Self {
            config,
            client: Arc::new(RwLock::new(None)),
            connected: Arc::new(RwLock::new(false)),
            computer_id: Arc::new(RwLock::new(None)),
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

    /// Connect to the server
    pub async fn connect(&self) -> Result<(), SocketError> {
        let config = self.config.read().await;
        let server_url = config.server_url.clone();
        drop(config);

        if server_url.is_empty() {
            return Err(SocketError::Config("No server URL configured".into()));
        }

        info!("Connecting to server: {}", server_url);

        // Build the socket URL with namespace (agent namespace)
        // For URLs with path prefix like https://server.com/path, we connect to https://server.com/path/agent
        let full_url = format!("{}/agent", server_url.trim_end_matches('/'));

        info!("Connecting to socket URL: {}", full_url);

        // Clone Arcs for callbacks
        let connected = self.connected.clone();
        let computer_id = self.computer_id.clone();
        let config_arc = self.config.clone();
        let on_auth_success = self.on_auth_success.clone();
        let on_auth_error = self.on_auth_error.clone();
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

        // Build client
        let builder = ClientBuilder::new(&full_url)
            .transport_type(rust_socketio::TransportType::WebsocketUpgrade)
            .reconnect(true)
            .reconnect_delay(1000, 30000)
            .max_reconnect_attempts(10);

        // Connection event handler
        let connected_clone = connected.clone();
        builder = builder.on("connect", move |_, _| {
            let connected = connected_clone.clone();
            async move {
                info!("Socket connected");
                *connected.write().await = true;
            }
            .boxed()
        });

        // Disconnection handler
        let connected_clone = connected.clone();
        builder = builder.on("disconnect", move |_, _| {
            let connected = connected_clone.clone();
            async move {
                warn!("Socket disconnected");
                *connected.write().await = false;
            }
            .boxed()
        });

        // Auth success handler
        let on_auth_success_clone = on_auth_success.clone();
        let computer_id_clone = computer_id.clone();
        let config_clone = config_arc.clone();
        builder = builder.on(incoming::AUTH_SUCCESS, move |payload, _| {
            let on_auth_success = on_auth_success_clone.clone();
            let computer_id = computer_id_clone.clone();
            let config = config_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<AuthSuccessPayload>(value.clone()) {
                            Ok(data) => {
                                info!("Authenticated as computer: {}", data.computer_id);
                                *computer_id.write().await = Some(data.computer_id);

                                // Update config from server
                                if let Some(server_config) = &data.config {
                                    let mut cfg = config.write().await;
                                    cfg.update_from_server(&ServerConfig {
                                        screenshot_interval: server_config.screenshot_interval,
                                        activity_log_interval: server_config.activity_log_interval,
                                        keystroke_buffer_size: server_config.keystroke_buffer_size,
                                    });
                                }

                                // Call callback
                                if let Some(callback) = on_auth_success.lock().await.as_ref() {
                                    let server_cfg = data.config.unwrap_or(ServerConfigPayload {
                                        screenshot_interval: None,
                                        activity_log_interval: None,
                                        keystroke_buffer_size: None,
                                    });
                                    callback(server_cfg);
                                }
                            }
                            Err(e) => error!("Failed to parse auth_success: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // Auth error handler
        let on_auth_error_clone = on_auth_error.clone();
        builder = builder.on(incoming::AUTH_ERROR, move |payload, _| {
            let on_auth_error = on_auth_error_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<AuthErrorPayload>(value.clone()) {
                            Ok(data) => {
                                error!("Authentication failed: {}", data.message);
                                if let Some(callback) = on_auth_error.lock().await.as_ref() {
                                    callback(data.message);
                                }
                            }
                            Err(e) => error!("Failed to parse auth_error: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // Command handler (supports multiple callbacks)
        let on_command_clone = on_command.clone();
        builder = builder.on(incoming::COMMAND, move |payload, _| {
            let on_command = on_command_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<CommandPayload>(value.clone()) {
                            Ok(data) => {
                                debug!("Received command: {}", data.command);
                                let callbacks = on_command.lock().await;
                                for callback in callbacks.iter() {
                                    callback(data.clone());
                                }
                            }
                            Err(e) => error!("Failed to parse command: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // Screen stream start handler
        let on_start_stream_clone = on_start_screen_stream.clone();
        builder = builder.on(incoming::START_SCREEN_STREAM, move |payload, _| {
            let on_start_stream = on_start_stream_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<StartScreenStreamPayload>(value.clone()) {
                            Ok(data) => {
                                info!("Starting screen stream: {}fps, {}% quality", data.fps, data.quality);
                                if let Some(callback) = on_start_stream.lock().await.as_ref() {
                                    callback((data.quality, data.fps));
                                }
                            }
                            Err(e) => error!("Failed to parse start_screen_stream: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // Screen stream stop handler
        let on_stop_stream_clone = on_stop_screen_stream.clone();
        builder = builder.on(incoming::STOP_SCREEN_STREAM, move |_, _| {
            let on_stop_stream = on_stop_stream_clone.clone();
            async move {
                info!("Stopping screen stream");
                if let Some(callback) = on_stop_stream.lock().await.as_ref() {
                    callback(());
                }
            }
            .boxed()
        });

        // Capture screenshot handler
        let on_screenshot_clone = on_capture_screenshot.clone();
        builder = builder.on(incoming::CAPTURE_SCREENSHOT, move |_, _| {
            let on_screenshot = on_screenshot_clone.clone();
            async move {
                debug!("Screenshot requested");
                if let Some(callback) = on_screenshot.lock().await.as_ref() {
                    callback(());
                }
            }
            .boxed()
        });

        // Remote input handler
        let on_remote_input_clone = on_remote_input.clone();
        builder = builder.on(incoming::REMOTE_INPUT, move |payload, _| {
            let on_remote_input = on_remote_input_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<RemoteInputPayload>(value.clone()) {
                            Ok(data) => {
                                if let Some(callback) = on_remote_input.lock().await.as_ref() {
                                    callback(data);
                                }
                            }
                            Err(e) => error!("Failed to parse remote_input: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // Start remote control handler
        let on_remote_control_clone = on_start_remote_control.clone();
        builder = builder.on(incoming::START_REMOTE_CONTROL, move |payload, _| {
            let on_remote_control = on_remote_control_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<StartRemoteControlPayload>(value.clone()) {
                            Ok(data) => {
                                info!("Starting remote control session: {}", data.session_id);
                                if let Some(callback) = on_remote_control.lock().await.as_ref() {
                                    callback(data);
                                }
                            }
                            Err(e) => error!("Failed to parse start_remote_control: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // Terminal handlers
        let on_start_terminal_clone = on_start_terminal.clone();
        builder = builder.on(incoming::START_TERMINAL, move |payload, _| {
            let on_start_terminal = on_start_terminal_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<StartTerminalPayload>(value.clone()) {
                            Ok(data) => {
                                info!("Starting terminal session: {}", data.session_id);
                                if let Some(callback) = on_start_terminal.lock().await.as_ref() {
                                    callback(data);
                                }
                            }
                            Err(e) => error!("Failed to parse start_terminal: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        let on_terminal_input_clone = on_terminal_input.clone();
        builder = builder.on(incoming::TERMINAL_INPUT, move |payload, _| {
            let on_terminal_input = on_terminal_input_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<TerminalInputPayload>(value.clone()) {
                            Ok(data) => {
                                if let Some(callback) = on_terminal_input.lock().await.as_ref() {
                                    callback(data);
                                }
                            }
                            Err(e) => error!("Failed to parse terminal_input: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // File transfer handler
        let on_file_transfer_clone = on_file_transfer.clone();
        builder = builder.on(incoming::FILE_TRANSFER, move |payload, _| {
            let on_file_transfer = on_file_transfer_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<FileTransferPayload>(value.clone()) {
                            Ok(data) => {
                                info!("File transfer request: {} ({})", data.transfer_id, data.direction);
                                if let Some(callback) = on_file_transfer.lock().await.as_ref() {
                                    callback(data);
                                }
                            }
                            Err(e) => error!("Failed to parse file_transfer: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // List directory handler
        let on_list_directory_clone = on_list_directory.clone();
        builder = builder.on(incoming::LIST_DIRECTORY, move |payload, _| {
            let on_list_directory = on_list_directory_clone.clone();
            async move {
                if let Payload::Text(values) = payload {
                    if let Some(value) = values.first() {
                        match serde_json::from_value::<ListDirectoryPayload>(value.clone()) {
                            Ok(data) => {
                                debug!("List directory request: {}", data.path);
                                if let Some(callback) = on_list_directory.lock().await.as_ref() {
                                    callback(data);
                                }
                            }
                            Err(e) => error!("Failed to parse list_directory: {}", e),
                        }
                    }
                }
            }
            .boxed()
        });

        // Connect
        let client = builder
            .connect()
            .await
            .map_err(|e| SocketError::Connection(e.to_string()))?;

        *self.client.write().await = Some(client);
        *self.connected.write().await = true;

        // Send authentication
        self.send_auth().await?;

        // Start heartbeat
        self.start_heartbeat();

        Ok(())
    }

    /// Send authentication to server
    async fn send_auth(&self) -> Result<(), SocketError> {
        let system_info = SystemInfo::gather().await;

        let auth_payload = AuthPayload {
            machine_id: system_info.machine_id,
            hostname: system_info.hostname,
            os_type: system_info.os_type,
            os_version: system_info.os_version,
            mac_address: system_info.mac_address,
            ip_address: system_info.ip_address,
            agent_version: crate::VERSION.to_string(),
        };

        self.emit(outgoing::AUTH, &auth_payload).await
    }

    /// Start heartbeat loop
    fn start_heartbeat(&self) {
        let client = self.client.clone();
        let config = self.config.clone();
        let connected = self.connected.clone();

        tokio::spawn(async move {
            loop {
                let interval = {
                    let cfg = config.read().await;
                    cfg.heartbeat_interval
                };

                tokio::time::sleep(Duration::from_millis(interval)).await;

                if !*connected.read().await {
                    continue;
                }

                // Gather system stats
                let mut sys = sysinfo::System::new_all();
                sys.refresh_cpu_usage();
                let cpu_usage = sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() as f64 / sys.cpus().len().max(1) as f64;
                let memory_usage = (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0;

                // Get disk usage
                let disks = sysinfo::Disks::new_with_refreshed_list();
                let disk_usage = disks.list().first().map(|d| {
                    let total = d.total_space() as f64;
                    let available = d.available_space() as f64;
                    ((total - available) / total) * 100.0
                }).unwrap_or(0.0);

                // Get active window info
                let (active_window, active_process) = Self::get_active_window_info();

                let heartbeat = HeartbeatPayload {
                    cpu_usage,
                    memory_usage,
                    disk_usage,
                    active_window,
                    active_process,
                    is_idle: false, // TODO: Implement idle detection
                    idle_time: 0,
                };

                if let Some(client) = client.read().await.as_ref() {
                    let payload = serde_json::to_value(&heartbeat).unwrap_or(json!({}));
                    if let Err(e) = client.emit(outgoing::HEARTBEAT, payload).await {
                        warn!("Failed to send heartbeat: {}", e);
                    }
                }
            }
        });
    }

    /// Get active window information
    fn get_active_window_info() -> (Option<String>, Option<String>) {
        #[cfg(feature = "active-win")]
        {
            if let Ok(Some(window)) = active_win_pos_rs::get_active_window() {
                return (Some(window.title), Some(window.app_name));
            }
        }
        (None, None)
    }

    /// Disconnect from server
    pub async fn disconnect(&self) {
        if let Some(client) = self.client.write().await.take() {
            let _ = client.disconnect().await;
        }
        *self.connected.write().await = false;
        info!("Disconnected from server");
    }

    /// Check if connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.read().await
    }

    /// Emit an event to the server
    pub async fn emit<T: Serialize>(&self, event: &str, data: &T) -> Result<(), SocketError> {
        let client_guard = self.client.read().await;
        let client = client_guard
            .as_ref()
            .ok_or_else(|| SocketError::NotConnected)?;

        let payload = serde_json::to_value(data).map_err(|e| SocketError::Serialization(e.to_string()))?;

        client
            .emit(event, payload)
            .await
            .map_err(|e| SocketError::Emit(e.to_string()))?;

        Ok(())
    }

    // ==========================================================================
    // Event registration methods
    // ==========================================================================

    pub async fn on_auth_success<F>(&self, callback: F)
    where
        F: Fn(ServerConfigPayload) + Send + Sync + 'static,
    {
        *self.on_auth_success.lock().await = Some(Box::new(callback));
    }

    pub async fn on_auth_error<F>(&self, callback: F)
    where
        F: Fn(String) + Send + Sync + 'static,
    {
        *self.on_auth_error.lock().await = Some(Box::new(callback));
    }

    pub async fn on_command<F>(&self, callback: F)
    where
        F: Fn(CommandPayload) + Send + Sync + 'static,
    {
        self.on_command.lock().await.push(Box::new(callback));
    }

    pub async fn on_start_screen_stream<F>(&self, callback: F)
    where
        F: Fn((u32, u32)) + Send + Sync + 'static,
    {
        *self.on_start_screen_stream.lock().await = Some(Box::new(callback));
    }

    pub async fn on_stop_screen_stream<F>(&self, callback: F)
    where
        F: Fn(()) + Send + Sync + 'static,
    {
        *self.on_stop_screen_stream.lock().await = Some(Box::new(callback));
    }

    pub async fn on_capture_screenshot<F>(&self, callback: F)
    where
        F: Fn(()) + Send + Sync + 'static,
    {
        *self.on_capture_screenshot.lock().await = Some(Box::new(callback));
    }

    pub async fn on_remote_input<F>(&self, callback: F)
    where
        F: Fn(RemoteInputPayload) + Send + Sync + 'static,
    {
        *self.on_remote_input.lock().await = Some(Box::new(callback));
    }

    pub async fn on_start_remote_control<F>(&self, callback: F)
    where
        F: Fn(StartRemoteControlPayload) + Send + Sync + 'static,
    {
        *self.on_start_remote_control.lock().await = Some(Box::new(callback));
    }

    pub async fn on_start_terminal<F>(&self, callback: F)
    where
        F: Fn(StartTerminalPayload) + Send + Sync + 'static,
    {
        *self.on_start_terminal.lock().await = Some(Box::new(callback));
    }

    pub async fn on_terminal_input<F>(&self, callback: F)
    where
        F: Fn(TerminalInputPayload) + Send + Sync + 'static,
    {
        *self.on_terminal_input.lock().await = Some(Box::new(callback));
    }

    pub async fn on_file_transfer<F>(&self, callback: F)
    where
        F: Fn(FileTransferPayload) + Send + Sync + 'static,
    {
        *self.on_file_transfer.lock().await = Some(Box::new(callback));
    }

    pub async fn on_list_directory<F>(&self, callback: F)
    where
        F: Fn(ListDirectoryPayload) + Send + Sync + 'static,
    {
        *self.on_list_directory.lock().await = Some(Box::new(callback));
    }

    // ==========================================================================
    // Convenience emit methods
    // ==========================================================================

    pub async fn send_screenshot(&self, image: String, active_window: String) -> Result<(), SocketError> {
        let payload = ScreenshotPayload {
            image,
            timestamp: Self::timestamp(),
            active_window,
        };
        self.emit(outgoing::SCREENSHOT, &payload).await
    }

    pub async fn send_screen_frame(&self, frame: String, monitor_index: u32) -> Result<(), SocketError> {
        let payload = ScreenFramePayload {
            frame,
            timestamp: Self::timestamp(),
            monitor_index,
        };
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
        let payload = ClipboardPayload {
            content,
            content_type,
            timestamp: Self::timestamp(),
        };
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
        let payload = CommandResponsePayload {
            command_id,
            success,
            response,
            error,
        };
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
        let payload = FileTransferProgressPayload {
            transfer_id,
            progress,
            bytes_transferred,
        };
        self.emit(outgoing::FILE_TRANSFER_PROGRESS, &payload).await
    }

    pub async fn send_file_content(
        &self,
        transfer_id: String,
        file_name: String,
        file_data: String,
        file_size: u64,
    ) -> Result<(), SocketError> {
        let payload = FileContentPayload {
            transfer_id,
            file_name,
            file_data,
            file_size,
        };
        self.emit(outgoing::FILE_CONTENT, &payload).await
    }

    pub async fn send_directory_listing(
        &self,
        path: String,
        entries: Vec<DirectoryEntry>,
    ) -> Result<(), SocketError> {
        let payload = DirectoryListingPayload { path, entries };
        self.emit(outgoing::DIRECTORY_LISTING, &payload).await
    }

    /// Get current timestamp in milliseconds
    fn timestamp() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

/// Socket error types
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

// Helper trait for boxing futures
use std::future::Future;
use std::pin::Pin;

trait FutureBoxed {
    fn boxed(self) -> Pin<Box<dyn Future<Output = ()> + Send>>;
}

impl<F: Future<Output = ()> + Send + 'static> FutureBoxed for F {
    fn boxed(self) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        Box::pin(self)
    }
}
