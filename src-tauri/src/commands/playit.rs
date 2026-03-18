use std::fs;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use tauri::{command, Manager};
use tokio::time::{sleep, Duration};

use crate::error::{into_error, AppResult};
use crate::logs;
use crate::state::AppState;

const PLAYIT_API_BASE: &str = "https://api.playit.gg";
const PLAYIT_AGENT_TYPE: &str = "self-managed";
const FISHBATTERY_ACCOUNT_API_BASE: &str = "https://api.fishbattery.app";
const FISHBATTERY_PLAYIT_EXCHANGE_PATH: &str = "/v1/playit/setup/exchange";
const PLAYIT_AGENT_START_WAIT_MS: u64 = 1_200;
const PLAYIT_ALLOC_WAIT_ATTEMPTS: usize = 10;
const PLAYIT_ALLOC_WAIT_MS: u64 = 1_500;

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const PLAYIT_AGENT_DOWNLOAD_URL: &str =
    "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64-signed.exe";
#[cfg(all(target_os = "windows", target_arch = "x86"))]
const PLAYIT_AGENT_DOWNLOAD_URL: &str =
    "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86-signed.exe";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const PLAYIT_AGENT_DOWNLOAD_URL: &str =
    "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64";
#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const PLAYIT_AGENT_DOWNLOAD_URL: &str =
    "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-aarch64";
#[cfg(all(target_os = "linux", target_arch = "arm"))]
const PLAYIT_AGENT_DOWNLOAD_URL: &str =
    "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-armv7";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "windows")]
fn hide_console_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(_cmd: &mut Command) {}

#[derive(Debug, Clone, serde::Deserialize)]
struct LauncherSessionDb {
    #[serde(rename = "accessToken")]
    access_token: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn app_data_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    app.path().app_data_dir().map_err(into_error)
}

fn playit_state_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_root(app)?.join("data").join("playit.json"))
}

fn playit_runtime_dir(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_root(app)?.join("data").join("playit-agent"))
}

fn playit_agent_binary_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let file_name = if cfg!(target_os = "windows") {
        "playit.exe"
    } else {
        "playit"
    };
    Ok(playit_runtime_dir(app)?.join(file_name))
}

fn playit_agent_log_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(playit_runtime_dir(app)?.join("playit-agent.log"))
}

fn playit_agent_secret_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(playit_runtime_dir(app)?.join("secret.txt"))
}

fn launcher_session_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_root(app)?
        .join("data")
        .join("launcher-session.json"))
}

fn read_json_file(path: &Path, fallback: Value) -> Value {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

fn write_json_file(path: &Path, value: &Value) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(into_error)?;
    }
    let raw = serde_json::to_string_pretty(value).map_err(into_error)?;
    fs::write(path, raw).map_err(into_error)?;
    Ok(())
}

fn default_state() -> Value {
    json!({
      "linked": false,
      "agentType": "fishbattery-launcher",
      "secretKey": Value::Null,
      "linkedAt": Value::Null,
      "preferredRegion": Value::Null,
      "autoTunnelEnabled": false,
      "activeTunnels": []
    })
}

fn normalize_state(mut state: Value) -> Value {
    if !state.is_object() {
        state = default_state();
    }
    if !state.get("linked").and_then(|v| v.as_bool()).is_some() {
        state["linked"] = json!(false);
    }
    if !state.get("agentType").and_then(|v| v.as_str()).is_some() {
        state["agentType"] = json!("fishbattery-launcher");
    }
    if !state
        .get("secretKey")
        .map(|v| v.is_string() || v.is_null())
        .unwrap_or(false)
    {
        state["secretKey"] = Value::Null;
    }
    if !state
        .get("linkedAt")
        .map(|v| v.is_number() || v.is_null())
        .unwrap_or(false)
    {
        state["linkedAt"] = Value::Null;
    }
    if !state
        .get("preferredRegion")
        .map(|v| v.is_string() || v.is_null())
        .unwrap_or(false)
    {
        state["preferredRegion"] = Value::Null;
    }
    if !state
        .get("autoTunnelEnabled")
        .and_then(|v| v.as_bool())
        .is_some()
    {
        state["autoTunnelEnabled"] = json!(false);
    }
    if !state
        .get("activeTunnels")
        .map(|v| v.is_array())
        .unwrap_or(false)
    {
        state["activeTunnels"] = json!([]);
    }
    state
}

