use std::fs;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{command, Manager};

use crate::error::{into_error, AppResult};
use crate::logs;

const PLAYIT_API_BASE: &str = "https://api.playit.gg";
const PLAYIT_AGENT_TYPE: &str = "self-managed";
const FISHBATTERY_API_BASE: &str = "https://api.fishbattery.app";
const FISHBATTERY_PLAYIT_EXCHANGE_PATH: &str = "/v1/playit/setup/exchange";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherSessionDb {
    access_token: Option<String>,
    refresh_token: Option<String>,
    account_id: Option<String>,
    updated_at: Option<u64>,
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

fn read_launcher_session(app: &tauri::AppHandle) -> AppResult<LauncherSessionDb> {
    let path = launcher_session_db_path(app)?;
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<LauncherSessionDb>(&raw).map_err(into_error),
        Err(_) => Ok(LauncherSessionDb::default()),
    }
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

fn stored_secret_key(state: &Value) -> AppResult<String> {
    state
        .get("secretKey")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "playit: account not linked".to_string())
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

    json!({
      "id": item.get("id").cloned().unwrap_or(Value::Null),
      "name": item.get("name").cloned().unwrap_or(Value::Null),
      "tunnelType": item.get("tunnel_type").cloned().unwrap_or(Value::Null),
      "portType": item.get("port_type").cloned().unwrap_or(Value::Null),
      "portCount": item.get("port_count").cloned().unwrap_or(json!(1)),
      "active": item.get("active").cloned().unwrap_or(json!(false)),
      "createdAt": item.get("created_at").cloned().unwrap_or(Value::Null),
      "localIp": item
        .get("origin")
        .and_then(|v| v.get("data"))
        .and_then(|v| v.get("name"))
        .cloned()
        .unwrap_or(Value::Null),
      "localPort": item
        .get("origin")
        .and_then(|v| v.get("data"))
        .and_then(|v| v.get("config_data"))
        .and_then(|v| v.get("fields"))
        .and_then(|v| v.as_array())
        .and_then(|fields| {
          fields.iter().find_map(|field| {
            let name = field.get("name").and_then(|v| v.as_str())?;
            if name.eq_ignore_ascii_case("local_port") || name.eq_ignore_ascii_case("port") {
              field.get("value").cloned()
            } else {
              None
            }
          })
        })
        .unwrap_or(Value::Null),
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
    let body: Value = response.json().await.map_err(into_error)?;

    if let Some(value) = body.get("data") {
        return Ok(value.clone());
    }

    if let Some(value) = body.get("value") {
        return Ok(value.clone());
    }

    if status.is_success() {
        return Ok(body);
    }

    let message = body
        .get("error")
        .and_then(|v| v.get("message").or_else(|| v.get("msg")))
        .and_then(|v| v.as_str())
        .or_else(|| body.get("message").and_then(|v| v.as_str()))
        .unwrap_or("Playit request failed");
    Err(format!("playit: {message}"))
}

async fn fishbattery_playit_exchange_setup_code(
    app: &tauri::AppHandle,
    code: &str,
) -> AppResult<Value> {
    let session = read_launcher_session(app)?;
    let access_token = session
        .access_token
        .unwrap_or_default()
        .trim()
        .to_string();
    if access_token.is_empty() {
        return Err("Not signed in to Fishbattery.".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{FISHBATTERY_API_BASE}{FISHBATTERY_PLAYIT_EXCHANGE_PATH}"
        ))
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .header(reqwest::header::ACCEPT, "application/json")
        .header("User-Agent", concat!("FishbatteryLauncher/", env!("CARGO_PKG_VERSION")))
        .json(&json!({ "code": code }))
        .send()
        .await
        .map_err(|err| {
            format!(
                "Could not reach Fishbattery API ({FISHBATTERY_API_BASE}{FISHBATTERY_PLAYIT_EXCHANGE_PATH}). Details: {}",
                err
            )
        })?;

    let status = response.status();
    let body: Value = response.json().await.map_err(into_error)?;
    if status.is_success() {
        return Ok(body);
    }

    let message = body
        .get("error")
        .and_then(|v| v.get("message").or_else(|| v.get("msg")))
        .and_then(|v| v.as_str())
        .or_else(|| body.get("message").and_then(|v| v.as_str()))
        .unwrap_or("Fishbattery Playit exchange failed");
    Err(format!("Fishbattery API returned {}: {message}", status.as_u16()))
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
pub fn playit_get_state(app: tauri::AppHandle) -> AppResult<Value> {
    Ok(sanitized_state(&read_state(&app)?))
}

#[command]
pub async fn playit_exchange_setup_code(app: tauri::AppHandle, code: String) -> AppResult<Value> {
    let normalized_code = code.trim();
    if normalized_code.is_empty() {
        return Err("Playit setup code is required.".to_string());
    }

    let payload = fishbattery_playit_exchange_setup_code(&app, normalized_code).await?;
    let secret_key = payload
        .get("secretKey")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Fishbattery Playit exchange did not return a secret key.".to_string())?;

    Ok(json!({
      "ok": true,
      "linked": true,
      "secretKey": secret_key
    }))
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
    logs::append_line(&app, "[playit] Link complete");
    Ok(sanitized_state(&state))
}

#[command]
pub fn playit_unlink(app: tauri::AppHandle) -> AppResult<Value> {
    let path = playit_state_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(into_error)?;
    }
    logs::append_line(&app, "[playit] Account unlinked");
    Ok(sanitized_state(&default_state()))
}

#[command]
pub async fn playit_list_tunnels(app: tauri::AppHandle) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    let secret_key = stored_secret_key(&state)?;
    let response = playit_post(Some(&secret_key), "/tunnels/list", &json!({})).await?;
    let tunnels = response
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

#[command]
pub async fn playit_create_tunnel(app: tauri::AppHandle, payload: Value) -> AppResult<Value> {
    let mut state = read_state(&app)?;
    let secret_key = stored_secret_key(&state)?;
    let name = payload
        .get("name")
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

    let create_payload = json!({
      "name": name,
      "tunnel_type": tunnel_type,
      "port_type": port_type,
      "port_count": port_count,
      "origin": {
        "type": "default",
        "data": {
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
    let tunnel_id = created
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "playit: missing tunnel id in create response".to_string())?;
    logs::append_line(&app, &format!("[playit] Tunnel created: {tunnel_id}"));

    let listed = playit_post(Some(&secret_key), "/tunnels/list", &json!({})).await?;
    let tunnels = listed
        .get("tunnels")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    refresh_state_tunnels(&mut state, &tunnels);
    write_state(&app, &state)?;

    let created_summary = state
        .get("activeTunnels")
        .and_then(|v| v.as_array())
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("id").and_then(|v| v.as_str()) == Some(tunnel_id))
                .cloned()
        })
        .unwrap_or_else(|| json!({ "id": tunnel_id }));

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

    playit_post(
        Some(&secret_key),
        "/tunnels/update",
        &json!({
          "tunnel_id": tunnel_id,
          "local_ip": local_ip,
          "local_port": local_port,
          "agent_id": Value::Null,
          "enabled": enabled
        }),
    )
    .await?;
    logs::append_line(&app, &format!("[playit] Tunnel updated: {tunnel_id}"));

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
