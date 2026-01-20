//! NetWatch Agent - Main Entry Point
//!
//! A lightweight monitoring agent written in Rust for improved reliability,
//! performance, and smaller binary size compared to the Electron version.

use netwatch_agent::{
    config::Config,
    services::{
        ActivityTracker, BlockingService, Clipboard, Commands, FileTransfer, Keylogger,
        ProcessMonitor, RemoteControl, ScreenCapture, ScreenRecorder, SystemRestrictions,
        Terminal,
    },
    socket::SocketClient,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Application state shared across services
pub struct AppState {
    pub socket: Arc<SocketClient>,
    pub config: Arc<RwLock<Config>>,
    pub is_monitoring: Arc<RwLock<bool>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("netwatch_agent=info".parse()?))
        .init();

    info!("NetWatch Agent v{} starting...", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let config = match Config::load() {
        Ok(cfg) => {
            info!("Configuration loaded successfully");
            cfg
        }
        Err(e) => {
            warn!("Failed to load config, using defaults: {}", e);
            Config::default()
        }
    };

    // Check if server URL is configured
    if config.server_url.is_empty() {
        error!("No server URL configured. Please set NETWATCH_SERVER_URL or configure config.json");
        error!("Example: NETWATCH_SERVER_URL=https://your-server.com cargo run");
        std::process::exit(1);
    }

    let config = Arc::new(RwLock::new(config));

    // Create socket client
    let socket = Arc::new(SocketClient::new(config.clone()));
    let is_monitoring = Arc::new(RwLock::new(false));

    let app_state = Arc::new(AppState {
        socket: socket.clone(),
        config: config.clone(),
        is_monitoring: is_monitoring.clone(),
    });

    // Connect to server
    info!("Connecting to server...");
    if let Err(e) = socket.connect().await {
        error!("Failed to connect to server: {}", e);
        std::process::exit(1);
    }

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

    // Handle graceful shutdown
    let shutdown_socket = socket.clone();
    let shutdown_screen = screen_capture.clone();
    let shutdown_activity = activity_tracker.clone();
    let shutdown_keylogger = keylogger.clone();
    let shutdown_clipboard = clipboard.clone();
    let shutdown_process = process_monitor.clone();
    let shutdown_terminal = terminal.clone();
    let shutdown_blocking = blocking_service.clone();

    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C handler");

        info!("Shutting down...");

        // Stop all services
        shutdown_screen.stop().await;
        shutdown_activity.stop().await;
        shutdown_keylogger.stop().await;
        shutdown_clipboard.stop().await;
        shutdown_process.stop().await;
        shutdown_terminal.stop_all().await;
        shutdown_blocking.stop().await;

        // Disconnect socket
        shutdown_socket.disconnect().await;

        info!("NetWatch Agent stopped");
        std::process::exit(0);
    });

    // Keep the main task running
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

        // Check connection and attempt reconnect if needed
        if !socket.is_connected().await {
            warn!("Connection lost, attempting to reconnect...");
            if let Err(e) = socket.connect().await {
                error!("Reconnection failed: {}", e);
            } else {
                info!("Reconnected successfully");
            }
        }
    }
}