fn read_state(app: &tauri::AppHandle) -> AppResult<Value> {
    Ok(normalize_state(read_json_file(
        &playit_state_path(app)?,
        default_state(),
    )))
}

fn write_state(app: &tauri::AppHandle, state: &Value) -> AppResult<()> {
    write_json_file(&playit_state_path(app)?, &normalize_state(state.clone()))
}

fn sanitized_state(state: &Value) -> Value {
    let mut out = normalize_state(state.clone());
    let has_secret_key = out
        .get("secretKey")
        .and_then(|v| v.as_str())
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    out["hasSecretKey"] = json!(has_secret_key);
    if let Some(obj) = out.as_object_mut() {
        obj.remove("secretKey");
    }
    out
}

fn is_playit_agent_running(app: &tauri::AppHandle) -> bool {
    let app_state = app.state::<AppState>();
    let Ok(mut guard) = app_state.playit_agent_pid.lock() else {
        return false;
    };
    match *guard {
        Some(pid) if pid_is_running(pid) => true,
        Some(_) => {
            *guard = None;
            false
        }
        None => false,
    }
}

fn sanitized_state_with_runtime(app: &tauri::AppHandle, state: &Value) -> Value {
    let mut out = sanitized_state(state);
    out["agentRunning"] = json!(is_playit_agent_running(app));
    out
}

fn stored_secret_key(state: &Value) -> AppResult<String> {
    state
        .get("secretKey")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "playit: account not linked".to_string())
}

fn read_launcher_access_token(app: &tauri::AppHandle) -> AppResult<String> {
    let raw = fs::read_to_string(launcher_session_db_path(app)?).map_err(into_error)?;
    let parsed: LauncherSessionDb = serde_json::from_str(&raw).map_err(into_error)?;
    parsed
        .access_token
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "playit: launcher account session missing. Sign in again and retry.".to_string())
}

fn fishbattery_account_api_base() -> String {
    std::env::var("FISHBATTERY_ACCOUNT_API")
        .ok()
        .or_else(|| std::env::var("FISHBATTERY_ACCOUNT_API_URL").ok())
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| FISHBATTERY_ACCOUNT_API_BASE.to_string())
}

