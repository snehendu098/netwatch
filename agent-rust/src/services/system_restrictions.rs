//! System restrictions service.
//!
//! Provides system-level restrictions like disabling Task Manager,
//! Command Prompt, USB storage, printing, etc.

use crate::socket::SocketClient;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

/// Restriction settings
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestrictionSettings {
    #[serde(default)]
    pub disable_task_manager: bool,
    #[serde(default)]
    pub disable_command_prompt: bool,
    #[serde(default)]
    pub disable_control_panel: bool,
    #[serde(default)]
    pub disable_usb: bool,
    #[serde(default)]
    pub disable_printing: bool,
    #[serde(default)]
    pub disable_registry_editor: bool,
}

/// System restrictions service
#[derive(Clone)]
pub struct SystemRestrictions {
    socket: Arc<SocketClient>,
    current_settings: Arc<RwLock<RestrictionSettings>>,
}

impl SystemRestrictions {
    /// Create a new system restrictions service
    pub fn new(socket: Arc<SocketClient>) -> Self {
        Self {
            socket,
            current_settings: Arc::new(RwLock::new(RestrictionSettings::default())),
        }
    }

    /// Register event handlers
    pub async fn register_handlers(&self, socket: &SocketClient) {
        let service = self.clone();

        socket
            .on_command(move |data| {
                let svc = service.clone();

                tokio::spawn(async move {
                    match data.command.as_str() {
                        "SET_RESTRICTIONS" => {
                            if let Some(payload) = &data.payload {
                                if let Ok(settings) =
                                    serde_json::from_value::<RestrictionSettings>(payload.clone())
                                {
                                    match svc.apply_restrictions(&settings).await {
                                        Ok(_) => {
                                            let _ = svc
                                                .socket
                                                .send_command_response(
                                                    data.id,
                                                    true,
                                                    Some("Restrictions applied".to_string()),
                                                    None,
                                                )
                                                .await;
                                        }
                                        Err(e) => {
                                            let _ = svc
                                                .socket
                                                .send_command_response(
                                                    data.id,
                                                    false,
                                                    None,
                                                    Some(e),
                                                )
                                                .await;
                                        }
                                    }
                                }
                            }
                        }
                        "GET_RESTRICTIONS" => {
                            let settings = svc.get_settings().await;
                            let _ = svc
                                .socket
                                .send_command_response(
                                    data.id,
                                    true,
                                    Some(serde_json::to_string(&settings).unwrap_or_default()),
                                    None,
                                )
                                .await;
                        }
                        "REMOVE_RESTRICTIONS" => {
                            match svc.remove_all_restrictions().await {
                                Ok(_) => {
                                    let _ = svc
                                        .socket
                                        .send_command_response(
                                            data.id,
                                            true,
                                            Some("All restrictions removed".to_string()),
                                            None,
                                        )
                                        .await;
                                }
                                Err(e) => {
                                    let _ = svc
                                        .socket
                                        .send_command_response(data.id, false, None, Some(e))
                                        .await;
                                }
                            }
                        }
                        _ => {}
                    }
                });
            })
            .await;

        info!("System restrictions handlers registered");
    }

