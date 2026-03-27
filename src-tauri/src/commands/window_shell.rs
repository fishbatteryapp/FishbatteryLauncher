use serde::Serialize;
use tauri::command;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, Window};

use crate::error::{into_error, AppResult};

const MANIFEST_URL: &str = "https://launchermeta.mojang.com/mc/game/version_manifest.json";

#[derive(Serialize)]
pub struct VersionManifest {
    latest: LatestVersion,
    versions: Vec<MojangVersion>,
}

#[derive(Serialize)]
pub struct LatestVersion {
    release: String,
    snapshot: String,
}

#[derive(Serialize)]
pub struct MojangVersion {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    url: String,
    time: String,
    #[serde(rename = "releaseTime")]
    release_time: String,
}

fn parse_hex_color(hex: &str) -> bool {
    let value = hex.trim();
    value.len() == 7
        && value.starts_with('#')
        && value.as_bytes()[1..].iter().all(|b| b.is_ascii_hexdigit())
}

fn assert_safe_http_url(raw: &str, allow_http: bool) -> AppResult<String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err("external_open:url: missing".to_string());
    }
    if value.len() > 2048 {
        return Err("external_open:url: too long".to_string());
    }
    if value.contains('\0') {
        return Err("external_open:url: invalid null byte".to_string());
    }

    let parsed = url::Url::parse(value).map_err(into_error)?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    let https = scheme == "https";
    let http = allow_http && scheme == "http";
    if !https && !http {
        return Err("external_open:url: unsupported URL protocol".to_string());
    }
    if parsed.host_str().unwrap_or("").trim().is_empty() {
        return Err("external_open:url: invalid URL host".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("external_open:url: credentials not allowed".to_string());
    }

    Ok(parsed.to_string())
}

fn clamp_anchor_ratio(anchor_ratio: f64) -> f64 {
    anchor_ratio.clamp(0.05, 0.95)
}

fn position_for_drag(
    window: &Window,
    cursor_x: i32,
    cursor_y: i32,
    anchor_ratio: f64,
) -> AppResult<Position> {
    let size = window.outer_size().map_err(into_error)?;
    let width = i32::try_from(size.width).unwrap_or(i32::MAX);
    let next_x =
        (f64::from(cursor_x) - f64::from(width) * clamp_anchor_ratio(anchor_ratio)).round() as i32;
    let next_y = cursor_y.saturating_sub(10);
    Ok(Position::Physical(PhysicalPosition::new(next_x, next_y)))
}

#[command]
pub fn window_minimize(window: Window) -> AppResult<bool> {
    window.minimize().map_err(into_error)?;
    Ok(true)
}

#[command]
pub fn window_toggle_maximize(window: Window) -> AppResult<bool> {
    if window.is_maximized().map_err(into_error)? {
        window.unmaximize().map_err(into_error)?;
    } else {
        window.maximize().map_err(into_error)?;
    }
    window.is_maximized().map_err(into_error)
}

#[command]
pub fn window_is_maximized(window: Window) -> AppResult<bool> {
    window.is_maximized().map_err(into_error)
}

#[command]
pub fn window_is_fullscreen(window: Window) -> AppResult<bool> {
    window.is_fullscreen().map_err(into_error)
}

#[command]
pub fn window_drag_restore(
    window: Window,
    cursor_x: i32,
    cursor_y: i32,
    anchor_ratio: f64,
) -> AppResult<bool> {
    if !window.is_maximized().map_err(into_error)? {
        return Ok(false);
    }

    window.unmaximize().map_err(into_error)?;
    let next_pos = position_for_drag(&window, cursor_x, cursor_y, anchor_ratio)?;
    window.set_position(next_pos).map_err(into_error)?;
    Ok(true)
}

#[command]
pub fn window_drag_move(
    window: Window,
    cursor_x: i32,
    cursor_y: i32,
    anchor_ratio: f64,
) -> AppResult<bool> {
    if window.is_maximized().map_err(into_error)? {
        return Ok(false);
    }
    let next_pos = position_for_drag(&window, cursor_x, cursor_y, anchor_ratio)?;
    window.set_position(next_pos).map_err(into_error)?;
    Ok(true)
}