fn summarize_tunnel(item: &Value) -> Value {
    let alloc = item.get("alloc").cloned().unwrap_or(Value::Null);
    let allocated = alloc
        .get("status")
        .and_then(|v| v.as_str())
        .map(|v| v == "allocated")
        .unwrap_or(false);
    let assigned_domain = alloc
        .get("data")
        .and_then(|v| v.get("assigned_domain"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let port_start = alloc
        .get("data")
        .and_then(|v| v.get("port_start"))
        .and_then(|v| v.as_u64());
    let join_address = assigned_domain.as_ref().map(|domain| {
        let port = port_start.unwrap_or(25565);
        if port == 25565 {
            domain.clone()
        } else {
            format!("{domain}:{port}")
        }
    });
    let origin_data = item
        .get("origin")
        .and_then(|v| v.get("data"))
        .cloned()
        .unwrap_or(Value::Null);
    let local_ip = origin_data
        .get("local_ip")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .or_else(|| {
            origin_data
                .get("name")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        });
    let local_port = origin_data
        .get("local_port")
        .cloned()
        .or_else(|| {
            origin_data
                .get("config_data")
                .and_then(|v| v.get("fields"))
                .and_then(|v| v.as_array())
                .and_then(|fields| {
                    fields.iter().find_map(|field| {
                        let name = field.get("name").and_then(|v| v.as_str())?;
                        if name.eq_ignore_ascii_case("local_port")
                            || name.eq_ignore_ascii_case("port")
                        {
                            field.get("value").cloned()
                        } else {
                            None
                        }
                    })
                })
        })
        .unwrap_or(Value::Null);

    json!({
      "id": item.get("id").cloned().unwrap_or(Value::Null),
      "name": item.get("name").cloned().unwrap_or(Value::Null),
      "tunnelType": item.get("tunnel_type").cloned().unwrap_or(Value::Null),
      "portType": item.get("port_type").cloned().unwrap_or(Value::Null),
      "portCount": item.get("port_count").cloned().unwrap_or(json!(1)),
      "active": item.get("active").cloned().unwrap_or(json!(false)),
      "createdAt": item.get("created_at").cloned().unwrap_or(Value::Null),
      "localIp": local_ip,
      "localPort": local_port,
      "assignedDomain": assigned_domain,
      "publicPort": port_start,
      "joinAddress": join_address,
      "allocationStatus": alloc.get("status").cloned().unwrap_or(Value::Null),
      "allocated": allocated,
      "region": item.get("region").cloned().unwrap_or(Value::Null),
      "disabledReason": item.get("disabled_reason").cloned().unwrap_or(Value::Null)
    })
}

fn refresh_state_tunnels(state: &mut Value, tunnels: &[Value]) {
    let summarized = tunnels.iter().map(summarize_tunnel).collect::<Vec<_>>();
    state["activeTunnels"] = Value::Array(summarized);
    state["linked"] = json!(state
        .get("secretKey")
        .and_then(|v| v.as_str())
        .map(|v| !v.is_empty())
        .unwrap_or(false));
}

fn created_tunnel_matches(
    item: &Value,
    tunnel_id: Option<&str>,
    name: Option<&str>,
    tunnel_type: Option<&str>,
    port_type: &str,
    local_port: Option<u16>,
) -> bool {
    if let Some(expected_id) = tunnel_id {
        if item.get("id").and_then(|v| v.as_str()) == Some(expected_id) {
            return true;
        }
    }

    let item_port_type = item
        .get("port_type")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if item_port_type != port_type {
        return false;
    }

    let item_tunnel_type = item
        .get("tunnel_type")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if item_tunnel_type != tunnel_type {
        return false;
    }

    let item_local_port = item
        .get("origin")
        .and_then(|v| v.get("data"))
        .and_then(|v| v.get("config_data"))
        .and_then(|v| v.get("fields"))
        .and_then(|v| v.as_array())
        .and_then(|fields| {
            fields.iter().find_map(|field| {
                let field_name = field.get("name").and_then(|v| v.as_str())?;
                if field_name.eq_ignore_ascii_case("local_port")
                    || field_name.eq_ignore_ascii_case("port")
                {
                    field.get("value").and_then(|v| match v {
                        Value::Number(n) => n.as_u64(),
                        Value::String(s) => s.trim().parse::<u64>().ok(),
                        _ => None,
                    })
                } else {
                    None
                }
            })
        });
    if let Some(expected_local_port) = local_port {
        if item_local_port != Some(expected_local_port as u64) {
            return false;
        }
    }

    let expected_name = name.map(str::trim).filter(|v| !v.is_empty());
    let item_name = item
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());

    match (expected_name, item_name) {
        (Some(expected_name), Some(item_name)) => item_name == expected_name,
        (Some(_), None) => false,
        _ => true,
    }
}

#[cfg(target_os = "windows")]
fn pid_is_running(pid: u32) -> bool {
    let output = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();
    let Ok(output) = output else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.contains("No tasks are running") {
        return false;
    }
    stdout
        .split(',')
        .nth(1)
        .map(|part| part.trim_matches('"').trim() == pid.to_string())
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn pid_is_running(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn kill_pid(pid: u32) -> bool {
    let mut cmd = Command::new("taskkill");
    hide_console_window(&mut cmd);
    cmd.args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn kill_pid(pid: u32) -> bool {
    Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn playit_http_client(secret_key: Option<&str>) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    if let Some(secret) = secret_key {
        let value = format!("Agent-Key {}", secret.trim());
        if let Ok(header_value) = reqwest::header::HeaderValue::from_str(&value) {
            headers.insert(AUTHORIZATION, header_value);
        }
    }
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

async fn playit_post(secret_key: Option<&str>, path: &str, payload: &Value) -> AppResult<Value> {
    let client = playit_http_client(secret_key);
    let response = client
        .post(format!("{PLAYIT_API_BASE}{path}"))
        .json(payload)
        .send()
        .await
        .map_err(into_error)?;
    let status = response.status();
    let body_text = response.text().await.map_err(into_error)?;
    let body_json = serde_json::from_str::<Value>(&body_text).ok();

    if let Some(body) = body_json.as_ref() {
        let playit_status = body
            .get("status")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_ascii_lowercase());
        if playit_status.as_deref() == Some("fail") {
            let message = body
                .get("error")
                .and_then(|v| v.get("message").or_else(|| v.get("msg")))
                .and_then(|v| v.as_str())
                .or_else(|| body.get("message").and_then(|v| v.as_str()))
                .or_else(|| body.get("data").and_then(|v| v.as_str()))
                .unwrap_or("Playit request failed");
            return Err(format!("playit: {message}"));
        }

        if let Some(value) = body.get("data") {
            return Ok(value.clone());
        }

        if let Some(value) = body.get("value") {
            return Ok(value.clone());
        }

        if status.is_success() {
            return Ok(body.clone());
        }

        let message = body
            .get("error")
            .and_then(|v| v.get("message").or_else(|| v.get("msg")))
            .and_then(|v| v.as_str())
            .or_else(|| body.get("message").and_then(|v| v.as_str()))
            .or_else(|| body.get("data").and_then(|v| v.as_str()))
            .unwrap_or("Playit request failed");
        return Err(format!("playit: {message}"));
    }

    if status.is_success() {
        let trimmed = body_text.trim();
        if trimmed.is_empty() {
            return Ok(Value::Null);
        }
        return Err(format!(
            "playit: received non-JSON success body: {}",
            trimmed.chars().take(240).collect::<String>()
        ));
    }

    let trimmed = body_text.trim();
    let message = if trimmed.is_empty() {
        format!("HTTP {}", status.as_u16())
    } else {
        format!(
            "HTTP {}: {}",
            status.as_u16(),
            trimmed.chars().take(240).collect::<String>()
        )
    };
    Err(format!("playit: {message}"))
}

async fn fishbattery_playit_exchange(
    app: &tauri::AppHandle,
    code: &str,
) -> AppResult<String> {
    let access_token = read_launcher_access_token(app)?;
    let url = format!(
        "{}{}",
        fishbattery_account_api_base(),
        FISHBATTERY_PLAYIT_EXCHANGE_PATH
    );
    let response = reqwest::Client::new()
        .post(url)
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({ "code": code }))
        .send()
        .await
        .map_err(into_error)?;
    let status = response.status();
    let body_text = response.text().await.map_err(into_error)?;
    let body_json = serde_json::from_str::<Value>(&body_text).ok();
    if !status.is_success() {
        let message = body_json
            .as_ref()
            .and_then(|body| body.get("message").and_then(|v| v.as_str()))
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| {
                if body_text.trim().is_empty() {
                    format!("Fishbattery API returned HTTP {}", status.as_u16())
                } else {
                    format!(
                        "Fishbattery API returned HTTP {}: {}",
                        status.as_u16(),
                        body_text.trim().chars().take(240).collect::<String>()
                    )
                }
            });
        return Err(format!("playit: {message}"));
    }

    let secret_key = body_json
        .as_ref()
        .and_then(|body| body.get("secretKey").and_then(|v| v.as_str()))
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "playit: Fishbattery API did not return a secret key".to_string())?;
    Ok(secret_key)
}

async fn ensure_playit_agent_binary(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let path = playit_agent_binary_path(app)?;
    if path.is_file() {
        return Ok(path);
    }

    let runtime_dir = playit_runtime_dir(app)?;
    fs::create_dir_all(&runtime_dir).map_err(into_error)?;
    logs::append_line(app, "[playit] Downloading managed Playit agent runtime");

    let bytes = reqwest::Client::builder()
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
        .get(PLAYIT_AGENT_DOWNLOAD_URL)
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .bytes()
        .await
        .map_err(into_error)?;
    if bytes.is_empty() {
        return Err("playit: downloaded Playit agent binary was empty".to_string());
    }

    let tmp_path = path.with_extension("download");
    fs::write(&tmp_path, &bytes).map_err(into_error)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&tmp_path).map_err(into_error)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&tmp_path, perms).map_err(into_error)?;
    }
    fs::rename(&tmp_path, &path).map_err(into_error)?;
    logs::append_line(app, "[playit] Playit agent runtime downloaded");
    Ok(path)
}

