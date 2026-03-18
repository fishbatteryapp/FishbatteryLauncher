use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::{command, Emitter, Manager, Window};
use tauri_plugin_updater::UpdaterExt;
use url::Url;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::commands::runtime_ops;
use crate::error::{into_error, AppResult};
use crate::state::AppState;

const PERF_MOD_IDS: &[&str] = &["sodium", "lithium", "ferrite-core", "modernfix", "c2me"];
const DEFAULT_UPDATER_PUBKEY: &str =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVFRTVBNjNGRjkzRTlEMTAKUldRUW5UNzVQNmJsN3NXeFExZzRLL0crZFJlcXdkendWMHhBRGhsQ0FHbXYzc05UM3p0YktBTFYK";
const DEFAULT_UPDATER_ENDPOINT_STABLE: &str =
    "https://github.com/fishbatteryapp/FishbatteryLauncher/releases/latest/download/latest.json";

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn app_data_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    app.path().app_data_dir().map_err(into_error)
}

fn instances_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_root(app)?.join("instances"))
}

fn instances_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(instances_root(app)?.join("_instances.json"))
}

fn read_json_file<T>(path: &Path, fallback: T) -> T
where
    T: serde::de::DeserializeOwned,
{
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<T>(&raw).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

fn updater_state_default(app: &tauri::AppHandle, message: &str) -> Value {
    json!({
      "status": "idle",
      "currentVersion": app.package_info().version.to_string(),
      "latestVersion": Value::Null,
      "progressPercent": Value::Null,
      "message": message,
      "updatedAt": now_ms()
    })
}

fn updater_channel_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_root(app)?
        .join("data")
        .join("updater-channel.json"))
}

fn read_updater_channel(app: &tauri::AppHandle) -> String {
    let path = match updater_channel_path(app) {
        Ok(p) => p,
        Err(_) => return "stable".to_string(),
    };
    let raw: Value = read_json_file(&path, json!({ "channel": "stable" }));
    let c = raw
        .get("channel")
        .and_then(|v| v.as_str())
        .unwrap_or("stable")
        .to_ascii_lowercase();
    if c == "beta" {
        "beta".to_string()
    } else {
        "stable".to_string()
    }
}

fn write_updater_channel(app: &tauri::AppHandle, channel: &str) -> AppResult<()> {
    let path = updater_channel_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(into_error)?;
    }
    fs::write(
        path,
        serde_json::to_string_pretty(&json!({ "channel": channel })).map_err(into_error)?,
    )
    .map_err(into_error)?;
    Ok(())
}

fn emit_updater_state(app: &tauri::AppHandle, state: &Value) -> AppResult<()> {
    app.emit("updater:event", state).map_err(into_error)
}

fn set_updater_state(app: &tauri::AppHandle, patch: Value) -> AppResult<Value> {
    let state_handle = app.state::<AppState>();
    let mut guard = state_handle
        .updater_state
        .lock()
        .map_err(|_| "updater: state lock poisoned".to_string())?;
    let mut cur = guard
        .clone()
        .unwrap_or_else(|| updater_state_default(app, "Updates not checked yet."));
    if !cur.is_object() {
        cur = updater_state_default(app, "Updates not checked yet.");
    }
    if let Some(patch_obj) = patch.as_object() {
        for (k, v) in patch_obj {
            cur[k] = v.clone();
        }
    }
    cur["currentVersion"] = json!(app.package_info().version.to_string());
    cur["updatedAt"] = json!(now_ms());
    *guard = Some(cur.clone());
    let _ = emit_updater_state(app, &cur);
    Ok(cur)
}

fn updater_set_status(app: &tauri::AppHandle, status: &str, message: &str) -> AppResult<Value> {
    set_updater_state(
        app,
        json!({
          "status": status,
          "message": message,
          "progressPercent": Value::Null
        }),
    )
}

fn split_env_list(name: &str) -> Vec<String> {
    let Ok(raw) = std::env::var(name) else {
        return Vec::new();
    };
    raw.split([',', ';', '\n', '\r'])
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
        .collect()
}