#[command]
pub fn window_drag_end(window: Window, cursor_y: i32) -> AppResult<bool> {
    if cursor_y <= 2 {
        window.maximize().map_err(into_error)?;
        return Ok(true);
    }
    window.is_maximized().map_err(into_error)
}

#[command]
pub fn window_toggle_fullscreen(window: Window) -> AppResult<bool> {
    let next = !window.is_fullscreen().map_err(into_error)?;
    window.set_fullscreen(next).map_err(into_error)?;
    window.is_fullscreen().map_err(into_error)
}

#[command]
pub fn window_set_fullscreen(window: Window, enabled: bool) -> AppResult<bool> {
    window.set_fullscreen(enabled).map_err(into_error)?;
    window.is_fullscreen().map_err(into_error)
}

#[command]
pub fn window_set_size(window: Window, width: u32, height: u32) -> AppResult<bool> {
    let safe_width = width.clamp(480, 3840);
    let safe_height = height.clamp(320, 2160);
    if window.is_fullscreen().map_err(into_error)? {
        return Ok(false);
    }
    if window.is_maximized().map_err(into_error)? {
        window.unmaximize().map_err(into_error)?;
    }
    window
        .set_size(Size::Logical(LogicalSize::new(
            f64::from(safe_width),
            f64::from(safe_height),
        )))
        .map_err(into_error)?;
    Ok(true)
}

#[command]
pub fn window_close(window: Window) -> AppResult<bool> {
    window.close().map_err(into_error)?;
    Ok(true)
}

#[command]
pub fn window_show(app: AppHandle, window: Window) -> AppResult<bool> {
    if let Some(splash) = app.get_webview_window("startup-splash") {
        let _ = splash.close();
    }
    window.show().map_err(into_error)?;
    let _ = window.set_focus();
    Ok(true)
}

#[command]
pub fn window_set_title_bar_theme(
    window: Window,
    color: String,
    symbol_color: String,
) -> AppResult<bool> {
    if cfg!(target_os = "macos") {
        return Ok(false);
    }
    // Keep current signature and validation contract. Native overlay parity is implemented later.
    if !parse_hex_color(&color) || !parse_hex_color(&symbol_color) {
        return Ok(false);
    }
    let _ = window;
    Ok(true)
}

#[command]
pub async fn external_open(url: String) -> AppResult<bool> {
    let safe = assert_safe_http_url(&url, true)?;
    webbrowser::open(&safe).map_err(into_error)?;
    Ok(true)
}

#[command]
pub async fn versions_list() -> AppResult<VersionManifest> {
    let manifest = reqwest::get(MANIFEST_URL)
        .await
        .map_err(into_error)?
        .json::<serde_json::Value>()
        .await
        .map_err(into_error)?;

    let latest = manifest
        .get("latest")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "versions_list: invalid manifest.latest".to_string())?;
    let release = latest
        .get("release")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "versions_list: latest.release missing".to_string())?
        .to_string();
    let snapshot = latest
        .get("snapshot")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "versions_list: latest.snapshot missing".to_string())?
        .to_string();

    let versions_json = manifest
        .get("versions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "versions_list: invalid manifest.versions".to_string())?;
    let mut versions = Vec::with_capacity(versions_json.len());
    for row in versions_json {
        let obj = row
            .as_object()
            .ok_or_else(|| "versions_list: invalid version item".to_string())?;
        versions.push(MojangVersion {
            id: obj
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "versions_list: version.id missing".to_string())?
                .to_string(),
            kind: obj
                .get("type")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "versions_list: version.type missing".to_string())?
                .to_string(),
            url: obj
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "versions_list: version.url missing".to_string())?
                .to_string(),
            time: obj
                .get("time")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "versions_list: version.time missing".to_string())?
                .to_string(),
            release_time: obj
                .get("releaseTime")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "versions_list: version.releaseTime missing".to_string())?
                .to_string(),
        });
    }

    Ok(VersionManifest {
        latest: LatestVersion { release, snapshot },
        versions,
    })
}