fn stop_playit_agent(app: &tauri::AppHandle) {
    let app_state = app.state::<AppState>();
    let Ok(mut guard) = app_state.playit_agent_pid.lock() else {
        return;
    };
    let Some(pid) = *guard else {
        return;
    };
    let _ = kill_pid(pid);
    *guard = None;
    if let Ok(secret_path) = playit_agent_secret_path(app) {
        let _ = fs::remove_file(secret_path);
    }
    logs::append_line(app, "[playit] Playit agent runtime stopped");
}

async fn ensure_playit_agent_running(app: &tauri::AppHandle, secret_key: &str) -> AppResult<bool> {
    if is_playit_agent_running(app) {
        return Ok(false);
    }

    let binary_path = ensure_playit_agent_binary(app).await?;
    let runtime_dir = playit_runtime_dir(app)?;
    fs::create_dir_all(&runtime_dir).map_err(into_error)?;

    logs::append_line(app, "[playit] Starting Playit agent runtime");
    let mut cmd = Command::new(&binary_path);
    hide_console_window(&mut cmd);
    let log_path = playit_agent_log_path(app)?;
    let secret_path = playit_agent_secret_path(app)?;
    fs::write(&secret_path, format!("{}\n", secret_key.trim())).map_err(into_error)?;
    cmd.current_dir(&runtime_dir)
        .args([
            "--secret_path",
            &secret_path.to_string_lossy(),
            "--log_path",
            &log_path.to_string_lossy(),
            "start",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let child = cmd.spawn().map_err(into_error)?;
    let pid = child.id();
    drop(child);

    if let Ok(mut guard) = app.state::<AppState>().playit_agent_pid.lock() {
        *guard = Some(pid);
    }

    sleep(Duration::from_millis(PLAYIT_AGENT_START_WAIT_MS)).await;
    if !pid_is_running(pid) {
        if let Ok(mut guard) = app.state::<AppState>().playit_agent_pid.lock() {
            if guard.as_ref().copied() == Some(pid) {
                *guard = None;
            }
        }
        return Err("playit: Playit agent runtime exited immediately after launch".to_string());
    }

    logs::append_line(app, "[playit] Playit agent runtime started");
    Ok(true)
}

async fn playit_agent_rundata(secret_key: &str) -> AppResult<Value> {
    playit_post(Some(secret_key), "/agents/rundata", &json!({})).await
}

async fn playit_fetch_tunnels(secret_key: &str) -> AppResult<Vec<Value>> {
    let response = playit_post(Some(secret_key), "/tunnels/list", &json!({})).await?;
    Ok(response
        .get("tunnels")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default())
}

fn summarize_created_tunnel_from_list(
    state: &Value,
    tunnels: &[Value],
    created_tunnel_id: Option<&str>,
    name: Option<&str>,
    tunnel_type: Option<&str>,
    port_type: &str,
    local_port: Option<u16>,
) -> Value {
    tunnels
        .iter()
        .find(|item| {
            created_tunnel_matches(
                item,
                created_tunnel_id,
                name,
                tunnel_type,
                port_type,
                local_port,
            )
        })
        .map(summarize_tunnel)
        .or_else(|| {
            state
                .get("activeTunnels")
                .and_then(|v| v.as_array())
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| {
                            let item_id = item.get("id").and_then(|v| v.as_str());
                            if let Some(expected_id) = created_tunnel_id {
                                item_id == Some(expected_id)
                            } else {
                                item.get("localPort").and_then(|v| match v {
                                    Value::Number(n) => n.as_u64(),
                                    Value::String(s) => s.trim().parse::<u64>().ok(),
                                    _ => None,
                                }) == local_port.map(|port| port as u64)
                                    && item.get("portType").and_then(|v| v.as_str())
                                        == Some(port_type)
                                    && item.get("tunnelType").and_then(|v| v.as_str())
                                        == tunnel_type
                            }
                        })
                        .cloned()
                })
        })
        .unwrap_or_else(|| {
            json!({
              "id": created_tunnel_id,
              "name": name,
              "tunnelType": tunnel_type,
              "portType": port_type,
              "localPort": local_port,
              "joinAddress": Value::Null
            })
        })
}