fn updater_pubkey_from_env() -> Option<String> {
    for key in ["FISHBATTERY_UPDATER_PUBKEY", "TAURI_UPDATER_PUBKEY"] {
        if let Ok(v) = std::env::var(key) {
            let trimmed = v.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    Some(DEFAULT_UPDATER_PUBKEY.to_string())
}

fn updater_endpoints_from_env(channel: &str) -> Vec<Url> {
    let upper = channel.to_ascii_uppercase();
    let names = [
        format!("FISHBATTERY_UPDATER_ENDPOINT_{upper}"),
        "FISHBATTERY_UPDATER_ENDPOINT".to_string(),
        format!("TAURI_UPDATER_ENDPOINT_{upper}"),
        "TAURI_UPDATER_ENDPOINT".to_string(),
    ];
    let mut out = Vec::<Url>::new();
    for name in names {
        for raw in split_env_list(&name) {
            if let Ok(url) = Url::parse(&raw) {
                out.push(url);
            }
        }
    }
    if out.is_empty() {
        let fallback = if channel.eq_ignore_ascii_case("stable") {
            DEFAULT_UPDATER_ENDPOINT_STABLE
        } else {
            DEFAULT_UPDATER_ENDPOINT_STABLE
        };
        if let Ok(url) = Url::parse(fallback) {
            out.push(url);
        }
    }
    out
}

fn clear_pending_update_state(app: &tauri::AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut pending = state
        .updater_pending_update
        .lock()
        .map_err(|_| "updater: pending update lock poisoned".to_string())?;
    *pending = None;
    drop(pending);
    let mut bytes = state
        .updater_downloaded_bytes
        .lock()
        .map_err(|_| "updater: downloaded bytes lock poisoned".to_string())?;
    *bytes = None;
    Ok(())
}

fn store_pending_update(
    app: &tauri::AppHandle,
    update: &tauri_plugin_updater::Update,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut pending = state
        .updater_pending_update
        .lock()
        .map_err(|_| "updater: pending update lock poisoned".to_string())?;
    *pending = Some(update.clone());
    Ok(())
}

fn take_pending_update(app: &tauri::AppHandle) -> AppResult<Option<tauri_plugin_updater::Update>> {
    let state = app.state::<AppState>();
    let mut pending = state
        .updater_pending_update
        .lock()
        .map_err(|_| "updater: pending update lock poisoned".to_string())?;
    Ok(pending.take())
}

fn store_downloaded_update_bytes(app: &tauri::AppHandle, bytes: Vec<u8>) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut guard = state
        .updater_downloaded_bytes
        .lock()
        .map_err(|_| "updater: downloaded bytes lock poisoned".to_string())?;
    *guard = Some(bytes);
    Ok(())
}

fn clear_downloaded_update_bytes(app: &tauri::AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut guard = state
        .updater_downloaded_bytes
        .lock()
        .map_err(|_| "updater: downloaded bytes lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

fn take_downloaded_update_bytes(app: &tauri::AppHandle) -> AppResult<Option<Vec<u8>>> {
    let state = app.state::<AppState>();
    let mut guard = state
        .updater_downloaded_bytes
        .lock()
        .map_err(|_| "updater: downloaded bytes lock poisoned".to_string())?;
    Ok(guard.take())
}

fn build_updater(
    app: &tauri::AppHandle,
    channel: &str,
) -> AppResult<tauri_plugin_updater::Updater> {
    let Some(pubkey) = updater_pubkey_from_env() else {
        return Err(
            "updater: missing pubkey, set FISHBATTERY_UPDATER_PUBKEY (or TAURI_UPDATER_PUBKEY)"
                .to_string(),
        );
    };
    let endpoints = updater_endpoints_from_env(channel);
    if endpoints.is_empty() {
        return Err(format!(
      "updater: missing endpoints for channel '{channel}', set FISHBATTERY_UPDATER_ENDPOINT_{0} or FISHBATTERY_UPDATER_ENDPOINT",
      channel.to_ascii_uppercase()
    ));
    }
    let builder = app.updater_builder().pubkey(pubkey);
    let builder = builder.endpoints(endpoints).map_err(into_error)?;
    builder.build().map_err(into_error)
}

#[command]
pub fn updater_get_state(app: tauri::AppHandle) -> AppResult<Value> {
    let state_handle = app.state::<AppState>();
    let mut guard = state_handle
        .updater_state
        .lock()
        .map_err(|_| "updater:getState: state lock poisoned".to_string())?;
    if guard.is_none() {
        *guard = Some(updater_state_default(&app, "Updates not checked yet."));
    }
    Ok(guard
        .clone()
        .unwrap_or_else(|| updater_state_default(&app, "Updates not checked yet.")))
}

#[command]
pub fn updater_get_channel(app: tauri::AppHandle) -> AppResult<String> {
    Ok(read_updater_channel(&app))
}

#[command]
pub fn updater_set_channel(app: tauri::AppHandle, channel: String) -> AppResult<String> {
    let c = if channel.trim().eq_ignore_ascii_case("beta") {
        "beta".to_string()
    } else {
        "stable".to_string()
    };
    write_updater_channel(&app, &c)?;
    let _ = set_updater_state(
        &app,
        json!({
          "message": format!("Update channel set to {}.", c),
          "status": "idle"
        }),
    )?;
    Ok(c)
}

#[command]
pub async fn updater_check(app: tauri::AppHandle) -> AppResult<bool> {
    let channel = read_updater_channel(&app);
    let _ = updater_set_status(
        &app,
        "checking",
        &format!("Checking for updates ({channel} channel)..."),
    )?;
    let updater = match build_updater(&app, &channel) {
        Ok(v) => v,
        Err(err) => {
            let _ = set_updater_state(
                &app,
                json!({
                  "status": "error",
                  "message": err,
                  "progressPercent": Value::Null
                }),
            );
            let _ = clear_pending_update_state(&app);
            return Ok(false);
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let latest = update.version.to_string();
            store_pending_update(&app, &update)?;
            let _ = clear_downloaded_update_bytes(&app);
            let _ = set_updater_state(
                &app,
                json!({
                  "status": "update-available",
                  "latestVersion": latest,
                  "message": format!("Update available on {channel} channel."),
                  "progressPercent": Value::Null
                }),
            )?;
            Ok(true)
        }
        Ok(None) => {
            let _ = clear_pending_update_state(&app);
            let _ = set_updater_state(
                &app,
                json!({
                  "status": "up-to-date",
                  "latestVersion": Value::Null,
                  "message": format!("No updates available on {channel} channel."),
                  "progressPercent": Value::Null
                }),
            )?;
            Ok(false)
        }
        Err(err) => {
            let _ = clear_pending_update_state(&app);
            let _ = set_updater_state(
                &app,
                json!({
                  "status": "error",
                  "message": format!("Update check failed: {err}"),
                  "progressPercent": Value::Null
                }),
            )?;
            Ok(false)
        }
    }
}

#[command]
pub async fn updater_download(app: tauri::AppHandle) -> AppResult<bool> {
    let mut update = take_pending_update(&app)?;
    if update.is_none() {
        let available = updater_check(app.clone()).await?;
        if !available {
            return Ok(false);
        }
        update = take_pending_update(&app)?;
    }

    let Some(update) = update else {
        let _ = set_updater_state(
            &app,
            json!({
              "status": "error",
              "message": "No pending update available to download.",
              "progressPercent": Value::Null
            }),
        )?;
        return Ok(false);
    };

    let latest = update.version.to_string();
    let _ = set_updater_state(
        &app,
        json!({
          "status": "downloading",
          "latestVersion": latest,
          "message": "Downloading update...",
          "progressPercent": 0.0
        }),
    )?;

    let app_for_chunk = app.clone();
    let mut downloaded = 0usize;
    let downloaded_bytes = match update
        .download(
            move |chunk_len, content_len| {
                downloaded = downloaded.saturating_add(chunk_len);
                let pct = content_len
                    .and_then(|total| {
                        if total == 0 {
                            None
                        } else {
                            Some(((downloaded as f64 / total as f64) * 100.0).min(100.0))
                        }
                    })
                    .unwrap_or(0.0);
                let _ = set_updater_state(
                    &app_for_chunk,
                    json!({
                      "status": "downloading",
                      "message": "Downloading update...",
                      "progressPercent": pct
                    }),
                );
            },
            || {},
        )
        .await
    {
        Ok(bytes) => bytes,
        Err(err) => {
            let _ = set_updater_state(
                &app,
                json!({
                  "status": "error",
                  "message": format!("Update download failed: {err}"),
                  "progressPercent": Value::Null
                }),
            )?;
            let _ = clear_pending_update_state(&app);
            return Ok(false);
        }
    };

    store_pending_update(&app, &update)?;
    store_downloaded_update_bytes(&app, downloaded_bytes)?;
    let _ = set_updater_state(
        &app,
        json!({
          "status": "downloaded",
          "latestVersion": update.version.to_string(),
          "message": "Update downloaded. Ready to install.",
          "progressPercent": 100.0
        }),
    )?;
    Ok(true)
}

#[command]
pub fn updater_install(app: tauri::AppHandle) -> AppResult<bool> {
    let update = take_pending_update(&app)?;
    let Some(update) = update else {
        let _ = set_updater_state(
            &app,
            json!({
              "status": "error",
              "message": "No downloaded update available to install.",
              "progressPercent": Value::Null
            }),
        )?;
        return Ok(false);
    };
    let bytes = take_downloaded_update_bytes(&app)?;
    let Some(bytes) = bytes else {
        let _ = store_pending_update(&app, &update);
        let _ = set_updater_state(
            &app,
            json!({
              "status": "error",
              "message": "Update payload not found. Download the update again.",
              "progressPercent": Value::Null
            }),
        )?;
        return Ok(false);
    };

    match update.install(bytes) {
        Ok(_) => {
            let _ = set_updater_state(
                &app,
                json!({
                  "status": "idle",
                  "latestVersion": update.version.to_string(),
                  "message": "Update installed. Restarting launcher...",
                  "progressPercent": Value::Null
                }),
            )?;
            app.request_restart();
            Ok(true)
        }
        Err(err) => {
            let _ = store_pending_update(&app, &update);
            let _ = set_updater_state(
                &app,
                json!({
                  "status": "error",
                  "message": format!("Update install failed: {err}"),
                  "progressPercent": Value::Null
                }),
            )?;
            Ok(false)
        }
    }
}

fn is_virtual_gpu_name(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    l.contains("virtual")
        || l.contains("basic render")
        || l.contains("microsoft basic")
        || l.contains("remote display")
        || l.contains("mirror driver")
        || l.contains("indirect display")
}

fn pick_best_gpu_name(mut names: Vec<String>) -> Option<String> {
    names.retain(|x| !x.trim().is_empty());
    if names.is_empty() {
        return None;
    }
    if let Some(real) = names.iter().find(|x| !is_virtual_gpu_name(x)) {
        return Some(real.trim().to_string());
    }
    names.first().map(|x| x.trim().to_string())
}

fn detect_gpu_model() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // Prefer PowerShell CIM because it's more reliable than WMIC on newer Windows builds.
        if let Ok(out) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
            ])
            .output()
        {
            let raw = String::from_utf8_lossy(&out.stdout);
            let names: Vec<String> = raw
                .lines()
                .map(|x| x.trim().to_string())
                .filter(|x| !x.is_empty())
                .collect();
            if let Some(best) = pick_best_gpu_name(names) {
                return Some(best);
            }
        }

        if let Ok(out) = std::process::Command::new("wmic")
            .args(["path", "win32_VideoController", "get", "name"])
            .output()
        {
            let raw = String::from_utf8_lossy(&out.stdout);
            let names: Vec<String> = raw
                .lines()
                .map(|x| x.trim().to_string())
                .filter(|x| !x.is_empty() && x.to_ascii_lowercase() != "name")
                .collect();
            if let Some(best) = pick_best_gpu_name(names) {
                return Some(best);
            }
        }
    }
    None
}

