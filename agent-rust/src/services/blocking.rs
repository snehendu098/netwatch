//! Blocking service for website and application control.
//!
//! Provides website blocking via hosts file modification and
//! application blocking by monitoring and terminating blocked processes.

use crate::socket::SocketClient;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use sysinfo::System;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Blocking rule
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockingRule {
    pub id: String,
    #[serde(rename = "type")]
    pub rule_type: String, // "website" or "application"
    pub pattern: String,
    pub mode: String, // "block" or "allow"
    pub active: bool,
}

/// Blocking service
#[derive(Clone)]
pub struct BlockingService {
    socket: Arc<SocketClient>,
    website_rules: Arc<RwLock<Vec<BlockingRule>>>,
    application_rules: Arc<RwLock<Vec<BlockingRule>>>,
    hosts_backup: Arc<RwLock<Option<String>>>,
    is_running: Arc<RwLock<bool>>,
    monitor_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl BlockingService {
    /// Create a new blocking service
    pub fn new(socket: Arc<SocketClient>) -> Self {
        Self {
            socket,
            website_rules: Arc::new(RwLock::new(Vec::new())),
            application_rules: Arc::new(RwLock::new(Vec::new())),
            hosts_backup: Arc::new(RwLock::new(None)),
            is_running: Arc::new(RwLock::new(false)),
            monitor_handle: Arc::new(RwLock::new(None)),
        }
    }

    /// Start the blocking service
    pub async fn start(&self) {
        if *self.is_running.read().await {
            return;
        }

        *self.is_running.write().await = true;

        let is_running = self.is_running.clone();
        let application_rules = self.application_rules.clone();

        let handle = tokio::spawn(async move {
            info!("Blocking service started");

            let mut system = System::new_all();

            loop {
                if !*is_running.read().await {
                    break;
                }

                // Enforce application blocking every 2 seconds
                Self::enforce_application_blocking(&mut system, &application_rules).await;

                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }

            info!("Blocking service stopped");
        });

        *self.monitor_handle.write().await = Some(handle);
    }

    /// Stop the blocking service
    pub async fn stop(&self) {
        *self.is_running.write().await = false;

        if let Some(handle) = self.monitor_handle.write().await.take() {
            handle.abort();
        }

        // Restore hosts file
        self.restore_hosts_file().await;
    }

    /// Register event handlers
    pub async fn register_handlers(&self, socket: &SocketClient) {
        let service = self.clone();

        socket
            .on_command(move |data| {
                let svc = service.clone();

                tokio::spawn(async move {
                    match data.command.as_str() {
                        "BLOCK_WEBSITE" => {
                            if let Some(payload) = &data.payload {
                                if let Some(domain) = payload.get("domain").and_then(|d| d.as_str()) {
                                    let success = svc.block_website(domain).await;
                                    let _ = svc.socket.send_command_response(
                                        data.id,
                                        success,
                                        if success { Some(format!("Website {} blocked", domain)) } else { None },
                                        if !success { Some("Failed to block website".to_string()) } else { None },
                                    ).await;
                                }
                            }
                        }
                        "UNBLOCK_WEBSITE" => {
                            if let Some(payload) = &data.payload {
                                if let Some(domain) = payload.get("domain").and_then(|d| d.as_str()) {
                                    let success = svc.unblock_website(domain).await;
                                    let _ = svc.socket.send_command_response(
                                        data.id,
                                        success,
                                        if success { Some(format!("Website {} unblocked", domain)) } else { None },
                                        if !success { Some("Failed to unblock website".to_string()) } else { None },
                                    ).await;
                                }
                            }
                        }
                        "BLOCK_APPLICATION" => {
                            if let Some(payload) = &data.payload {
                                if let Some(name) = payload.get("processName").and_then(|n| n.as_str()) {
                                    svc.block_application(name).await;
                                    let _ = svc.socket.send_command_response(
                                        data.id,
                                        true,
                                        Some(format!("Application {} blocked", name)),
                                        None,
                                    ).await;
                                }
                            }
                        }
                        "UNBLOCK_APPLICATION" => {
                            if let Some(payload) = &data.payload {
                                if let Some(name) = payload.get("processName").and_then(|n| n.as_str()) {
                                    svc.unblock_application(name).await;
                                    let _ = svc.socket.send_command_response(
                                        data.id,
                                        true,
                                        Some(format!("Application {} unblocked", name)),
                                        None,
                                    ).await;
                                }
                            }
                        }
                        "SET_BLOCKING_RULES" => {
                            if let Some(payload) = &data.payload {
                                if let Some(rules) = payload.get("rules") {
                                    if let Ok(rules) = serde_json::from_value::<Vec<BlockingRule>>(rules.clone()) {
                                        svc.set_rules(rules).await;
                                        let _ = svc.socket.send_command_response(
                                            data.id,
                                            true,
                                            Some("Blocking rules applied".to_string()),
                                            None,
                                        ).await;
                                    }
                                }
                            }
                        }
                        "GET_BLOCKING_RULES" => {
                            let rules = svc.get_rules().await;
                            let _ = svc.socket.send_command_response(
                                data.id,
                                true,
                                Some(serde_json::to_string(&rules).unwrap_or_default()),
                                None,
                            ).await;
                        }
                        _ => {}
                    }
                });
            })
            .await;

        info!("Blocking service handlers registered");
    }

    /// Get hosts file path
    fn get_hosts_path() -> PathBuf {
        #[cfg(target_os = "windows")]
        {
            PathBuf::from(r"C:\Windows\System32\drivers\etc\hosts")
        }
        #[cfg(not(target_os = "windows"))]
        {
            PathBuf::from("/etc/hosts")
        }
    }

    /// Block a website by adding to hosts file
    pub async fn block_website(&self, domain: &str) -> bool {
        let hosts_path = Self::get_hosts_path();

        // Backup original hosts file if not already done
        {
            let mut backup = self.hosts_backup.write().await;
            if backup.is_none() {
                if let Ok(content) = fs::read_to_string(&hosts_path) {
                    *backup = Some(content);
                }
            }
        }

        // Read current hosts file
        let hosts_content = match fs::read_to_string(&hosts_path) {
            Ok(content) => content,
            Err(e) => {
                error!("Failed to read hosts file: {}", e);
                return false;
            }
        };

        // Check if already blocked
        let block_entry = format!("127.0.0.1 {}", domain);
        if hosts_content.contains(&block_entry) {
            debug!("Website {} already blocked", domain);
            return true;
        }

        // Add blocking entries
        let new_content = format!(
            "{}\n# NetWatch Block\n127.0.0.1 {}\n127.0.0.1 www.{}\n",
            hosts_content.trim_end(),
            domain,
            domain
        );

        // Write back (platform-specific)
        let success = Self::write_hosts_file(&hosts_path, &new_content);

        if success {
            // Add to rules
            let mut rules = self.website_rules.write().await;
            rules.push(BlockingRule {
                id: format!("web-{}", chrono::Utc::now().timestamp_millis()),
                rule_type: "website".to_string(),
                pattern: domain.to_string(),
                mode: "block".to_string(),
                active: true,
            });

            // Flush DNS cache
            Self::flush_dns_cache();

            info!("Website {} blocked", domain);
        }

        success
    }

    /// Unblock a website
    pub async fn unblock_website(&self, domain: &str) -> bool {
        let hosts_path = Self::get_hosts_path();

        let hosts_content = match fs::read_to_string(&hosts_path) {
            Ok(content) => content,
            Err(e) => {
                error!("Failed to read hosts file: {}", e);
                return false;
            }
        };

        // Remove blocking entries
        let lines: Vec<&str> = hosts_content
            .lines()
            .filter(|line| {
                let line_lower = line.to_lowercase();
                !(line_lower.contains(&domain.to_lowercase()) && line.starts_with("127.0.0.1"))
            })
            .collect();

        let new_content = lines.join("\n");

        let success = Self::write_hosts_file(&hosts_path, &new_content);

        if success {
            // Remove from rules
            let mut rules = self.website_rules.write().await;
            rules.retain(|r| r.pattern.to_lowercase() != domain.to_lowercase());

            // Flush DNS cache
            Self::flush_dns_cache();

            info!("Website {} unblocked", domain);
        }

        success
    }

    /// Write to hosts file (platform-specific)
    fn write_hosts_file(path: &PathBuf, content: &str) -> bool {
        #[cfg(target_os = "windows")]
        {
            // Windows - try direct write first, then PowerShell
            if fs::write(path, content).is_ok() {
                return true;
            }

            let escaped = content.replace("\"", "`\"").replace("\n", "`n");
            let cmd = format!(
                "Set-Content -Path '{}' -Value \"{}\" -Encoding ASCII",
                path.display(),
                escaped
            );

            Command::new("powershell")
                .args(["-Command", &cmd])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }

        #[cfg(not(target_os = "windows"))]
        {
            // Unix - try direct write first, then sudo
            if fs::write(path, content).is_ok() {
                return true;
            }

            // Write to temp file and copy with sudo
            let temp_path = std::env::temp_dir().join("hosts.tmp");
            if fs::write(&temp_path, content).is_err() {
                return false;
            }

            let result = Command::new("sudo")
                .args(["cp", temp_path.to_str().unwrap(), path.to_str().unwrap()])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            let _ = fs::remove_file(&temp_path);
            result
        }
    }

    /// Flush DNS cache
    fn flush_dns_cache() {
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("ipconfig").args(["/flushdns"]).output();
        }

        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("dscacheutil").args(["-flushcache"]).output();
            let _ = Command::new("killall")
                .args(["-HUP", "mDNSResponder"])
                .output();
        }