fn tunnel_ready(summary: &Value) -> bool {
    summary
        .get("joinAddress")
        .and_then(|v| v.as_str())
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
        || summary
            .get("allocated")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
}

fn tunnel_matches_id(item: &Value, tunnel_id: &str) -> bool {
    item.get("id").and_then(|v| v.as_str()) == Some(tunnel_id)
}
fn parse_local_ip(payload: &Value) -> AppResult<String> {
    let raw = payload
        .get("localIp")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("127.0.0.1");
    let parsed = IpAddr::from_str(raw).map_err(into_error)?;
    Ok(parsed.to_string())
}

fn parse_local_port(payload: &Value) -> AppResult<Option<u16>> {
    let Some(value) = payload.get("localPort") else {
        return Ok(None);
    };
    let port = if let Some(port) = value.as_u64() {
        port as u16
    } else if let Some(raw) = value.as_str() {
        raw.trim().parse::<u16>().map_err(into_error)?
    } else {
        return Err("playit: invalid local port".to_string());
    };
    if port == 0 {
        return Err("playit: local port must be greater than 0".to_string());
    }
    Ok(Some(port))
}

#[command]
pub async fn playit_get_state(app: tauri::AppHandle) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    if let Ok(secret_key) = stored_secret_key(&state) {
        let _ = ensure_playit_agent_running(&app, &secret_key).await;
        if let Ok(tunnels) = playit_fetch_tunnels(&secret_key).await {
            refresh_state_tunnels(&mut state, &tunnels);
            let _ = write_state(&app, &state);
        }
    }
    Ok(sanitized_state_with_runtime(&app, &state))
}

