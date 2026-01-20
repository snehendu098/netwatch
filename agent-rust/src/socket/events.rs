//! Socket event types and payload structures.
//!
//! Defines all the event types and data structures used for
//! communication between the agent and server.

use serde::{Deserialize, Serialize};

// =============================================================================
// Agent → Server Events
// =============================================================================

/// Authentication payload sent to server
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthPayload {
    pub machine_id: String,
    pub hostname: String,
    pub os_type: String,
    pub os_version: String,
    pub mac_address: String,
    pub ip_address: String,
    pub agent_version: String,
}

/// Heartbeat data sent periodically
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatPayload {
    pub cpu_usage: f64,
    pub memory_usage: f64,
    pub disk_usage: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_window: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_process: Option<String>,
    pub is_idle: bool,
    pub idle_time: u64,
}

/// Screenshot data
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotPayload {
    pub image: String,
    pub timestamp: u64,
    pub active_window: String,
}

/// Screen streaming frame
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenFramePayload {
    pub frame: String,
    pub timestamp: u64,
    pub monitor_index: u32,
}

/// Activity log entry
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLogEntry {
    pub application_name: String,
    pub window_title: String,
    pub start_time: u64,
    pub end_time: u64,
    pub duration: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

/// Activity log payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLogPayload {
    pub logs: Vec<ActivityLogEntry>,
}

/// Keystroke entry
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystrokeEntry {
    pub keys: String,
    pub application_name: String,
    pub window_title: String,
    pub timestamp: u64,
}

/// Keystrokes payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystrokesPayload {
    pub strokes: Vec<KeystrokeEntry>,
}

/// Clipboard data
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPayload {
    pub content: String,
    pub content_type: String,
    pub timestamp: u64,
}

/// Process information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub process_name: String,
    pub process_id: u32,
    pub path: String,
    pub cpu_usage: f64,
    pub memory_usage: u64,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
}

/// Process list payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessListPayload {
    pub processes: Vec<ProcessInfo>,
}

/// Command response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponsePayload {
    pub command_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Terminal output
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub output: String,
}

/// File transfer progress
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTransferProgressPayload {
    pub transfer_id: String,
    pub progress: u32,
    pub bytes_transferred: u64,
}

/// File content payload (for downloads)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentPayload {
    pub transfer_id: String,
    pub file_name: String,
    pub file_data: String,
    pub file_size: u64,
}

/// Directory listing entry
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub modified: u64,
}

/// Directory listing payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListingPayload {
    pub path: String,
    pub entries: Vec<DirectoryEntry>,
}

// =============================================================================
// Server → Agent Events
// =============================================================================

/// Authentication success response
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSuccessPayload {
    pub computer_id: String,
    #[serde(default)]
    pub config: Option<ServerConfigPayload>,
}

/// Server configuration
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfigPayload {
    pub screenshot_interval: Option<u64>,
    pub activity_log_interval: Option<u64>,
    pub keystroke_buffer_size: Option<usize>,
}

/// Authentication error response
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthErrorPayload {
    pub message: String,
}

/// Command from server
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPayload {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub payload: Option<serde_json::Value>,
}

/// Screen stream start request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartScreenStreamPayload {
    pub quality: u32,
    pub fps: u32,
}

/// Remote input event
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInputPayload {
    #[serde(rename = "type")]
    pub input_type: String,
    pub event: serde_json::Value,
}

/// Remote control session start
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRemoteControlPayload {
    pub session_id: String,
    pub mode: String,
    #[serde(default = "default_quality")]
    pub quality: u32,
    #[serde(default = "default_fps")]
    pub fps: u32,
}

fn default_quality() -> u32 {
    60
}

fn default_fps() -> u32 {
    10
}

/// Terminal session start request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTerminalPayload {
    pub session_id: String,
    pub shell: Option<String>,
}

/// Terminal input
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInputPayload {
    pub session_id: String,
    pub input: String,
}

/// File transfer request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTransferPayload {
    pub transfer_id: String,
    pub direction: String,
    pub remote_path: String,
    pub file_data: Option<String>,
}

/// List directory request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirectoryPayload {
    pub path: String,
}

// =============================================================================
// Mouse and Keyboard Events (for remote control)
// =============================================================================

/// Mouse event types
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseEventType {
    Move,
    Click,
    Scroll,
    Drag,
}

/// Mouse event data
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MouseEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub x: i32,
    pub y: i32,
    pub button: Option<String>,
    pub click_type: Option<String>,
    pub scroll_x: Option<i32>,
    pub scroll_y: Option<i32>,
}

/// Keyboard event types
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeyboardEventType {
    Keydown,
    Keyup,
    Type,
}

/// Keyboard modifiers
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KeyModifiers {
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub meta: bool,
}

/// Keyboard event data
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub key: Option<String>,
    pub key_code: Option<u32>,
    pub text: Option<String>,
    #[serde(default)]
    pub modifiers: KeyModifiers,
}

// =============================================================================
// Event Names
// =============================================================================

/// Socket event names (agent → server)
pub mod outgoing {
    pub const AUTH: &str = "auth";
    pub const HEARTBEAT: &str = "heartbeat";
    pub const SCREENSHOT: &str = "screenshot";
    pub const SCREEN_FRAME: &str = "screen_frame";
    pub const ACTIVITY_LOG: &str = "activity_log";
    pub const KEYSTROKES: &str = "keystrokes";
    pub const CLIPBOARD: &str = "clipboard";
    pub const PROCESS_LIST: &str = "process_list";
    pub const COMMAND_RESPONSE: &str = "command_response";
    pub const TERMINAL_OUTPUT: &str = "terminal_output";
    pub const FILE_TRANSFER_PROGRESS: &str = "file_transfer_progress";
    pub const FILE_CONTENT: &str = "file_content";
    pub const DIRECTORY_LISTING: &str = "directory_listing";
}

/// Socket event names (server → agent)
pub mod incoming {
    pub const AUTH_SUCCESS: &str = "auth_success";
    pub const AUTH_ERROR: &str = "auth_error";
    pub const COMMAND: &str = "command";
    pub const START_SCREEN_STREAM: &str = "start_screen_stream";
    pub const STOP_SCREEN_STREAM: &str = "stop_screen_stream";
    pub const CAPTURE_SCREENSHOT: &str = "capture_screenshot";
    pub const REMOTE_INPUT: &str = "remote_input";
    pub const START_REMOTE_CONTROL: &str = "start_remote_control";
    pub const START_TERMINAL: &str = "start_terminal";
    pub const TERMINAL_INPUT: &str = "terminal_input";
    pub const FILE_TRANSFER: &str = "file_transfer";
    pub const LIST_DIRECTORY: &str = "list_directory";
}