        #[cfg(target_os = "linux")]
        {
            let _ = Command::new("systemd-resolve")
                .args(["--flush-caches"])
                .output();
        }
    }

    /// Restore hosts file from backup
    async fn restore_hosts_file(&self) {
        let backup = self.hosts_backup.read().await;
        if let Some(content) = backup.as_ref() {
            let hosts_path = Self::get_hosts_path();
            if Self::write_hosts_file(&hosts_path, content) {
                info!("Hosts file restored");
            }
        }
    }

    /// Block an application
    pub async fn block_application(&self, process_name: &str) {
        let mut rules = self.application_rules.write().await;
        rules.push(BlockingRule {
            id: format!("app-{}", chrono::Utc::now().timestamp_millis()),
            rule_type: "application".to_string(),
            pattern: process_name.to_lowercase(),
            mode: "block".to_string(),
            active: true,
        });
        info!("Application {} blocked", process_name);
    }

    /// Unblock an application
    pub async fn unblock_application(&self, process_name: &str) {
        let mut rules = self.application_rules.write().await;
        rules.retain(|r| r.pattern.to_lowercase() != process_name.to_lowercase());
        info!("Application {} unblocked", process_name);
    }

    /// Enforce application blocking
    async fn enforce_application_blocking(
        system: &mut System,
        rules: &Arc<RwLock<Vec<BlockingRule>>>,
    ) {
        let rules = rules.read().await;
        if rules.is_empty() {
            return;
        }

        // Collect blocked patterns
        let blocked_patterns: HashSet<String> = rules
            .iter()
            .filter(|r| r.active && r.mode == "block")
            .map(|r| r.pattern.to_lowercase())
            .collect();

        if blocked_patterns.is_empty() {
            return;
        }

        // Refresh process list
        system.refresh_processes();

        // Check each process
        for (pid, process) in system.processes() {
            let proc_name = process.name().to_lowercase();

            for pattern in &blocked_patterns {
                if proc_name.contains(pattern) {
                    // Kill the process
                    if process.kill() {
                        info!(
                            "Blocked application terminated: {} (PID: {})",
                            process.name(),
                            pid
                        );
                    }
                }
            }
        }
    }

    /// Set rules from server
    pub async fn set_rules(&self, rules: Vec<BlockingRule>) {
        let website_rules: Vec<BlockingRule> = rules
            .iter()
            .filter(|r| r.rule_type == "website")
            .cloned()
            .collect();

        let app_rules: Vec<BlockingRule> = rules
            .iter()
            .filter(|r| r.rule_type == "application")
            .cloned()
            .collect();

        // Apply website rules
        for rule in &website_rules {
            if rule.active && rule.mode == "block" {
                self.block_website(&rule.pattern).await;
            }
        }

        *self.website_rules.write().await = website_rules;
        *self.application_rules.write().await = app_rules;
    }

    /// Get all rules
    pub async fn get_rules(&self) -> Vec<BlockingRule> {
        let mut all_rules = Vec::new();
        all_rules.extend(self.website_rules.read().await.clone());
        all_rules.extend(self.application_rules.read().await.clone());
        all_rules
    }
}
