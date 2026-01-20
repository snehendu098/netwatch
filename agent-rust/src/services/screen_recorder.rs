//! Screen recording service.
//!
//! Provides screen recording capabilities using FFmpeg for video encoding.
//! Supports scheduled and on-demand recording with configurable quality.

use crate::socket::SocketClient;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Recording session info
#[derive(Debug, Clone)]
struct RecordingSession {
    id: String,
    start_time: u64,
    output_path: PathBuf,
    is_recording: bool,
}

/// Screen recorder service
#[derive(Clone)]
pub struct ScreenRecorder {
    socket: Arc<SocketClient>,
    session: Arc<RwLock<Option<RecordingSession>>>,
    ffmpeg_process: Arc<RwLock<Option<u32>>>, // Store PID instead of Child
    recordings_dir: PathBuf,
}

impl ScreenRecorder {
    /// Create a new screen recorder
    pub fn new(socket: Arc<SocketClient>) -> Self {
        let recordings_dir = Self::get_recordings_dir();

        // Ensure recordings directory exists
        if let Err(e) = fs::create_dir_all(&recordings_dir) {
            warn!("Failed to create recordings directory: {}", e);
        }

        Self {
            socket,
            session: Arc::new(RwLock::new(None)),
            ffmpeg_process: Arc::new(RwLock::new(None)),
            recordings_dir,
        }
    }

    /// Get recordings directory
    fn get_recordings_dir() -> PathBuf {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        home.join(".netwatch").join("recordings")
    }

    /// Register event handlers
    pub async fn register_handlers(&self, socket: &SocketClient) {
        let recorder = self.clone();

        socket
            .on_command(move |data| {
                let rec = recorder.clone();

                tokio::spawn(async move {
                    match data.command.as_str() {
                        "START_RECORDING" => {
                            match rec.start_recording().await {
                                Ok(recording_id) => {
                                    let _ = rec
                                        .socket
                                        .send_command_response(
                                            data.id,
                                            true,
                                            Some(recording_id),
                                            None,
                                        )
                                        .await;
                                }
                                Err(e) => {
                                    let _ = rec
                                        .socket
                                        .send_command_response(data.id, false, None, Some(e))
                                        .await;
                                }
                            }
                        }
                        "STOP_RECORDING" => {
                            match rec.stop_recording().await {
                                Ok(result) => {
                                    let _ = rec
                                        .socket
                                        .send_command_response(
                                            data.id,
                                            true,
                                            Some(serde_json::to_string(&result).unwrap_or_default()),
                                            None,
                                        )
                                        .await;
                                }
                                Err(e) => {
                                    let _ = rec
                                        .socket
                                        .send_command_response(data.id, false, None, Some(e))
                                        .await;
                                }
                            }
                        }
                        "GET_RECORDING_STATUS" => {
                            let status = rec.get_status().await;
                            let _ = rec
                                .socket
                                .send_command_response(
                                    data.id,
                                    true,
                                    Some(serde_json::to_string(&status).unwrap_or_default()),
                                    None,
                                )
                                .await;
                        }
                        _ => {}
                    }
                });
            })
            .await;

        info!("Screen recorder handlers registered");
    }

    /// Check if FFmpeg is available
    fn check_ffmpeg() -> bool {
        Command::new("ffmpeg")
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    /// Get FFmpeg input for screen capture
    fn get_ffmpeg_input() -> Vec<String> {
        #[cfg(target_os = "macos")]
        {
            // macOS uses avfoundation
            vec![
                "-f".to_string(),
                "avfoundation".to_string(),
                "-capture_cursor".to_string(),
                "1".to_string(),
                "-i".to_string(),
                "1:none".to_string(), // Screen 1, no audio
            ]
        }

        #[cfg(target_os = "windows")]
        {
            // Windows uses gdigrab or dshow
            vec![
                "-f".to_string(),
                "gdigrab".to_string(),
                "-framerate".to_string(),
                "15".to_string(),
                "-i".to_string(),
                "desktop".to_string(),
            ]
        }

        #[cfg(target_os = "linux")]
        {
            // Linux uses x11grab
            // Get display from environment or default to :0
            let display = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string());
            vec![
                "-f".to_string(),
                "x11grab".to_string(),
                "-framerate".to_string(),
                "15".to_string(),
                "-i".to_string(),
                display,
            ]
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            vec![]
        }
    }

    /// Start recording
    pub async fn start_recording(&self) -> Result<String, String> {
        // Check if already recording
        if let Some(session) = self.session.read().await.as_ref() {
            if session.is_recording {
                return Err("Recording already in progress".to_string());
            }
        }

        // Check FFmpeg availability
        if !Self::check_ffmpeg() {
            return Err("FFmpeg not found. Please install FFmpeg to enable screen recording.".to_string());
        }

        let recording_id = format!(
            "rec_{}_{}",
            chrono::Utc::now().timestamp_millis(),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("0")
        );

        let output_path = self.recordings_dir.join(format!("{}.mp4", recording_id));

        // Build FFmpeg command
        let mut args: Vec<String> = vec![
            "-y".to_string(), // Overwrite output
        ];

        // Add platform-specific input
        args.extend(Self::get_ffmpeg_input());

        // Add output settings
        args.extend(vec![
            "-c:v".to_string(),
            "libx264".to_string(),
            "-preset".to_string(),
            "ultrafast".to_string(),
            "-crf".to_string(),
            "28".to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-r".to_string(),
            "15".to_string(),
            output_path.to_string_lossy().to_string(),
        ]);

        // Start FFmpeg process
        let child = Command::new("ffmpeg")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

        let pid = child.id();

        // Store session info
        *self.session.write().await = Some(RecordingSession {
            id: recording_id.clone(),
            start_time: chrono::Utc::now().timestamp_millis() as u64,
            output_path: output_path.clone(),
            is_recording: true,
        });

        *self.ffmpeg_process.write().await = Some(pid);

        // Notify server
        let status_payload = serde_json::json!({
            "recordingId": recording_id,
            "status": "RECORDING"
        });
        let _ = self.socket.emit("recording_status", &status_payload).await;

        info!("Recording started: {}", recording_id);
        Ok(recording_id)
    }