#[command]
pub fn playit_set_auto_tunnel_enabled(app: tauri::AppHandle, enabled: bool) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    state["autoTunnelEnabled"] = json!(enabled);
    write_state(&app, &state)?;
    logs::append_line(
        &app,
        &format!(
            "[playit] Auto-LAN tunnel {}",
            if enabled { "enabled" } else { "disabled" }
        ),
    );
    Ok(sanitized_state_with_runtime(&app, &state))
}

#[command]
pub async fn playit_link_begin(code: String) -> AppResult<Value> {
    let code = code.trim();
    if code.is_empty() {
        return Err("playit: setup code is required".to_string());
    }
    let result = playit_post(
        None,
        "/claim/setup",
        &json!({
          "code": code,
          "agent_type": PLAYIT_AGENT_TYPE,
          "version": format!("Fishbattery Launcher {}", env!("CARGO_PKG_VERSION"))
        }),
    )
    .await?;
    Ok(json!({
      "ok": true,
      "code": code,
      "status": result,
      "claimUrl": format!("https://playit.gg/claim/{code}")
    }))
}

#[command]
pub async fn playit_exchange_setup_code(app: tauri::AppHandle, code: String) -> AppResult<Value> {
    let normalized_code = code.trim();
    if normalized_code.is_empty() {
        return Err("playit: setup code is required".to_string());
    }

    logs::append_line(&app, "[playit] Exchanging setup code via Fishbattery backend");
    let secret_key = fishbattery_playit_exchange(&app, normalized_code).await?;
    Ok(json!({
      "ok": true,
      "linked": true,
      "secretKey": secret_key,
      "agentRunning": false
    }))
}

#[command]
pub async fn playit_link_complete(app: tauri::AppHandle, code: String) -> AppResult<Value> {
    let code = code.trim();
    let _ = app;
    Err(format!(
    "playit: direct setup-code exchange is disabled. Exchange code '{}' via Fishbattery backend, then call playit_link_secret with the returned secret key.",
    if code.is_empty() { "<empty>" } else { "<redacted>" }
  ))
}

#[command]
pub async fn playit_link_secret(app: tauri::AppHandle, secret_key: String) -> AppResult<Value> {
    let secret_key = secret_key.trim();
    if secret_key.is_empty() {
        return Err("playit: secret key is required".to_string());
    }

    logs::append_line(&app, "[playit] Linking started");
    let tunnels = playit_post(Some(secret_key), "/tunnels/list", &json!({})).await?;
    let tunnel_items = tunnels
        .get("tunnels")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut state = default_state();
    state["linked"] = json!(true);
    state["secretKey"] = json!(secret_key);
    state["linkedAt"] = json!(now_ms());
    refresh_state_tunnels(&mut state, &tunnel_items);
    write_state(&app, &state)?;
    if let Err(err) = ensure_playit_agent_running(&app, secret_key).await {
        logs::append_line(&app, &format!("[playit] Playit runtime start failed: {err}"));
    }
    logs::append_line(&app, "[playit] Link complete");
    Ok(sanitized_state_with_runtime(&app, &state))
}

