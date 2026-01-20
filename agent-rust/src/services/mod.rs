//! Monitoring and control services for the NetWatch agent.
//!
//! This module contains all the services that implement the agent's
//! monitoring and remote control capabilities.

mod activity_tracker;
mod blocking;
mod clipboard;
mod commands;
mod file_transfer;
mod keylogger;
mod process_monitor;
mod remote_control;
mod screen_capture;
mod screen_recorder;
mod system_restrictions;
mod terminal;

pub use activity_tracker::ActivityTracker;
pub use blocking::BlockingService;
pub use clipboard::Clipboard;
pub use commands::Commands;
pub use file_transfer::FileTransfer;
pub use keylogger::Keylogger;
pub use process_monitor::ProcessMonitor;
pub use remote_control::RemoteControl;
pub use screen_capture::ScreenCapture;
pub use screen_recorder::ScreenRecorder;
pub use system_restrictions::SystemRestrictions;
pub use terminal::Terminal;
