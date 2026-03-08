use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::Manager;

use crate::error::{into_error, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAccount {
  pub id: String,
  pub username: String,
  #[serde(rename = "mclcAuth")]
  pub mclc_auth: serde_json::Value,
  #[serde(rename = "accessToken")]
  pub access_token: Option<String>,
  #[serde(rename = "msmcRefreshToken")]
  pub msmc_refresh_token: Option<String>,
  #[serde(rename = "addedAt")]
  pub added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountsDb {
  #[serde(rename = "activeId")]
  pub active_id: Option<String>,
  pub accounts: Vec<StoredAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalCapeItem {
  pub id: String,
  pub name: String,
  pub tier: String,
  #[serde(rename = "fileName")]
  pub file_name: String,
  #[serde(rename = "fullPath")]
  pub full_path: String,
  #[serde(rename = "previewDataUrl")]
  pub preview_data_url: String,
  #[serde(rename = "downloadUrl")]
  pub download_url: Option<String>,
  #[serde(rename = "fileDataUrl")]
  pub file_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalCapeCatalog {
  pub roots: Vec<String>,
  pub items: Vec<LocalCapeItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalCapeSelection {
  #[serde(rename = "accountId")]
  pub account_id: String,
  #[serde(rename = "capeId")]
  pub cape_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalCapeSelectionDb {
  #[serde(rename = "byAccountId")]
  by_account_id: HashMap<String, Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LauncherAccountEntry {
  id: String,
  #[serde(rename = "subscriptionTier")]
  subscription_tier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LauncherAccountDb {
  #[serde(rename = "activeAccountId")]
  active_account_id: Option<String>,
  accounts: Vec<LauncherAccountEntry>,
  #[serde(rename = "updatedAt")]
  updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LauncherSessionDb {
  #[serde(rename = "accessToken")]
  access_token: Option<String>,
  #[serde(rename = "refreshToken")]
  refresh_token: Option<String>,
  #[serde(rename = "accountId")]
  account_id: Option<String>,
  #[serde(rename = "updatedAt")]
  updated_at: Option<u64>,
}

fn safe_read_json<T>(path: &Path, fallback: T) -> T
where
  T: serde::de::DeserializeOwned,
{
  match fs::read_to_string(path) {
    Ok(raw) => serde_json::from_str(&raw).unwrap_or(fallback),
    Err(_) => fallback,
  }
}

fn safe_write_json<T>(path: &Path, value: &T) -> AppResult<()>
where
  T: ?Sized + Serialize,
{
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(into_error)?;
  }
  let raw = serde_json::to_string_pretty(value).map_err(into_error)?;
  fs::write(path, raw).map_err(into_error)?;
  Ok(())
}

fn app_data_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  app.path().app_data_dir().map_err(into_error)
}

fn accounts_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app_data_root(app)?.join("data").join("accounts.json"))
}

fn account_avatar_path(app: &tauri::AppHandle, id: &str) -> AppResult<PathBuf> {
  let safe_id = id
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
    .collect::<String>();
  Ok(app_data_root(app)?
    .join("data")
    .join("account-avatars")
    .join(format!("{safe_id}.png")))
}

fn read_avatar_data_url(path: &Path) -> Option<String> {
  let bytes = fs::read(path).ok()?;
  if bytes.is_empty() {
    return None;
  }
  Some(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

async fn fetch_avatar_to_cache(path: &Path, id: &str, username: &str) -> AppResult<()> {
  let compact = id.replace('-', "");
  if compact.trim().is_empty() {
    return Err("accounts_get_avatar: account UUID missing".to_string());
  }
  let safe_name = username.trim();
  let mut urls = vec![
    format!("https://crafatar.com/avatars/{compact}?size=128&overlay"),
    format!("https://mc-heads.net/avatar/{compact}/128"),
  ];
  if !safe_name.is_empty() {
    urls.push(format!(
      "https://mc-heads.net/avatar/{}/128",
      urlencoding::encode(safe_name)
    ));
  }

  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(into_error)?;
  }

  let client = reqwest::Client::new();
  let mut last_error = String::new();
  for url in urls {
    let res = match client
      .get(&url)
      .header("User-Agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
    {
      Ok(v) => v,
      Err(e) => {
        last_error = e.to_string();
        continue;
      }
    };
    if !res.status().is_success() {
      last_error = format!("{} -> {}", url, res.status());
      continue;
    }
    let bytes = match res.bytes().await {
      Ok(v) if !v.is_empty() => v,
      Ok(_) => {
        last_error = format!("{url} -> empty");
        continue;
      }
      Err(e) => {
        last_error = e.to_string();
        continue;
      }
    };
    fs::write(path, bytes).map_err(into_error)?;
    return Ok(());
  }

  Err(format!("accounts_get_avatar: avatar fetch failed ({last_error})"))
}

fn read_accounts_db(app: &tauri::AppHandle) -> AppResult<AccountsDb> {
  let path = accounts_db_path(app)?;
  Ok(safe_read_json(
    &path,
    AccountsDb {
      active_id: None,
      accounts: vec![],
    },
  ))
}

fn write_accounts_db(app: &tauri::AppHandle, db: &AccountsDb) -> AppResult<()> {
  let path = accounts_db_path(app)?;
  safe_write_json(&path, db)
}

fn selection_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app_data_root(app)?.join("capes").join("selection.json"))
}

fn launcher_accounts_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app_data_root(app)?.join("data").join("launcher-accounts.json"))
}

fn launcher_session_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app_data_root(app)?.join("data").join("launcher-session.json"))
}

fn capes_catalog_cache_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app_data_root(app)?.join("capes").join("catalog.json"))
}

fn read_selection_db(app: &tauri::AppHandle) -> AppResult<LocalCapeSelectionDb> {
  let path = selection_db_path(app)?;
  Ok(safe_read_json(
    &path,
    LocalCapeSelectionDb {
      by_account_id: HashMap::new(),
    },
  ))
}

