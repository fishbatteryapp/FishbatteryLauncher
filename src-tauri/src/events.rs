#![allow(dead_code)]

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Window};

use crate::error::{into_error, AppResult};
use crate::logs;

pub fn emit_launch_log(window: &Window, line: impl Into<String>) -> AppResult<()> {
    let text = line.into();
    logs::append_line(&window.app_handle(), &text);
    window.emit("launch:log", text).map_err(into_error)
}

pub fn emit_launch_log_app(app: &AppHandle, line: impl Into<String>) -> AppResult<()> {
    let text = line.into();
    logs::append_line(app, &text);
    app.emit("launch:log", text).map_err(into_error)
}

pub fn emit_updater_event<T>(window: &Window, payload: &T) -> AppResult<()>
where
    T: Serialize + ?Sized,
{
    window.emit("updater:event", payload).map_err(into_error)
}