#[command]
pub fn playit_unlink(app: tauri::AppHandle) -> AppResult<Value> {
    stop_playit_agent(&app);
    let path = playit_state_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(into_error)?;
    }
    logs::append_line(&app, "[playit] Account unlinked");
    Ok(sanitized_state_with_runtime(&app, &default_state()))
}

#[command]
pub async fn playit_list_tunnels(app: tauri::AppHandle) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    let secret_key = stored_secret_key(&state)?;
    let _ = ensure_playit_agent_running(&app, &secret_key).await;
    let tunnels = playit_fetch_tunnels(&secret_key).await?;
    refresh_state_tunnels(&mut state, &tunnels);
    write_state(&app, &state)?;
    Ok(json!({
      "tunnels": state.get("activeTunnels").cloned().unwrap_or_else(|| json!([]))
    }))
}

#[command]
pub async fn playit_create_tunnel(app: tauri::AppHandle, payload: Value) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    let secret_key = stored_secret_key(&state)?;
    ensure_playit_agent_running(&app, &secret_key).await?;
    let name = payload
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let tunnel_description = payload
        .get("tunnelDescription")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let port_type = payload
        .get("portType")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| matches!(v.as_str(), "tcp" | "udp"))
        .unwrap_or_else(|| "tcp".to_string());
    let port_count = payload
        .get("portCount")
        .and_then(|v| v.as_u64())
        .filter(|v| *v > 0 && *v <= u16::MAX as u64)
        .unwrap_or(1) as u16;
    let local_ip = parse_local_ip(&payload)?;
    let local_port = parse_local_port(&payload)?;
    let enabled = payload
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let tunnel_type = payload
        .get("tunnelType")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let rundata = playit_agent_rundata(&secret_key).await?;
    let agent_id = rundata
        .get("agent_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "playit: missing agent id in rundata".to_string())?
        .to_string();
    let account_status = rundata
        .get("account_status")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("unknown");
    if account_status.contains("over-limit") {
        return Err(format!(
            "playit: account status is {account_status}. Remove old Fishbattery/Playit agents on playit.gg, then relink."
        ));
    }

    let create_payload = json!({
      "name": name,
      "tunnel_type": tunnel_type,
      "tunnel_description": tunnel_description,
      "port_type": port_type,
      "port_count": port_count,
      "origin": {
        "type": "agent",
        "data": {
          "agent_id": agent_id,
          "local_ip": local_ip,
          "local_port": local_port
        }
      },
      "enabled": enabled,
      "alloc": Value::Null,
      "firewall_id": Value::Null,
      "proxy_protocol": Value::Null
    });

    let created = playit_post(Some(&secret_key), "/tunnels/create", &create_payload).await?;
    let created_tunnel_id = created
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    if let Some(tunnel_id) = created_tunnel_id.as_deref() {
        logs::append_line(&app, &format!("[playit] Tunnel created: {tunnel_id}"));
    } else {
        logs::append_line(
            &app,
            "[playit] Tunnel create response omitted id; resolving created tunnel from refreshed list",
        );
    }

    let mut tunnels = playit_fetch_tunnels(&secret_key).await?;
    refresh_state_tunnels(&mut state, &tunnels);
    write_state(&app, &state)?;

    let mut created_summary = summarize_created_tunnel_from_list(
        &state,
        &tunnels,
        created_tunnel_id.as_deref(),
        name.as_deref(),
        tunnel_type.as_deref(),
        &port_type,
        local_port,
    );
    if !tunnel_ready(&created_summary) {
        logs::append_line(&app, "[playit] Waiting for tunnel allocation");
        for _ in 0..PLAYIT_ALLOC_WAIT_ATTEMPTS {
            sleep(Duration::from_millis(PLAYIT_ALLOC_WAIT_MS)).await;
            tunnels = playit_fetch_tunnels(&secret_key).await?;
            refresh_state_tunnels(&mut state, &tunnels);
            write_state(&app, &state)?;
            created_summary = summarize_created_tunnel_from_list(
                &state,
                &tunnels,
                created_tunnel_id.as_deref(),
                name.as_deref(),
                tunnel_type.as_deref(),
                &port_type,
                local_port,
            );
            if tunnel_ready(&created_summary) {
                break;
            }
        }
    }

    Ok(json!({
      "created": created_summary,
      "tunnels": state.get("activeTunnels").cloned().unwrap_or_else(|| json!([]))
    }))
}

