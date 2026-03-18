#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::Mutex;

use tauri_plugin_updater::Update;

use crate::logs::SessionLogger;

pub struct AppState {
    pub launch_processes: Mutex<HashMap<String, u32>>,
    pub updater_state: Mutex<Option<serde_json::Value>>,
    pub updater_pending_update: Mutex<Option<Update>>,
    pub updater_downloaded_bytes: Mutex<Option<Vec<u8>>>,
    pub session_logger: Mutex<Option<SessionLogger>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            launch_processes: Mutex::new(HashMap::new()),
            updater_state: Mutex::new(None),
            updater_pending_update: Mutex::new(None),
            updater_downloaded_bytes: Mutex::new(None),
            session_logger: Mutex::new(None),
        }
    }
}