fn write_selection_db(app: &tauri::AppHandle, db: &LocalCapeSelectionDb) -> AppResult<()> {
  let path = selection_db_path(app)?;
  safe_write_json(&path, db)
}

fn read_launcher_accounts_db(app: &tauri::AppHandle) -> AppResult<LauncherAccountDb> {
  let path = launcher_accounts_db_path(app)?;
  Ok(safe_read_json(
    &path,
    LauncherAccountDb {
      active_account_id: None,
      accounts: vec![],
      updated_at: None,
    },
  ))
}

fn write_launcher_accounts_db(app: &tauri::AppHandle, db: &LauncherAccountDb) -> AppResult<()> {
  let path = launcher_accounts_db_path(app)?;
  safe_write_json(&path, db)
}

fn read_launcher_session_db(app: &tauri::AppHandle) -> AppResult<LauncherSessionDb> {
  let path = launcher_session_db_path(app)?;
  Ok(safe_read_json(
    &path,
    LauncherSessionDb {
      access_token: None,
      refresh_token: None,
      account_id: None,
      updated_at: None,
    },
  ))
}

fn write_launcher_session_db(app: &tauri::AppHandle, db: &LauncherSessionDb) -> AppResult<()> {
  let path = launcher_session_db_path(app)?;
  safe_write_json(&path, db)
}

fn read_capes_catalog_cache(app: &tauri::AppHandle) -> AppResult<LocalCapeCatalog> {
  let path = capes_catalog_cache_path(app)?;
  Ok(safe_read_json(
    &path,
    LocalCapeCatalog {
      roots: vec!["cloud".to_string()],
      items: vec![],
    },
  ))
}

fn write_capes_catalog_cache(app: &tauri::AppHandle, catalog: &LocalCapeCatalog) -> AppResult<()> {
  let path = capes_catalog_cache_path(app)?;
  safe_write_json(&path, catalog)
}

fn normalize_tier(raw: Option<&str>) -> &'static str {
  match raw.unwrap_or("").trim().to_ascii_lowercase().as_str() {
    "founder" => "founder",
    "premium" => "premium",
    _ => "free",
  }
}

fn current_launcher_tier(app: &tauri::AppHandle) -> &'static str {
  let db = match read_launcher_accounts_db(app) {
    Ok(v) => v,
    Err(_) => return "free",
  };
  let active = db
    .accounts
    .iter()
    .find(|a| db.active_account_id.as_deref() == Some(a.id.as_str()))
    .or_else(|| db.accounts.first());
  normalize_tier(active.and_then(|a| a.subscription_tier.as_deref()))
}

fn can_use_cape_tier(app: &tauri::AppHandle, tier: &str) -> bool {
  let launcher_tier = current_launcher_tier(app);
  match tier {
    "founder" => launcher_tier == "founder",
    "premium" => launcher_tier == "premium" || launcher_tier == "founder",
    _ => true,
  }
}

fn find_cape_by_id<'a>(catalog: &'a LocalCapeCatalog, cape_id: &str) -> Option<&'a LocalCapeItem> {
  catalog.items.iter().find(|item| item.id == cape_id)
}

fn repo_root() -> PathBuf {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Some(parent) = manifest.parent() {
    candidates.push(parent.to_path_buf());
    if let Some(grand) = parent.parent() {
      candidates.push(grand.to_path_buf());
    }
  }
  candidates.push(manifest.clone());
  for candidate in candidates {
    if candidate.join("scripts").is_dir() && candidate.join("package.json").is_file() {
      return candidate;
    }
  }
  manifest
}

fn resolve_msmc_runtime_root(app: &tauri::AppHandle) -> Option<PathBuf> {
  fn has_login_script(root: &Path) -> bool {
    root.join("scripts").join("tauri-msmc-login.mjs").is_file()
  }

  fn find_runtime_root_in_tree(base: &Path, depth: usize) -> Option<PathBuf> {
    if depth == 0 {
      return None;
    }
    let entries = fs::read_dir(base).ok()?;
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_dir() {
        if has_login_script(&path) {
          return Some(path);
        }
        if let Some(found) = find_runtime_root_in_tree(&path, depth - 1) {
          return Some(found);
        }
      }
    }
    None
  }

  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join("msmc-runtime"));
    candidates.push(resource_dir.clone());
    if let Some(found) = find_runtime_root_in_tree(&resource_dir, 3) {
      candidates.push(found);
    }
  }
  if let Ok(exe_dir) = app.path().executable_dir() {
    candidates.push(exe_dir.join("resources").join("msmc-runtime"));
    candidates.push(exe_dir.join("resources"));
    candidates.push(exe_dir.join("msmc-runtime"));
  }
  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.join("src-tauri").join("resources").join("msmc-runtime"));
    candidates.push(cwd.join("resources").join("msmc-runtime"));
    candidates.push(cwd.join("msmc-runtime"));
  }
  candidates.push(repo_root().join("src-tauri").join("resources").join("msmc-runtime"));
  candidates.push(repo_root());

  candidates.into_iter().find(|path| has_login_script(path))
}

fn launcher_api_base() -> String {
  for key in ["FISHBATTERY_ACCOUNT_API", "FISHBATTERY_ACCOUNT_API_URL"] {
    let raw = std::env::var(key).unwrap_or_default();
    let trimmed = raw.trim().trim_end_matches('/').to_string();
    if !trimmed.is_empty() {
      return trimmed;
    }
  }
  "https://api.fishbattery.app".to_string()
}

fn launcher_api_path(env_key: &str, fallback: &str) -> String {
  let raw = std::env::var(env_key).unwrap_or_default();
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return fallback.to_string();
  }
  if trimmed.starts_with('/') {
    trimmed.to_string()
  } else {
    format!("/{trimmed}")
  }
}

fn cape_catalog_path() -> String {
  launcher_api_path("FISHBATTERY_ACCOUNT_CAPES_PATH", "/v1/capes/launcher")
}