#[command]
pub async fn playit_update_tunnel(app: tauri::AppHandle, payload: Value) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    let secret_key = stored_secret_key(&state)?;
    let tunnel_id = payload
        .get("tunnelId")
        .or_else(|| payload.get("id"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "playit: tunnel id is required".to_string())?;
    let local_ip = parse_local_ip(&payload)?;
    let local_port = parse_local_port(&payload)?;
    let enabled = payload
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let requested_config_change = payload.get("localIp").is_some() || payload.get("localPort").is_some();
    if requested_config_change {
        let mut fields = vec![json!({
            "name": "local_ip",
            "value": local_ip
        })];
        if let Some(port) = local_port {
            fields.push(json!({
                "name": "local_port",
                "value": port.to_string()
            }));
        }
        playit_post(
            Some(&secret_key),
            "/v1/tunnels/config",
            &json!({
              "tunnel_id": tunnel_id,
              "new_agent_id": Value::Null,
              "new_config": {
                "fields": fields
              }
            }),
        )
        .await?;
    }
    playit_post(
        Some(&secret_key),
        "/tunnels/enable",
        &json!({
          "tunnel_id": tunnel_id,
          "enabled": enabled
        }),
    )
    .await?;
    logs::append_line(&app, &format!("[playit] Tunnel updated: {tunnel_id}"));

    let desired_local_port = local_port.map(|v| v as u64);
    let mut tunnels = playit_fetch_tunnels(&secret_key).await?;
    for _ in 0..4 {
        let matched = tunnels.iter().find(|item| tunnel_matches_id(item, tunnel_id));
        let current_local_port = matched
            .and_then(|item| {
                item.get("origin")
                    .and_then(|v| v.get("data"))
                    .and_then(|v| v.get("local_port"))
                    .and_then(|v| match v {
                        Value::Number(n) => n.as_u64(),
                        Value::String(s) => s.trim().parse::<u64>().ok(),
                        _ => None,
                    })
            });
        let current_active = matched.and_then(|item| item.get("active").and_then(|v| v.as_bool()));
        let local_port_matches = desired_local_port.is_none() || current_local_port == desired_local_port;
        let enabled_matches = current_active == Some(enabled);
        if local_port_matches && enabled_matches {
            break;
        }
        sleep(Duration::from_millis(600)).await;
        tunnels = playit_fetch_tunnels(&secret_key).await?;
    }
    refresh_state_tunnels(&mut state, &tunnels);
    write_state(&app, &state)?;

    Ok(json!({
      "tunnels": state.get("activeTunnels").cloned().unwrap_or_else(|| json!([]))
    }))
}

#[command]
pub async fn playit_delete_tunnel(app: tauri::AppHandle, tunnel_id: String) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    let secret_key = stored_secret_key(&state)?;
    let tunnel_id = tunnel_id.trim();
    if tunnel_id.is_empty() {
        return Err("playit: tunnel id is required".to_string());
    }

    playit_post(
        Some(&secret_key),
        "/tunnels/delete",
        &json!({
          "tunnel_id": tunnel_id
        }),
    )
    .await?;
    logs::append_line(&app, &format!("[playit] Tunnel deleted: {tunnel_id}"));

    let listed = playit_post(Some(&secret_key), "/tunnels/list", &json!({})).await?;
    let tunnels = listed
        .get("tunnels")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    refresh_state_tunnels(&mut state, &tunnels);
    write_state(&app, &state)?;

    Ok(json!({
      "tunnels": state.get("activeTunnels").cloned().unwrap_or_else(|| json!([]))
    }))
}