fn hardware_summary() -> Value {
    let total_ram_mb = (sys_info_total_mem_mb()).unwrap_or(8192);
    let cpu_cores = std::thread::available_parallelism()
        .map(|v| v.get() as u64)
        .unwrap_or(1);
    let cpu_model =
        std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_else(|_| "Unknown CPU".to_string());
    json!({
      "totalRamMb": total_ram_mb,
      "cpuCores": cpu_cores,
      "cpuModel": cpu_model,
      "gpuModel": detect_gpu_model()
    })
}

fn sys_info_total_mem_mb() -> Option<u64> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = std::process::Command::new("wmic")
            .args(["computersystem", "get", "TotalPhysicalMemory"])
            .output()
        {
            let raw = String::from_utf8_lossy(&out.stdout);
            for line in raw.lines() {
                let t = line.trim();
                if t.chars().all(|c| c.is_ascii_digit()) && !t.is_empty() {
                    if let Ok(bytes) = t.parse::<u64>() {
                        return Some(bytes / (1024 * 1024));
                    }
                }
            }
        }
    }
    None
}

fn calc_recommended_memory_mb(total_ram_mb: u64, profile: &str) -> u64 {
    let reserve_mb: u64 = 2048;
    let cap = std::cmp::max(2048, total_ram_mb.saturating_sub(reserve_mb));
    let raw = if profile == "conservative" {
        (total_ram_mb as f64 * 0.25) as u64
    } else if profile == "aggressive" {
        (total_ram_mb as f64 * 0.5) as u64
    } else {
        (total_ram_mb as f64 * 0.33) as u64
    };
    let rounded = std::cmp::max(2048, std::cmp::min(cap, (raw / 256) * 256));
    rounded
}