fn cape_catalog_public_path() -> String {
  launcher_api_path(
    "FISHBATTERY_ACCOUNT_CAPES_PUBLIC_PATH",
    "/v1/capes/launcher/public",
  )
}

fn cape_selected_path() -> String {
  launcher_api_path(
    "FISHBATTERY_ACCOUNT_CAPES_SELECTED_PATH",
    "/v1/capes/launcher/selected",
  )
}

fn absolute_url_from_base(base: &str, raw: &str) -> String {
  let value = raw.trim();
  if value.is_empty() {
    return String::new();
  }
  if value.starts_with("data:") || value.starts_with("http://") || value.starts_with("https://") {
    return value.to_string();
  }
  match url::Url::parse(base).and_then(|b| b.join(value)) {
    Ok(u) => u.to_string(),
    Err(_) => value.to_string(),
  }
}

fn pick_first_string(values: &[Option<String>]) -> String {
  values
    .iter()
    .flatten()
    .map(|s| s.trim().to_string())
    .find(|s| !s.is_empty())
    .unwrap_or_default()
}

fn sanitize_cape_id(value: &str) -> String {
  value
    .trim()
    .to_ascii_lowercase()
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
        c
      } else {
        '_'
      }
    })
    .collect()
}

fn infer_ext(file_name: &str, fallback_url: Option<&str>) -> &'static str {
  let name = file_name.to_ascii_lowercase();
  if name.ends_with(".jpg") || name.ends_with(".jpeg") {
    return ".jpg";
  }
  if name.ends_with(".webp") {
    return ".webp";
  }
  if name.ends_with(".bmp") {
    return ".bmp";
  }
  if name.ends_with(".gif") {
    return ".gif";
  }
  if let Some(url) = fallback_url {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".jpg") || lower.contains(".jpeg") {
      return ".jpg";
    }
    if lower.contains(".webp") {
      return ".webp";
    }
    if lower.contains(".bmp") {
      return ".bmp";
    }
    if lower.contains(".gif") {
      return ".gif";
    }
  }
  ".png"
}

fn normalize_cape_tier(raw: Option<&str>) -> String {
  match raw.unwrap_or_default().trim().to_ascii_lowercase().as_str() {
    "founder" => "founder".to_string(),
    "premium" => "premium".to_string(),
    _ => "free".to_string(),
  }
}

fn capes_cache_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app_data_root(app)?.join("capes").join("cache"))
}

fn local_capes_empty() -> LocalCapeCatalog {
  LocalCapeCatalog {
    roots: vec!["cloud".to_string()],
    items: vec![],
  }
}

async fn read_json_response(res: reqwest::Response) -> AppResult<serde_json::Value> {
  let status = res.status();
  let text = res.text().await.map_err(into_error)?;
  if !status.is_success() {
    return Err(format!(
      "Fishbattery cape API returned {}: {}",
      status.as_u16(),
      if text.trim().is_empty() {
        "Unknown error".to_string()
      } else {
        text.trim().to_string()
      }
    ));
  }
  serde_json::from_str::<serde_json::Value>(&text).map_err(into_error)
}

async fn fetch_cape_catalog_payload(app: &tauri::AppHandle) -> AppResult<serde_json::Value> {
  let base = launcher_api_base();
  let client = reqwest::Client::new();
  let session = read_launcher_session_db(app).ok();
  let access_token = session
    .and_then(|s| s.access_token)
    .unwrap_or_default()
    .trim()
    .to_string();

  if !access_token.is_empty() {
    let url = absolute_url_from_base(&base, &cape_catalog_path());
    let res = client
      .get(url)
      .header(reqwest::header::AUTHORIZATION, format!("Bearer {access_token}"))
      .header("User-Agent", "FishbatteryLauncher/0.4.4")
      .header(reqwest::header::ACCEPT, "application/json")
      .send()
      .await
      .map_err(into_error);
    if let Ok(response) = res {
      if let Ok(payload) = read_json_response(response).await {
        return Ok(payload);
      }
    }
  }

  let public_url = absolute_url_from_base(&base, &cape_catalog_public_path());
  let res = client
    .get(public_url)
    .header("User-Agent", "FishbatteryLauncher/0.4.4")
    .header(reqwest::header::ACCEPT, "application/json")
    .send()
    .await
    .map_err(into_error)?;
  read_json_response(res).await
}