    /// Stop recording
    pub async fn stop_recording(&self) -> Result<serde_json::Value, String> {
        let session = self.session.read().await.clone();

        let session = match session {
            Some(s) if s.is_recording => s,
            _ => return Err("No recording in progress".to_string()),
        };

        // Stop FFmpeg process
        if let Some(pid) = self.ffmpeg_process.write().await.take() {
            // Send SIGTERM/SIGINT to gracefully stop FFmpeg
            #[cfg(unix)]
            {
                use std::process::Command;
                let _ = Command::new("kill")
                    .args(["-SIGINT", &pid.to_string()])
                    .output();
            }

            #[cfg(windows)]
            {
                use std::process::Command;
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/F"])
                    .output();
            }

            // Wait a bit for FFmpeg to finish writing
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }

        // Calculate duration
        let duration = (chrono::Utc::now().timestamp_millis() as u64 - session.start_time) / 1000;

        // Get file size
        let file_size = fs::metadata(&session.output_path)
            .map(|m| m.len())
            .unwrap_or(0);

        // Clear session
        *self.session.write().await = None;

        // Notify server
        let complete_payload = serde_json::json!({
            "recordingId": session.id,
            "filePath": session.output_path.to_string_lossy(),
            "duration": duration,
            "fileSize": file_size
        });
        let _ = self.socket.emit("recording_complete", &complete_payload).await;

        info!("Recording stopped: {}", session.id);

        // Upload recording in background
        let socket = self.socket.clone();
        let recording_id = session.id.clone();
        let output_path = session.output_path.clone();

        tokio::spawn(async move {
            if let Err(e) = Self::upload_recording(&socket, &recording_id, &output_path).await {
                error!("Failed to upload recording: {}", e);
            }
        });

        Ok(serde_json::json!({
            "id": session.id,
            "filePath": session.output_path.to_string_lossy(),
            "duration": duration,
            "fileSize": file_size
        }))
    }

    /// Upload recording to server
    async fn upload_recording(
        socket: &SocketClient,
        recording_id: &str,
        path: &PathBuf,
    ) -> Result<(), String> {
        let data = fs::read(path).map_err(|e| format!("Failed to read recording: {}", e))?;

        let base64_data = BASE64.encode(&data);
        let chunk_size = 1024 * 1024; // 1MB chunks
        let total_chunks = (base64_data.len() + chunk_size - 1) / chunk_size;

        for i in 0..total_chunks {
            let start = i * chunk_size;
            let end = std::cmp::min(start + chunk_size, base64_data.len());
            let chunk = &base64_data[start..end];

            let chunk_payload = serde_json::json!({
                "recordingId": recording_id,
                "chunk": chunk,
                "chunkIndex": i,
                "totalChunks": total_chunks
            });
            let _ = socket.emit("recording_chunk", &chunk_payload).await;

            // Small delay between chunks
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        info!("Recording {} uploaded successfully", recording_id);
        Ok(())
    }

    /// Get recording status
    pub async fn get_status(&self) -> serde_json::Value {
        let session = self.session.read().await;

        match session.as_ref() {
            Some(s) if s.is_recording => {
                let duration = (chrono::Utc::now().timestamp_millis() as u64 - s.start_time) / 1000;
                serde_json::json!({
                    "isRecording": true,
                    "recordingId": s.id,
                    "duration": duration
                })
            }
            _ => {
                serde_json::json!({
                    "isRecording": false,
                    "recordingId": null,
                    "duration": 0
                })
            }
        }
    }

    /// Check if currently recording
    pub async fn is_recording(&self) -> bool {
        self.session
            .read()
            .await
            .as_ref()
            .map(|s| s.is_recording)
            .unwrap_or(false)
    }

    /// Clean up old recordings (older than 7 days)
    pub fn cleanup_old_recordings(&self) {
        let week_ago = chrono::Utc::now().timestamp_millis() as u64 - 7 * 24 * 60 * 60 * 1000;

        if let Ok(entries) = fs::read_dir(&self.recordings_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        let modified_ms = modified
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis() as u64)
                            .unwrap_or(0);

                        if modified_ms < week_ago {
                            if let Err(e) = fs::remove_file(entry.path()) {
                                warn!("Failed to delete old recording: {}", e);
                            } else {
                                info!("Deleted old recording: {:?}", entry.path());
                            }
                        }
                    }
                }
            }
        }
    }
}