fn optimizer_profile_norm(profile: &str) -> String {
    let p = profile.trim().to_ascii_lowercase();
    if p == "aggressive" || p == "conservative" {
        p
    } else {
        "balanced".to_string()
    }
}

fn build_optimizer_preview(profile: &str) -> Value {
    let prof = optimizer_profile_norm(profile);
    let hw = hardware_summary();
    let total_ram_mb = hw
        .get("totalRamMb")
        .and_then(|v| v.as_u64())
        .unwrap_or(8192);
    let memory_mb = calc_recommended_memory_mb(total_ram_mb, &prof);
    let (gc, jvm_args, mods_to_enable): (&str, &str, Vec<&str>) = if prof == "aggressive" {
        (
      "ZGC",
      "-XX:+UnlockExperimentalVMOptions -XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch -XX:+DisableExplicitGC",
      PERF_MOD_IDS.to_vec(),
    )
    } else if prof == "conservative" {
        (
            "G1GC",
            "-XX:+UseG1GC -XX:MaxGCPauseMillis=75 -XX:+ParallelRefProcEnabled",
            PERF_MOD_IDS
                .iter()
                .copied()
                .filter(|x| *x != "c2me")
                .collect(),
        )
    } else {
        (
      "G1GC",
      "-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+ParallelRefProcEnabled -XX:+UnlockExperimentalVMOptions",
      PERF_MOD_IDS.to_vec(),
    )
    };
    json!({
      "profile": prof,
      "hardware": hw,
      "memoryMb": memory_mb,
      "jvmArgs": jvm_args,
      "gc": gc,
      "modsToEnable": mods_to_enable
    })
}