async fn to_data_url_if_remote(client: &reqwest::Client, source: &str, file_name: &str) -> String {
  let src = source.trim();
  if src.is_empty() || src.starts_with("data:") {
    return src.to_string();
  }
  if !(src.starts_with("http://") || src.starts_with("https://")) {
    return src.to_string();
  }
  let res = match client.get(src).header("User-Agent", "FishbatteryLauncher/0.4.4").send().await {
    Ok(v) => v,
    Err(_) => return src.to_string(),
  };
  if !res.status().is_success() {
    return src.to_string();
  }
  let bytes = match res.bytes().await {
    Ok(v) if !v.is_empty() => v,
    _ => return src.to_string(),
  };
  let mime = match infer_ext(file_name, Some(src)) {
    ".jpg" => "image/jpeg",
    ".webp" => "image/webp",
    ".bmp" => "image/bmp",
    ".gif" => "image/gif",
    _ => "image/png",
  };
  format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

async fn payload_to_local_cape_catalog(app: &tauri::AppHandle, payload: &serde_json::Value) -> LocalCapeCatalog {
  let mut items: Vec<LocalCapeItem> = Vec::new();
  let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
  let base = launcher_api_base();
  let cache_root = capes_cache_root(app).unwrap_or_else(|_| PathBuf::from("."));
  let raw_items = payload
    .get("items")
    .and_then(|v| v.as_array())
    .or_else(|| payload.get("capes").and_then(|v| v.as_array()))
    .cloned()
    .unwrap_or_default();
  let client = reqwest::Client::new();

  for raw in raw_items {
    let id = pick_first_string(&[
      raw.get("id").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("capeId").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("slug").and_then(|v| v.as_str()).map(str::to_string),
    ]);
    if id.is_empty() || seen.contains(&id) {
      continue;
    }
    let name = pick_first_string(&[
      raw.get("name").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("title").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("displayName").and_then(|v| v.as_str()).map(str::to_string),
      Some(id.clone()),
    ]);
    let tier = normalize_cape_tier(raw.get("tier").and_then(|v| v.as_str()));
    let file_name = pick_first_string(&[
      raw.get("fileName").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("filename").and_then(|v| v.as_str()).map(str::to_string),
      Some(format!("{}.png", sanitize_cape_id(&id))),
    ]);
    let download_url_raw = pick_first_string(&[
      raw.get("downloadUrl").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("fileUrl").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("url").and_then(|v| v.as_str()).map(str::to_string),
    ]);
    let download_url = if download_url_raw.trim().is_empty() {
      None
    } else {
      Some(absolute_url_from_base(&base, &download_url_raw))
    };
    let file_data_url = raw
      .get("fileDataUrl")
      .and_then(|v| v.as_str())
      .map(|v| v.trim().to_string())
      .filter(|v| !v.is_empty());
    let preview_inline = pick_first_string(&[
      raw.get("previewDataUrl").and_then(|v| v.as_str()).map(str::to_string),
      raw.get("thumbnailDataUrl").and_then(|v| v.as_str()).map(str::to_string),
    ]);
    let preview_source_raw = if !preview_inline.is_empty() {
      preview_inline.clone()
    } else {
      pick_first_string(&[
        raw.get("previewUrl").and_then(|v| v.as_str()).map(str::to_string),
        raw.get("thumbnailUrl").and_then(|v| v.as_str()).map(str::to_string),
        raw.get("imageUrl").and_then(|v| v.as_str()).map(str::to_string),
        download_url.clone(),
      ])
    };
    let preview_source = absolute_url_from_base(&base, &preview_source_raw);
    let preview_data_url = to_data_url_if_remote(&client, &preview_source, &file_name).await;
    let ext = infer_ext(&file_name, download_url.as_deref());
    let full_path = cache_root.join(format!("{}-asset-v2{}", sanitize_cape_id(&id), ext));
    items.push(LocalCapeItem {
      id: id.clone(),
      name,
      tier,
      file_name,
      full_path: full_path.to_string_lossy().to_string(),
      preview_data_url,
      download_url,
      file_data_url,
    });
    seen.insert(id);
  }

  LocalCapeCatalog {
    roots: vec!["cloud".to_string()],
    items,
  }
}

fn decode_data_url_to_bytes(raw: &str) -> Option<Vec<u8>> {
  let value = raw.trim();
  if !value.starts_with("data:") {
    return None;
  }
  let marker = ";base64,";
  let idx = value.find(marker)?;
  let b64 = &value[idx + marker.len()..];
  STANDARD.decode(b64).ok()
}

async fn ensure_cached_cape_file(item: &LocalCapeItem) -> Option<PathBuf> {
  let full_path = PathBuf::from(item.full_path.trim());
  if full_path.is_file() {
    if let Ok(meta) = fs::metadata(&full_path) {
      if meta.len() > 0 {
        return Some(full_path);
      }
    }
  }
  if let Some(parent) = full_path.parent() {
    let _ = fs::create_dir_all(parent);
  }

  let mut bytes: Option<Vec<u8>> = None;
  if let Some(url) = item.download_url.as_deref() {
    if url.starts_with("http://") || url.starts_with("https://") {
      let client = reqwest::Client::new();
      if let Ok(res) = client
        .get(url)
        .header("User-Agent", "FishbatteryLauncher/0.4.4")
        .send()
        .await
      {
        if res.status().is_success() {
          if let Ok(buf) = res.bytes().await {
            if !buf.is_empty() {
              bytes = Some(buf.to_vec());
            }
          }
        }
      }
    }
  }
  if bytes.is_none() {
    bytes = item
      .file_data_url
      .as_deref()
      .and_then(decode_data_url_to_bytes);
  }
  let data = bytes?;
  if fs::write(&full_path, data).is_ok() {
    return Some(full_path);
  }
  None
}

async fn fetch_remote_selected_cape_id(app: &tauri::AppHandle) -> AppResult<Option<String>> {
  let session = read_launcher_session_db(app)?;
  let access_token = session
    .access_token
    .unwrap_or_default()
    .trim()
    .to_string();
  if access_token.is_empty() {
    return Err("Not signed in.".to_string());
  }
  let base = launcher_api_base();
  let url = absolute_url_from_base(&base, &cape_selected_path());
  let client = reqwest::Client::new();
  let res = client
    .get(url)
    .header(reqwest::header::AUTHORIZATION, format!("Bearer {access_token}"))
    .header(reqwest::header::ACCEPT, "application/json")
    .header("User-Agent", "FishbatteryLauncher/0.4.4")
    .send()
    .await
    .map_err(into_error)?;
  let status = res.status();
  let text = res.text().await.map_err(into_error)?;
  if status.as_u16() == 404 {
    return Err("selected endpoint unsupported".to_string());
  }
  if !status.is_success() {
    return Err(format!(
      "Fishbattery cape API returned {}: {}",
      status.as_u16(),
      if text.trim().is_empty() {
        "Unknown error".to_string()
      } else {
        text.trim().to_string()
      }
    ));
  }
  let payload = serde_json::from_str::<serde_json::Value>(&text).map_err(into_error)?;
  let selected = payload
    .get("selectedCapeId")
    .and_then(|v| v.as_str())
    .or_else(|| payload.get("capeId").and_then(|v| v.as_str()))
    .map(|v| v.trim().to_string())
    .filter(|v| !v.is_empty());
  Ok(selected)
}

async fn persist_remote_selected_cape_id(app: &tauri::AppHandle, cape_id: Option<&str>) -> AppResult<Option<String>> {
  let session = read_launcher_session_db(app)?;
  let access_token = session
    .access_token
    .unwrap_or_default()
    .trim()
    .to_string();
  if access_token.is_empty() {
    return Err("Not signed in.".to_string());
  }
  let base = launcher_api_base();
  let url = absolute_url_from_base(&base, &cape_selected_path());
  let client = reqwest::Client::new();
  let body = serde_json::json!({ "capeId": cape_id.map(str::to_string) });
  let res = client
    .put(url)
    .header(reqwest::header::AUTHORIZATION, format!("Bearer {access_token}"))
    .header(reqwest::header::ACCEPT, "application/json")
    .header("User-Agent", "FishbatteryLauncher/0.4.4")
    .json(&body)
    .send()
    .await
    .map_err(into_error)?;
  let status = res.status();
  let text = res.text().await.map_err(into_error)?;
  if status.as_u16() == 404 {
    return Err("selected endpoint unsupported".to_string());
  }
  if !status.is_success() {
    return Err(format!(
      "Fishbattery cape API returned {}: {}",
      status.as_u16(),
      if text.trim().is_empty() {
        "Unknown error".to_string()
      } else {
        text.trim().to_string()
      }
    ));
  }
  let payload = serde_json::from_str::<serde_json::Value>(&text).map_err(into_error)?;
  Ok(
    payload
      .get("selectedCapeId")
      .and_then(|v| v.as_str())
      .or_else(|| payload.get("capeId").and_then(|v| v.as_str()))
      .map(|v| v.trim().to_string())
      .filter(|v| !v.is_empty())
      .or_else(|| cape_id.map(str::to_string)),
  )
}

fn run_msmc_login_script(app: &tauri::AppHandle) -> AppResult<StoredAccount> {
  const ACCOUNT_JSON_PREFIX: &str = "__FB_ACCOUNT_JSON__:";
  let runtime_root = resolve_msmc_runtime_root(app)
    .ok_or_else(|| "accounts_add: login helper runtime is missing from app resources.".to_string())?;
  let script = runtime_root.join("scripts").join("tauri-msmc-login.mjs");
  if !script.exists() {
    return Err(format!(
      "accounts_add: helper script not found at {}",
      script.to_string_lossy()
    ));
  }

  let bundled_node_windows = runtime_root.join("bin").join("node.exe");
  let bundled_node_unix = runtime_root.join("bin").join("node");
  let node_cmd = if bundled_node_windows.is_file() {
    bundled_node_windows
  } else if bundled_node_unix.is_file() {
    bundled_node_unix
  } else {
    PathBuf::from("node")
  };

  let output = Command::new(node_cmd.as_os_str())
    .arg(script.as_os_str())
    .current_dir(runtime_root.as_os_str())
    .output()
    .map_err(|e| {
      let msg = e.to_string().to_ascii_lowercase();
      if msg.contains("not found") || msg.contains("cannot find") {
        "accounts_add: Node.js is required for Microsoft login helper script.".to_string()
      } else {
        into_error(e)
      }
    })?;

  if !output.status.success() {
    let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if err.is_empty() {
      "accounts_add: Microsoft login failed".to_string()
    } else {
      err
    });
  }

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  for line in stdout.lines() {
    if let Some(payload) = line.strip_prefix(ACCOUNT_JSON_PREFIX) {
      return serde_json::from_str::<StoredAccount>(payload.trim()).map_err(into_error);
    }
  }

  if let Ok(account) = serde_json::from_str::<StoredAccount>(stdout.trim()) {
    return Ok(account);
  }

  // Some dependencies may print extra lines to stdout; recover the JSON object if present.
  let start = stdout.find('{');
  let end = stdout.rfind('}');
  if let (Some(s), Some(e)) = (start, end) {
    if e > s {
      let candidate = &stdout[s..=e];
      if let Ok(account) = serde_json::from_str::<StoredAccount>(candidate) {
        return Ok(account);
      }
    }
  }

  Err(
    "accounts_add: could not parse account payload from login helper output".to_string(),
  )
}