    /// Apply restrictions
    pub async fn apply_restrictions(&self, settings: &RestrictionSettings) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            self.apply_windows_restrictions(settings).await?;
        }

        #[cfg(target_os = "macos")]
        {
            self.apply_macos_restrictions(settings).await?;
        }

        #[cfg(target_os = "linux")]
        {
            self.apply_linux_restrictions(settings).await?;
        }

        // Update current settings
        *self.current_settings.write().await = settings.clone();

        Ok(())
    }

    /// Apply Windows-specific restrictions
    #[cfg(target_os = "windows")]
    async fn apply_windows_restrictions(&self, settings: &RestrictionSettings) -> Result<(), String> {
        // Disable Task Manager
        if settings.disable_task_manager {
            Self::run_reg_command(
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System",
                "DisableTaskMgr",
                "1",
            )?;
        } else {
            Self::run_reg_command(
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System",
                "DisableTaskMgr",
                "0",
            )?;
        }

        // Disable Command Prompt
        if settings.disable_command_prompt {
            Self::run_reg_command(
                r"HKCU\Software\Policies\Microsoft\Windows\System",
                "DisableCMD",
                "1",
            )?;
        } else {
            Self::run_reg_command(
                r"HKCU\Software\Policies\Microsoft\Windows\System",
                "DisableCMD",
                "0",
            )?;
        }

        // Disable Control Panel
        if settings.disable_control_panel {
            Self::run_reg_command(
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer",
                "NoControlPanel",
                "1",
            )?;
        } else {
            Self::run_reg_command(
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer",
                "NoControlPanel",
                "0",
            )?;
        }

        // Disable Registry Editor
        if settings.disable_registry_editor {
            Self::run_reg_command(
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System",
                "DisableRegistryTools",
                "1",
            )?;
        } else {
            Self::run_reg_command(
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System",
                "DisableRegistryTools",
                "0",
            )?;
        }

        // Disable USB Storage (requires admin)
        if settings.disable_usb {
            Self::run_reg_command(
                r"HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR",
                "Start",
                "4", // 4 = Disabled
            )?;
        } else {
            Self::run_reg_command(
                r"HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR",
                "Start",
                "3", // 3 = Manual/Enabled
            )?;
        }

        // Disable Printing
        if settings.disable_printing {
            let _ = Command::new("net").args(["stop", "spooler"]).output();
        } else {
            let _ = Command::new("net").args(["start", "spooler"]).output();
        }

        info!("Windows restrictions applied");
        Ok(())
    }

    #[cfg(target_os = "windows")]
    fn run_reg_command(key: &str, value: &str, data: &str) -> Result<(), String> {
        let output = Command::new("reg")
            .args([
                "add",
                key,
                "/v",
                value,
                "/t",
                "REG_DWORD",
                "/d",
                data,
                "/f",
            ])
            .output()
            .map_err(|e| format!("Failed to execute reg command: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!("Registry command warning: {}", stderr);
            // Don't fail on registry errors, just warn
            Ok(())
        }
    }

    /// Apply macOS-specific restrictions
    #[cfg(target_os = "macos")]
    async fn apply_macos_restrictions(&self, settings: &RestrictionSettings) -> Result<(), String> {
        // Disable USB Storage
        if settings.disable_usb {
            let _ = Command::new("sudo")
                .args([
                    "kextunload",
                    "/System/Library/Extensions/IOUSBMassStorageClass.kext",
                ])
                .output();
        } else {
            let _ = Command::new("sudo")
                .args([
                    "kextload",
                    "/System/Library/Extensions/IOUSBMassStorageClass.kext",
                ])
                .output();
        }

        // Disable Printing
        if settings.disable_printing {
            let _ = Command::new("sudo")
                .args([
                    "launchctl",
                    "unload",
                    "/System/Library/LaunchDaemons/org.cups.cupsd.plist",
                ])
                .output();
        } else {
            let _ = Command::new("sudo")
                .args([
                    "launchctl",
                    "load",
                    "/System/Library/LaunchDaemons/org.cups.cupsd.plist",
                ])
                .output();
        }

        // Note: Task Manager, Command Prompt, etc. don't have direct macOS equivalents
        // These would require MDM profiles for proper implementation

        info!("macOS restrictions applied");
        Ok(())
    }

    /// Apply Linux-specific restrictions
    #[cfg(target_os = "linux")]
    async fn apply_linux_restrictions(&self, settings: &RestrictionSettings) -> Result<(), String> {
        // Disable USB Storage
        if settings.disable_usb {
            let _ = Command::new("sudo")
                .args(["modprobe", "-r", "usb_storage"])
                .output();
            // Add to blacklist
            let _ = Command::new("sh")
                .args([
                    "-c",
                    "echo 'blacklist usb_storage' | sudo tee /etc/modprobe.d/disable-usb-storage.conf",
                ])
                .output();
        } else {
            let _ = Command::new("sudo")
                .args(["modprobe", "usb_storage"])
                .output();
            let _ = Command::new("sudo")
                .args(["rm", "-f", "/etc/modprobe.d/disable-usb-storage.conf"])
                .output();
        }

        // Disable Printing
        if settings.disable_printing {
            let _ = Command::new("sudo")
                .args(["systemctl", "stop", "cups"])
                .output();
            let _ = Command::new("sudo")
                .args(["systemctl", "disable", "cups"])
                .output();
        } else {
            let _ = Command::new("sudo")
                .args(["systemctl", "enable", "cups"])
                .output();
            let _ = Command::new("sudo")
                .args(["systemctl", "start", "cups"])
                .output();
        }

        info!("Linux restrictions applied");
        Ok(())
    }

    // Stub implementations for non-matching platforms
    #[cfg(not(target_os = "windows"))]
    async fn apply_windows_restrictions(&self, _settings: &RestrictionSettings) -> Result<(), String> {
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    async fn apply_macos_restrictions(&self, _settings: &RestrictionSettings) -> Result<(), String> {
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    async fn apply_linux_restrictions(&self, _settings: &RestrictionSettings) -> Result<(), String> {
        Ok(())
    }

    /// Remove all restrictions
    pub async fn remove_all_restrictions(&self) -> Result<(), String> {
        let default_settings = RestrictionSettings {
            disable_task_manager: false,
            disable_command_prompt: false,
            disable_control_panel: false,
            disable_usb: false,
            disable_printing: false,
            disable_registry_editor: false,
        };

        self.apply_restrictions(&default_settings).await
    }

    /// Get current settings
    pub async fn get_settings(&self) -> RestrictionSettings {
        self.current_settings.read().await.clone()
    }
}