#[command]
pub fn optimizer_preview(profile: String) -> AppResult<Value> {
    Ok(build_optimizer_preview(&profile))
}

#[command]
pub async fn optimizer_apply(
    app: tauri::AppHandle,
    instance_id: String,
    profile: String,
) -> AppResult<Value> {
    let db = runtime_ops::instances_list(app.clone())?;
    let inst = db
        .get("instances")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|x| x.get("id").and_then(|v| v.as_str()) == Some(instance_id.as_str()))
                .cloned()
        })
        .ok_or_else(|| "Instance not found".to_string())?;
    let preview = build_optimizer_preview(&profile);
    let backup = json!({
      "memoryMb": inst.get("memoryMb").and_then(|v| v.as_u64()).unwrap_or(4096),
      "jvmArgsOverride": inst.get("jvmArgsOverride").cloned().unwrap_or(Value::Null)
    });
    let patch = json!({
      "memoryMb": preview.get("memoryMb").and_then(|v| v.as_u64()).unwrap_or(4096),
      "jvmArgsOverride": preview.get("jvmArgs").and_then(|v| v.as_str()).unwrap_or(""),
      "optimizerBackup": backup
    });
    let _ = runtime_ops::instances_update(app.clone(), instance_id.clone(), patch)?;
    let wanted: Vec<String> = preview
        .get("modsToEnable")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();
    for mod_id in PERF_MOD_IDS {
        let should_enable = wanted.iter().any(|x| x == mod_id);
        let _ = runtime_ops::mods_set_enabled(
            app.clone(),
            instance_id.clone(),
            (*mod_id).to_string(),
            should_enable,
        );
    }
    let mc_version = inst
        .get("mcVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let _ = runtime_ops::mods_refresh(app.clone(), instance_id.clone(), mc_version).await;
    Ok(preview)
}