#[command]
pub fn accounts_list(app: tauri::AppHandle) -> AppResult<AccountsDb> {
  read_accounts_db(&app)
}

#[command]
pub async fn accounts_get_avatar(
  app: tauri::AppHandle,
  id: String,
  refresh: Option<bool>,
) -> AppResult<Option<String>> {
  let target_id = id.trim();
  if target_id.is_empty() {
    return Err("accounts_get_avatar: id missing".to_string());
  }
  let path = account_avatar_path(&app, target_id)?;
  let cached = read_avatar_data_url(&path);
  if !refresh.unwrap_or(false) {
    return Ok(cached);
  }

  let db = read_accounts_db(&app)?;
  let account = db.accounts.iter().find(|a| a.id == target_id);
  if let Some(a) = account {
    let _ = fetch_avatar_to_cache(&path, &a.id, &a.username).await;
  }

  Ok(read_avatar_data_url(&path).or(cached))
}

#[command]
pub fn accounts_add(app: tauri::AppHandle) -> AppResult<StoredAccount> {
  let account = run_msmc_login_script(&app)?;
  let mut db = read_accounts_db(&app)?;
  db.accounts.retain(|a| a.id != account.id);
  db.accounts.insert(0, account.clone());
  db.active_id = Some(account.id.clone());
  write_accounts_db(&app, &db)?;
  Ok(account)
}

#[command]
pub fn accounts_set_active(app: tauri::AppHandle, id: Option<String>) -> AppResult<AccountsDb> {
  let mut db = read_accounts_db(&app)?;
  db.active_id = id.map(|x| x.trim().to_string()).filter(|x| !x.is_empty());
  write_accounts_db(&app, &db)?;
  Ok(db)
}

#[command]
pub fn accounts_remove(app: tauri::AppHandle, id: String) -> AppResult<()> {
  let mut db = read_accounts_db(&app)?;
  let target = id.trim().to_string();
  db.accounts.retain(|a| a.id != target);
  if db.active_id.as_deref() == Some(target.as_str()) {
    db.active_id = db.accounts.first().map(|a| a.id.clone());
  }
  write_accounts_db(&app, &db)
}