#[command]
pub fn optimizer_restore(app: tauri::AppHandle, instance_id: String) -> AppResult<bool> {
    let db = runtime_ops::instances_list(app.clone())?;
    let inst = db
        .get("instances")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|x| x.get("id").and_then(|v| v.as_str()) == Some(instance_id.as_str()))
                .cloned()
        })
        .ok_or_else(|| "Instance not found".to_string())?;
    let backup = inst.get("optimizerBackup").cloned().unwrap_or(Value::Null);
    if !backup.is_object() {
        return Err("No optimizer backup found for this instance".to_string());
    }
    let patch = json!({
      "memoryMb": backup.get("memoryMb").and_then(|v| v.as_u64()).unwrap_or(4096),
      "jvmArgsOverride": backup.get("jvmArgsOverride").cloned().unwrap_or(Value::Null),
      "optimizerBackup": Value::Null
    });
    let _ = runtime_ops::instances_update(app, instance_id, patch)?;
    Ok(true)
}

fn benchmark_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
    Ok(instances_root(app)?
        .join(instance_id)
        .join("benchmark-results.json"))
}

fn read_benchmarks(app: &tauri::AppHandle, instance_id: &str) -> AppResult<Vec<Value>> {
    let p = benchmark_path(app, instance_id)?;
    Ok(read_json_file(&p, Vec::<Value>::new()))
}

fn write_benchmarks(app: &tauri::AppHandle, instance_id: &str, runs: &[Value]) -> AppResult<()> {
    let p = benchmark_path(app, instance_id)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(into_error)?;
    }
    fs::write(p, serde_json::to_string_pretty(runs).map_err(into_error)?).map_err(into_error)?;
    Ok(())
}

#[command]
pub fn benchmark_list(app: tauri::AppHandle, instance_id: String) -> AppResult<Vec<Value>> {
    read_benchmarks(&app, &instance_id)
}

#[command]
pub fn benchmark_run(
    app: tauri::AppHandle,
    instance_id: String,
    profile: Option<String>,
) -> AppResult<Value> {
    let prof = optimizer_profile_norm(profile.as_deref().unwrap_or("balanced"));
    let db = runtime_ops::instances_list(app.clone())?;
    let inst = db
        .get("instances")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|x| x.get("id").and_then(|v| v.as_str()) == Some(instance_id.as_str()))
                .cloned()
        })
        .ok_or_else(|| "Instance not found".to_string())?;
    let hw = hardware_summary();
    let mem = inst
        .get("memoryMb")
        .and_then(|v| v.as_u64())
        .unwrap_or(4096);
    let cores = hw.get("cpuCores").and_then(|v| v.as_u64()).unwrap_or(8);
    let ram_factor = (mem as f64 / 4096.0).clamp(0.7, 1.4);
    let core_factor = (cores as f64 / 8.0).clamp(0.8, 1.5);
    let base = 90.0 * ram_factor * core_factor;
    let profile_factor = if prof == "aggressive" {
        1.1
    } else if prof == "conservative" {
        0.9
    } else {
        1.0
    };
    let avg = (base * profile_factor).round() as u64;
    let low = ((avg as f64) * 0.72).round() as u64;
    let rss_mb = ((std::process::id() as u64) % 256) + 512;
    let run = json!({
      "id": now_ms().to_string(),
      "createdAt": chrono::Utc::now().to_rfc3339(),
      "profile": prof,
      "avgFps": avg,
      "low1Fps": low,
      "maxMemoryMb": rss_mb,
      "durationMs": 1,
      "note": "Synthetic baseline benchmark (non-world-mutating)."
    });
    let mut runs = read_benchmarks(&app, &instance_id)?;
    runs.insert(0, run.clone());
    if runs.len() > 50 {
        runs.truncate(50);
    }
    write_benchmarks(&app, &instance_id, &runs)?;
    Ok(run)
}

fn add_file_to_zip_if_exists(
    zip: &mut ZipWriter<fs::File>,
    disk_path: &Path,
    zip_path: &str,
    max_bytes: usize,
) -> AppResult<()> {
    if !disk_path.exists() {
        return Ok(());
    }
    let st = fs::metadata(disk_path).map_err(into_error)?;
    if !st.is_file() {
        return Ok(());
    }
    let mut file = fs::File::open(disk_path).map_err(into_error)?;
    let mut data = Vec::new();
    if st.len() as usize <= max_bytes {
        file.read_to_end(&mut data).map_err(into_error)?;
    } else {
        let mut all = Vec::new();
        file.read_to_end(&mut all).map_err(into_error)?;
        let start = all.len().saturating_sub(max_bytes);
        data.extend_from_slice(&all[start..]);
    }
    zip.start_file(
        zip_path.replace('\\', "/"),
        SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
    )
    .map_err(into_error)?;
    zip.write_all(&data).map_err(into_error)?;
    Ok(())
}

#[command]
pub fn diagnostics_export(app: tauri::AppHandle, _window: Window) -> AppResult<Value> {
    let picked = rfd::FileDialog::new()
        .add_filter("Zip", &["zip"])
        .set_file_name("fishbattery-diagnostics.zip")
        .save_file();
    let Some(path) = picked else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(into_error)?;
    }
    let out = fs::File::create(&path).map_err(into_error)?;
    let mut zip = ZipWriter::new(out);

    let meta = json!({
      "createdAt": chrono::Utc::now().to_rfc3339(),
      "appVersion": app.package_info().version.to_string(),
      "platform": std::env::consts::OS,
      "arch": std::env::consts::ARCH,
    });
    zip.start_file(
        "meta/system.json",
        SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
    )
    .map_err(into_error)?;
    zip.write_all(
        serde_json::to_string_pretty(&meta)
            .map_err(into_error)?
            .as_bytes(),
    )
    .map_err(into_error)?;

    let app_data = app_data_root(&app)?;
    let _ = add_file_to_zip_if_exists(
        &mut zip,
        &instances_db_path(&app)?,
        "meta/instances.json",
        1024 * 1024,
    );
    let _ = add_file_to_zip_if_exists(
        &mut zip,
        &app_data.join("data").join("preflight-health.json"),
        "meta/preflight-health.json",
        1024 * 1024,
    );
    let _ = add_file_to_zip_if_exists(
        &mut zip,
        &app_data.join("data").join("logs").join("latest.log"),
        "logs/latest.log",
        1024 * 1024,
    );
    let _ = add_file_to_zip_if_exists(
        &mut zip,
        &app_data.join("data").join("logs").join("debug.log"),
        "logs/debug.log",
        1024 * 1024,
    );
    let _ = add_file_to_zip_if_exists(
        &mut zip,
        &app_data.join("data").join("logs").join("stderr_stream.log"),
        "logs/stderr_stream.log",
        1024 * 1024,
    );
    zip.finish().map_err(into_error)?;

    Ok(json!({
      "ok": true,
      "canceled": false,
      "path": path.to_string_lossy().to_string()
    }))
}