#[command]
pub async fn capes_list_local(app: tauri::AppHandle) -> AppResult<LocalCapeCatalog> {
  let fetched = match fetch_cape_catalog_payload(&app).await {
    Ok(payload) => payload_to_local_cape_catalog(&app, &payload).await,
    Err(_) => read_capes_catalog_cache(&app).unwrap_or_else(|_| local_capes_empty()),
  };
  let mut catalog = fetched;
  if !can_use_cape_tier(&app, "founder") {
    catalog.items.retain(|item| item.tier != "founder");
  }
  let _ = write_capes_catalog_cache(&app, &catalog);
  Ok(catalog)
}

#[command]
pub async fn capes_get_local_selection(
  app: tauri::AppHandle,
  account_id: String,
) -> AppResult<LocalCapeSelection> {
  let account = account_id.trim().to_string();
  if account.is_empty() {
    return Err("capes_get_local_selection: accountId missing".to_string());
  }

  let mut db = read_selection_db(&app)?;
  let remote_selected = fetch_remote_selected_cape_id(&app).await.ok().flatten();
  if remote_selected.is_some() {
    db.by_account_id.insert(account.clone(), remote_selected.clone());
    write_selection_db(&app, &db)?;
  }
  let catalog = read_capes_catalog_cache(&app).unwrap_or_else(|_| local_capes_empty());
  let selected = remote_selected.or_else(|| db.by_account_id.get(&account).cloned().flatten());
  let valid = selected.filter(|id| {
    if let Some(cape) = find_cape_by_id(&catalog, id) {
      return can_use_cape_tier(&app, &cape.tier);
    }
    false
  });
  if valid.is_none() {
    db.by_account_id.insert(account.clone(), None);
    write_selection_db(&app, &db)?;
  }
  Ok(LocalCapeSelection {
    account_id: account,
    cape_id: valid,
  })
}

#[command]
pub async fn capes_set_local_selection(
  app: tauri::AppHandle,
  account_id: String,
  cape_id: Option<String>,
) -> AppResult<LocalCapeSelection> {
  let account = account_id.trim().to_string();
  if account.is_empty() {
    return Err("capes_set_local_selection: accountId missing".to_string());
  }
  let normalized = cape_id.map(|x| x.trim().to_string()).filter(|x| !x.is_empty());
  let mut catalog = read_capes_catalog_cache(&app).unwrap_or_else(|_| local_capes_empty());
  if catalog.items.is_empty() {
    catalog = capes_list_local(app.clone()).await?;
  }
  if let Some(ref chosen) = normalized {
    let item = find_cape_by_id(&catalog, chosen);
    if item.is_none() {
      return Err("capes_set_local_selection: cape not found".to_string());
    }
    let item = item.expect("checked");
    if !can_use_cape_tier(&app, &item.tier) {
      if item.tier == "founder" {
        return Err("Founder cape is available only to founder accounts.".to_string());
      }
      return Err("Launcher Premium is required to use premium capes.".to_string());
    }
    let _ = ensure_cached_cape_file(item).await;
  }
  let remote_selected = persist_remote_selected_cape_id(&app, normalized.as_deref())
    .await
    .ok()
    .flatten();
  let effective = if remote_selected.is_some() {
    remote_selected
  } else {
    normalized.clone()
  };
  if let Some(ref chosen) = effective {
    if let Some(item) = find_cape_by_id(&catalog, chosen) {
      let _ = ensure_cached_cape_file(item).await;
    }
  }
  let mut db = read_selection_db(&app)?;
  db.by_account_id.insert(account.clone(), effective.clone());
  write_selection_db(&app, &db)?;
  Ok(LocalCapeSelection {
    account_id: account,
    cape_id: effective,
  })
}

#[command]
pub fn launcher_accounts_sync(app: tauri::AppHandle, payload: serde_json::Value) -> AppResult<bool> {
  let db: LauncherAccountDb = serde_json::from_value(payload).map_err(into_error)?;
  write_launcher_accounts_db(&app, &db)?;
  Ok(true)
}

#[command]
pub fn launcher_session_sync(app: tauri::AppHandle, payload: serde_json::Value) -> AppResult<bool> {
  let db: LauncherSessionDb = serde_json::from_value(payload).map_err(into_error)?;
  write_launcher_session_db(&app, &db)?;
  Ok(true)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialMinecraftCape {
  pub id: String,
  pub name: String,
  pub url: String,
  #[serde(rename = "previewDataUrl")]
  pub preview_data_url: Option<String>,
  pub state: String,
  pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialMinecraftSkin {
  pub id: String,
  pub url: String,
  pub variant: String,
  pub alias: Option<String>,
  pub state: String,
  pub active: bool,
  #[serde(rename = "previewDataUrl")]
  pub preview_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialMinecraftCapeState {
  #[serde(rename = "accountId")]
  pub account_id: String,
  pub username: String,
  #[serde(rename = "skinUrl")]
  pub skin_url: Option<String>,
  #[serde(rename = "skinDataUrl")]
  pub skin_data_url: Option<String>,
  pub skins: Vec<OfficialMinecraftSkin>,
  #[serde(rename = "activeSkinId")]
  pub active_skin_id: Option<String>,
  pub capes: Vec<OfficialMinecraftCape>,
  #[serde(rename = "activeCapeId")]
  pub active_cape_id: Option<String>,
}

fn get_account_by_id(app: &tauri::AppHandle, account_id: &str) -> AppResult<StoredAccount> {
  let db = read_accounts_db(app)?;
  db.accounts
    .into_iter()
    .find(|a| a.id == account_id)
    .ok_or_else(|| "Minecraft account not found".to_string())
}

fn account_minecraft_token(account: &StoredAccount) -> AppResult<String> {
  let from_mclc = account
    .mclc_auth
    .get("access_token")
    .and_then(|v| v.as_str())
    .unwrap_or_default()
    .trim()
    .to_string();
  let from_mclc_alt = account
    .mclc_auth
    .get("accessToken")
    .and_then(|v| v.as_str())
    .unwrap_or_default()
    .trim()
    .to_string();
  let from_legacy = account.access_token.clone().unwrap_or_default().trim().to_string();
  let token = if !from_mclc.is_empty() {
    from_mclc
  } else if !from_mclc_alt.is_empty() {
    from_mclc_alt
  } else {
    from_legacy
  };
  if token.is_empty() {
    return Err("Minecraft access token is missing for this account. Remove and re-add the account.".to_string());
  }
  Ok(token)
}

fn map_official_cape(raw: &serde_json::Value) -> Option<OfficialMinecraftCape> {
  let id = raw.get("id")?.as_str()?.trim().to_string();
  let url = raw.get("url")?.as_str()?.trim().to_string();
  if id.is_empty() || url.is_empty() {
    return None;
  }
  let state = raw
    .get("state")
    .and_then(|v| v.as_str())
    .unwrap_or("UNKNOWN")
    .trim()
    .to_ascii_uppercase();
  let active = state == "ACTIVE";
  let alias = raw.get("alias").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
  Some(OfficialMinecraftCape {
    id: id.clone(),
    name: if alias.is_empty() { id } else { alias },
    url,
    preview_data_url: None,
    state,
    active,
  })
}

fn map_official_skin(raw: &serde_json::Value) -> Option<OfficialMinecraftSkin> {
  let id = raw.get("id")?.as_str()?.trim().to_string();
  let url = raw.get("url")?.as_str()?.trim().to_string();
  if id.is_empty() || url.is_empty() {
    return None;
  }
  let state = raw
    .get("state")
    .and_then(|v| v.as_str())
    .unwrap_or("UNKNOWN")
    .trim()
    .to_ascii_uppercase();
  let active = state == "ACTIVE";
  let variant = match raw
    .get("variant")
    .and_then(|v| v.as_str())
    .unwrap_or("CLASSIC")
    .trim()
    .to_ascii_uppercase()
    .as_str()
  {
    "SLIM" => "SLIM".to_string(),
    _ => "CLASSIC".to_string(),
  };
  let alias = raw
    .get("alias")
    .and_then(|v| v.as_str())
    .map(|v| v.trim().to_string())
    .filter(|v| !v.is_empty());
  Some(OfficialMinecraftSkin {
    id,
    url,
    variant,
    alias,
    state,
    active,
    preview_data_url: None,
  })
}

fn bytes_to_data_url(bytes: &[u8], content_type: Option<&str>) -> String {
  let mime = content_type
    .unwrap_or("image/png")
    .split(';')
    .next()
    .unwrap_or("image/png")
    .trim()
    .to_ascii_lowercase();
  let safe_mime = if mime.starts_with("image/") { mime } else { "image/png".to_string() };
  format!("data:{};base64,{}", safe_mime, STANDARD.encode(bytes))
}

async fn fetch_preview_data_url(client: &reqwest::Client, target: &str) -> Option<String> {
  let url = target.trim();
  if url.is_empty() {
    return None;
  }
  let res = client
    .get(url)
    .header("User-Agent", "FishbatteryLauncher/0.2.2")
    .send()
    .await
    .ok()?;
  if !res.status().is_success() {
    return None;
  }
  let content_type = res.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).map(str::to_string);
  let bytes = res.bytes().await.ok()?;
  if bytes.is_empty() {
    return None;
  }
  Some(bytes_to_data_url(&bytes, content_type.as_deref()))
}

async fn fetch_minecraft_profile(client: &reqwest::Client, account: &StoredAccount) -> AppResult<serde_json::Value> {
  let token = account_minecraft_token(account)?;
  let res = client
    .get("https://api.minecraftservices.com/minecraft/profile")
    .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
    .header("User-Agent", "FishbatteryLauncher/0.2.2")
    .send()
    .await
    .map_err(into_error)?;
  let status = res.status();
  let text = res.text().await.map_err(into_error)?;
  if !status.is_success() {
    if status.as_u16() == 401 || status.as_u16() == 403 {
      return Err("Minecraft session expired and could not be refreshed. Re-add this account in the launcher.".to_string());
    }
    return Err(format!(
      "Could not load official capes ({}): {}",
      status.as_u16(),
      if text.trim().is_empty() { "Unknown error" } else { text.trim() }
    ));
  }
  serde_json::from_str::<serde_json::Value>(&text).map_err(into_error)
}

async fn profile_to_cape_state(
  client: &reqwest::Client,
  account: &StoredAccount,
  profile: &serde_json::Value,
) -> OfficialMinecraftCapeState {
  let mut capes = profile
    .get("capes")
    .and_then(|v| v.as_array())
    .map(|arr| arr.iter().filter_map(map_official_cape).collect::<Vec<_>>())
    .unwrap_or_default();
  let mut skins = profile
    .get("skins")
    .and_then(|v| v.as_array())
    .map(|arr| arr.iter().filter_map(map_official_skin).collect::<Vec<_>>())
    .unwrap_or_default();

  for skin in &mut skins {
    skin.preview_data_url = fetch_preview_data_url(client, &skin.url).await;
  }
  for cape in &mut capes {
    cape.preview_data_url = fetch_preview_data_url(client, &cape.url).await;
  }

  let active_skin = skins.iter().find(|s| s.active).cloned().or_else(|| skins.first().cloned());
  let active_cape = capes.iter().find(|c| c.active).cloned();
  let skin_url = active_skin.as_ref().map(|s| s.url.clone());
  let skin_data_url = active_skin.as_ref().and_then(|s| s.preview_data_url.clone());
  OfficialMinecraftCapeState {
    account_id: account.id.clone(),
    username: account.username.clone(),
    skin_url,
    skin_data_url,
    active_skin_id: active_skin.map(|s| s.id),
    active_cape_id: active_cape.map(|c| c.id),
    skins,
    capes,
  }
}

#[command]
pub async fn capes_list_official(
  app: tauri::AppHandle,
  account_id: String,
  _force_refresh: Option<bool>,
) -> AppResult<OfficialMinecraftCapeState> {
  let normalized = account_id.trim().to_string();
  if normalized.is_empty() {
    return Err("capes_list_official: accountId missing".to_string());
  }
  let account = get_account_by_id(&app, &normalized)?;
  let client = reqwest::Client::new();
  let profile = fetch_minecraft_profile(&client, &account).await?;
  Ok(profile_to_cape_state(&client, &account, &profile).await)
}

#[command]
pub async fn capes_set_official_active(
  app: tauri::AppHandle,
  account_id: String,
  cape_id: Option<String>,
) -> AppResult<OfficialMinecraftCapeState> {
  let normalized = account_id.trim().to_string();
  if normalized.is_empty() {
    return Err("capes_set_official_active: accountId missing".to_string());
  }
  let account = get_account_by_id(&app, &normalized)?;
  let token = account_minecraft_token(&account)?;
  let client = reqwest::Client::new();
  let endpoint = "https://api.minecraftservices.com/minecraft/profile/capes/active";

  let response = if let Some(raw) = cape_id {
    let chosen = raw.trim().to_string();
    let payload = serde_json::json!({ "capeId": chosen });
    let mut res = client
      .put(endpoint)
      .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
      .header("User-Agent", "FishbatteryLauncher/0.2.2")
      .json(&payload)
      .send()
      .await
      .map_err(into_error)?;
    if !res.status().is_success() && (res.status().as_u16() == 404 || res.status().as_u16() == 405) {
      res = client
        .post(endpoint)
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
        .header("User-Agent", "FishbatteryLauncher/0.2.2")
        .json(&payload)
        .send()
        .await
        .map_err(into_error)?;
    }
    res
  } else {
    client
      .delete(endpoint)
      .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
      .header("User-Agent", "FishbatteryLauncher/0.2.2")
      .send()
      .await
      .map_err(into_error)?
  };

  if !response.status().is_success() {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    return Err(format!(
      "Could not update official cape ({}): {}",
      status.as_u16(),
      if text.trim().is_empty() { "Unknown error" } else { text.trim() }
    ));
  }

  let profile = fetch_minecraft_profile(&client, &account).await?;
  Ok(profile_to_cape_state(&client, &account, &profile).await)
}

#[command]
pub async fn skins_set_official_active(
  app: tauri::AppHandle,
  account_id: String,
  skin_id: String,
) -> AppResult<OfficialMinecraftCapeState> {
  let normalized = account_id.trim().to_string();
  let skin = skin_id.trim().to_string();
  if normalized.is_empty() {
    return Err("skins_set_official_active: accountId missing".to_string());
  }
  if skin.is_empty() {
    return Err("skins_set_official_active: skinId missing".to_string());
  }
  let account = get_account_by_id(&app, &normalized)?;
  let token = account_minecraft_token(&account)?;
  let client = reqwest::Client::new();
  let endpoint = "https://api.minecraftservices.com/minecraft/profile/skins/active";
  let payload = serde_json::json!({ "skinId": skin });
  let mut res = client
    .put(endpoint)
    .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
    .header("User-Agent", "FishbatteryLauncher/0.2.2")
    .json(&payload)
    .send()
    .await
    .map_err(into_error)?;
  if !res.status().is_success() && (res.status().as_u16() == 404 || res.status().as_u16() == 405) {
    res = client
      .post(endpoint)
      .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
      .header("User-Agent", "FishbatteryLauncher/0.2.2")
      .json(&payload)
      .send()
      .await
      .map_err(into_error)?;
  }
  if !res.status().is_success() {
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    return Err(format!(
      "Could not update official skin ({}): {}",
      status.as_u16(),
      if text.trim().is_empty() { "Unknown error" } else { text.trim() }
    ));
  }
  let profile = fetch_minecraft_profile(&client, &account).await?;
  Ok(profile_to_cape_state(&client, &account, &profile).await)
}

#[command]
pub async fn skins_upload_official(
  app: tauri::AppHandle,
  account_id: String,
  image_data_url: String,
  variant: Option<String>,
) -> AppResult<OfficialMinecraftCapeState> {
  let normalized = account_id.trim().to_string();
  if normalized.is_empty() {
    return Err("skins_upload_official: accountId missing".to_string());
  }
  let raw = image_data_url.trim();
  let prefix = "data:image/png;base64,";
  if !raw.to_ascii_lowercase().starts_with(prefix) {
    return Err("Skin must be a PNG image.".to_string());
  }
  let b64 = &raw[prefix.len()..];
  let bytes = STANDARD.decode(b64).map_err(into_error)?;
  if bytes.is_empty() {
    return Err("Skin image is empty.".to_string());
  }
  if bytes.len() > 8 * 1024 * 1024 {
    return Err("Skin image is too large.".to_string());
  }

  let account = get_account_by_id(&app, &normalized)?;
  let token = account_minecraft_token(&account)?;
  let client = reqwest::Client::new();
  let chosen_variant = match variant.unwrap_or_else(|| "CLASSIC".to_string()).to_ascii_uppercase().as_str() {
    "SLIM" => "slim",
    _ => "classic",
  };
  let part = reqwest::multipart::Part::bytes(bytes)
    .file_name("skin.png")
    .mime_str("image/png")
    .map_err(into_error)?;
  let form = reqwest::multipart::Form::new()
    .text("variant", chosen_variant.to_string())
    .part("file", part);
  let res = client
    .post("https://api.minecraftservices.com/minecraft/profile/skins")
    .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
    .header("User-Agent", "FishbatteryLauncher/0.2.2")
    .multipart(form)
    .send()
    .await
    .map_err(into_error)?;
  if !res.status().is_success() {
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    return Err(format!(
      "Could not upload skin ({}): {}",
      status.as_u16(),
      if text.trim().is_empty() { "Unknown error" } else { text.trim() }
    ));
  }
  let profile = fetch_minecraft_profile(&client, &account).await?;
  Ok(profile_to_cape_state(&client, &account, &profile).await)
}
