use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::{BTreeSet, HashSet};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use rfd::FileDialog;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::command;
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::error::{into_error, AppResult};

const ICON_EXTS: [&str; 8] = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg", ".avif"];
const MOD_CATALOG: [(&str, &str, bool, &str); 61] = [
  ("fabric-api", "Fabric API", false, "P7dR8mSH"),
  ("sodium", "Sodium", false, "AANobbMI"),
  ("lithium", "Lithium", false, "gvQqBUqZ"),
  ("ferrite-core", "FerriteCore", false, "uXXizFIs"),
  ("indium", "Indium", false, "Orvt0mRa"),
  ("immediatelyfast", "ImmediatelyFast", false, "5ZwdcRci"),
  ("entityculling", "EntityCulling", false, "NNAgCjsB"),
  ("modernfix", "ModernFix", false, "nmDcB62a"),
  ("noisium", "Noisium", false, "KuNKN7d2"),
  ("c2me", "C2ME", false, "VSNURh3q"),
  ("starlight", "Starlight", false, "H8CaAYZC"),
  ("sodium-extra", "Sodium Extra", false, "PtjYWJkn"),
  ("reeses-sodium-options", "Reese's Sodium Options", false, "Bh37bMuy"),
  ("dynamic-fps", "Dynamic FPS", false, "LQ3K71Q1"),
  ("distanthorizons", "Distant Horizons", false, "uCdwusMi"),
  ("mod-menu", "Mod Menu", true, "mOgUt4GM"),
  ("iris", "Iris Shaders", false, "YL57xq9U"),
  ("emf", "Entity Model Features", false, "4I1XuqiY"),
  ("pvp-essentials-refined", "PVP essentials Refined", false, "DlA1yH1r"),
  ("no-chat-reports", "No Chat Reports", false, "qQyHxfxd"),
  ("totemcounter", "Totem Counter", false, "T9R7YTnA"),
  ("potioncounter", "Potion Counter", false, "JzdjByS4"),
  ("wi-zoom", "WI Zoom", false, "o7DitHWP"),
  ("zoomify", "Zoomify", false, "w7ThoJFB"),
  ("better-ping-display-fabric", "Better Ping Display [Fabric]", false, "MS1ZMyR7"),
  ("health-indicators", "Health Indicators", false, "htkVd6dQ"),
  ("status-effect-timer", "Status Effect Timer", false, "T9FDHbY5"),
  ("fast-ip-ping", "Fast IP Ping", false, "9mtu0sUO"),
  ("betterhurtcam", "BetterHurtCam", false, "o4y0N2hu"),
  ("moreculling", "More Culling", false, "51shyZVL"),
  ("rrls", "Remove Reloading Screen", false, "ZP7xHXtw"),
  ("sodium-dynamic-lights", "Sodium Dynamic Lights", false, "PxQSWIcD"),
  ("scalablelux", "ScalableLux", false, "Ps1zyz6x"),
  ("healthindicator", "HealthIndicator", false, "gVFdvNDw"),
  ("badoptimizations", "BadOptimizations", false, "g96Z4WVZ"),
  ("fastquit", "FastQuit", false, "x1hIzbuY"),
  ("better-block-entities", "Better Block Entities", false, "ONZm0H7Y"),
  ("saturn", "Saturn", false, "2eT495vq"),
  ("lambdynamiclights", "LambDynamicLights", false, "yBW8D80W"),
  ("enhanced-block-entities", "Enhanced Block Entities", false, "OVuFYfre"),
  ("cull-leaves", "Cull Leaves", false, "GNxdLCoP"),
  ("fastquit-forge", "FastQuit-Forge", false, "itFaO2Tg"),
  ("polypatcher", "PolyPatcher", false, "YknNc5nN"),
  ("polysprint", "PolySprint", false, "i9xRThb3"),
  ("phosphor-legacy-forge", "Phosphor Legacy Forge", false, "oCBQFmrZ"),
  ("hytils-reborn", "Hytils Reborn", false, "nF6YaBfO"),
  ("effecttimerplus", "Effect Timer Plus", false, "JIUF2Wb5"),
  ("rebind-quick-swap", "Rebind Quick Swap", false, "pNImAg8S"),
  ("shulkerboxtooltip", "ShulkerBoxTooltip", false, "2M01OLQq"),
  ("etf", "Entity Texture Features", false, "BVzZfTc1"),
  ("embeddium", "Embeddium", false, "sk9rgfiA"),
  ("oculus", "Oculus", false, "GchcoXML"),
  ("canary", "Canary", false, "qa2H4BS9"),
  ("memoryleakfix", "Memory Leak Fix", false, "NRjRiSSD"),
  ("clumps", "Clumps", false, "Wnxd13zP"),
  ("embeddium-extra", "Embeddium (Rubidium) Extra", false, "oY2B1pjg"),
  ("xaeros-minimap", "Xaero's Minimap", false, "1bokaNcj"),
  ("xaeros-world-map", "Xaero's World Map", false, "NcUtCpym"),
  ("appleskin", "AppleSkin", false, "EsAfCjCV"),
  ("toggle-sprint", "Toggle Sprint", false, "gQ6IIk5e"),
  ("fps-reducer", "FPS Reducer", false, "iZ10HXDj"),
];
const PACK_CATALOG: [(&str, &str, &str, bool, &str); 9] = [
  ("fresh-animations", "Fresh Animations", "resourcepack", false, "50dA9Sha"),
  ("f8thful", "F8thful", "resourcepack", false, "ZrW0og1b"),
  ("better-leaves", "Better Leaves", "resourcepack", false, "uvpymuxq"),
  ("fast-better-grass", "Fast Better Grass", "resourcepack", false, "dspVZXKP"),
  ("dramatic-skys", "Dramatic Skys", "resourcepack", false, "2YyNMled"),
  ("xalis-enchanted-books", "Xali's Enchanted Books", "resourcepack", false, "ZpBKASR2"),
  ("complementary-reimagined", "Complementary Reimagined", "shaderpack", false, "HVnmMxH1"),
  ("complementary-unbound", "Complementary Unbound", "shaderpack", false, "R6NEzAwj"),
  ("photon-shader", "Photon Shader", "shaderpack", false, "lLqFfGNs"),
];

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

fn db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(instances_root(app)?.join("_instances.json"))
}

fn validate_id(id: &str) -> AppResult<String> {
  let trimmed = id.trim();
  if trimmed.is_empty() {
    return Err("instances: id missing".to_string());
  }
  if trimmed.len() > 128 {
    return Err("instances: id too long".to_string());
  }
  if !trimmed
    .chars()
    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
  {
    return Err("instances: id contains unsupported characters".to_string());
  }
  Ok(trimmed.to_string())
}

fn safe_read_db(path: &Path) -> Value {
  let fallback = json!({
    "activeInstanceId": Value::Null,
    "instances": [],
    "updatedAt": now_ms(),
  });
  match fs::read_to_string(path) {
    Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(fallback),
    Err(_) => fallback,
  }
}

fn normalize_db(mut db: Value) -> Value {
  if !db.is_object() {
    db = json!({});
  }
  if !db.get("instances").map(|v| v.is_array()).unwrap_or(false) {
    db["instances"] = json!([]);
  }
  if !db
    .get("activeInstanceId")
    .map(|v| v.is_string() || v.is_null())
    .unwrap_or(false)
  {
    db["activeInstanceId"] = Value::Null;
  }
  if !db.get("updatedAt").map(|v| v.is_number()).unwrap_or(false) {
    db["updatedAt"] = json!(now_ms());
  }
  if let Some(items) = db.get_mut("instances").and_then(|v| v.as_array_mut()) {
    for item in items {
      if !item.is_object() {
        continue;
      }
      if item.get("syncEnabled").is_none() {
        item["syncEnabled"] = json!(true);
      } else {
        item["syncEnabled"] = json!(item.get("syncEnabled").and_then(|v| v.as_bool()).unwrap_or(true));
      }
    }
  }
  db
}

fn read_db(app: &tauri::AppHandle) -> AppResult<Value> {
  let path = db_path(app)?;
  Ok(normalize_db(safe_read_db(&path)))
}

fn write_db(app: &tauri::AppHandle, db: &Value) -> AppResult<()> {
  let path = db_path(app)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(into_error)?;
  }
  let raw = serde_json::to_string_pretty(db).map_err(into_error)?;
  fs::write(path, raw).map_err(into_error)?;
  Ok(())
}

fn instance_dir(app: &tauri::AppHandle, id: &str) -> AppResult<PathBuf> {
  let safe = validate_id(id)?;
  Ok(instances_root(app)?.join(safe))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> AppResult<()> {
  fs::create_dir_all(dst).map_err(into_error)?;
  for entry in fs::read_dir(src).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let from = entry.path();
    let to = dst.join(entry.file_name());
    if from.is_dir() {
      copy_dir_recursive(&from, &to)?;
    } else {
      fs::copy(&from, &to).map_err(into_error)?;
    }
  }
  Ok(())
}

fn choose_icon_file(instance_path: &Path) -> Option<PathBuf> {
  for ext in ICON_EXTS {
    let p = instance_path.join(format!("instance-icon{ext}"));
    if p.exists() {
      return Some(p);
    }
  }
  None
}

fn clear_icon_files(instance_path: &Path) {
  for ext in ICON_EXTS {
    let p = instance_path.join(format!("instance-icon{ext}"));
    if p.exists() {
      let _ = fs::remove_file(p);
    }
  }
}

fn extension_for_content_type(content_type: &str) -> Option<&'static str> {
  let ty = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
  match ty.as_str() {
    "image/png" => Some(".png"),
    "image/jpeg" => Some(".jpg"),
    "image/webp" => Some(".webp"),
    "image/gif" => Some(".gif"),
    "image/bmp" => Some(".bmp"),
    "image/svg+xml" => Some(".svg"),
    "image/avif" => Some(".avif"),
    _ => None,
  }
}

fn ext_from_path(p: &Path) -> &'static str {
  match p
    .extension()
    .and_then(|v| v.to_str())
    .unwrap_or("")
    .to_ascii_lowercase()
    .as_str()
  {
    "jpg" | "jpeg" => ".jpg",
    "webp" => ".webp",
    "gif" => ".gif",
    "bmp" => ".bmp",
    "svg" => ".svg",
    "avif" => ".avif",
    _ => ".png",
  }
}

fn mime_for_ext(ext: &str) -> &'static str {
  match ext {
    ".jpg" | ".jpeg" => "image/jpeg",
    ".webp" => "image/webp",
    ".gif" => "image/gif",
    ".bmp" => "image/bmp",
    ".svg" => "image/svg+xml",
    ".avif" => "image/avif",
    _ => "image/png",
  }
}

fn kind_folder(kind: &str) -> AppResult<&'static str> {
  match kind {
    "mods" => Ok("mods"),
    "resourcepacks" => Ok("resourcepacks"),
    "shaderpacks" => Ok("shaderpacks"),
    _ => Err("content: invalid kind".to_string()),
  }
}

fn count_matching_files(dir: &Path, kind: &str) -> usize {
  let entries = match fs::read_dir(dir) {
    Ok(v) => v,
    Err(_) => return 0,
  };
  let mut count = 0usize;
  for ent in entries.flatten() {
    let p = ent.path();
    let meta = match ent.metadata() {
      Ok(v) => v,
      Err(_) => continue,
    };
    if !meta.is_file() {
      continue;
    }
    if is_allowed_content_file(kind, &p) {
      count += 1;
    }
  }
  count
}

fn mods_dir_candidates(app: &tauri::AppHandle, instance_id: &str) -> AppResult<Vec<PathBuf>> {
  let root = instance_dir(app, instance_id)?;
  Ok(vec![
    root.join("mods"),
    root.join(".minecraft").join("mods"),
    root.join("minecraft").join("mods"),
  ])
}

fn resolve_instance_mods_dir(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
  let root = instance_dir(app, instance_id)?;
  let candidates = mods_dir_candidates(app, instance_id)?;

  let mut best_existing: Option<(PathBuf, usize)> = None;
  for dir in candidates {
    if !dir.exists() {
      continue;
    }
    let score = count_matching_files(&dir, "mods");
    match &best_existing {
      Some((_, best_score)) if *best_score >= score => {}
      _ => best_existing = Some((dir, score)),
    }
  }

  if let Some((dir, _)) = best_existing {
    fs::create_dir_all(&dir).map_err(into_error)?;
    return Ok(dir);
  }

  let fallback = root.join("mods");
  fs::create_dir_all(&fallback).map_err(into_error)?;
  Ok(fallback)
}

fn find_existing_mod_file(app: &tauri::AppHandle, instance_id: &str, name: &str) -> AppResult<Option<PathBuf>> {
  let target = safe_basename(name);
  let target_lower = target.to_ascii_lowercase();
  for dir in mods_dir_candidates(app, instance_id)? {
    if !dir.exists() {
      continue;
    }
    let direct = dir.join(&target);
    if direct.exists() && direct.is_file() {
      return Ok(Some(direct));
    }
    let entries = match fs::read_dir(&dir) {
      Ok(v) => v,
      Err(_) => continue,
    };
    for ent in entries.flatten() {
      let path = ent.path();
      let meta = match ent.metadata() {
        Ok(v) => v,
        Err(_) => continue,
      };
      if !meta.is_file() {
        continue;
      }
      let fname = ent.file_name().to_string_lossy().to_string();
      if fname.to_ascii_lowercase() == target_lower {
        return Ok(Some(path));
      }
    }
  }
  Ok(None)
}

fn ensure_content_dir(app: &tauri::AppHandle, instance_id: &str, kind: &str) -> AppResult<PathBuf> {
  if kind == "mods" {
    return resolve_instance_mods_dir(app, instance_id);
  }
  let folder = kind_folder(kind)?;
  let dir = instance_dir(app, instance_id)?.join(folder);
  fs::create_dir_all(&dir).map_err(into_error)?;
  Ok(dir)
}

fn safe_basename(input: &str) -> String {
  input
    .rsplit(['\\', '/'])
    .next()
    .unwrap_or("")
    .chars()
    .map(|c| {
      if c.is_control() || ['<', '>', ':', '"', '/', '\\', '|', '?', '*'].contains(&c) {
        '_'
      } else {
        c
      }
    })
    .collect::<String>()
}

fn sanitize_file_name(name: &str) -> String {
  let out = safe_basename(name).replace('.', "_");
  let trimmed = out.trim();
  if trimmed.is_empty() {
    "instance".to_string()
  } else {
    trimmed.to_string()
  }
}

fn is_safe_relative_archive_path(rel: &str) -> bool {
  if rel.trim().is_empty() {
    return false;
  }
  if rel.contains('\0') {
    return false;
  }
  let p = Path::new(rel);
  if p.is_absolute() {
    return false;
  }
  !p.components().any(|c| matches!(c, std::path::Component::ParentDir))
}

fn collect_files_recursive(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> AppResult<()> {
  let entries = fs::read_dir(current).map_err(into_error)?;
  for entry in entries {
    let entry = entry.map_err(into_error)?;
    let path = entry.path();
    if path.is_dir() {
      collect_files_recursive(root, &path, out)?;
    } else if path.is_file() {
      if path.strip_prefix(root).is_ok() {
        out.push(path);
      }
    }
  }
  Ok(())
}

fn make_import_instance_id() -> String {
  format!("imp-{}", now_ms())
}

fn unique_instance_name(db: &Value, desired: &str) -> String {
  let base = desired.trim();
  let base = if base.is_empty() { "Imported Instance" } else { base };
  let mut names = std::collections::HashSet::<String>::new();
  if let Some(rows) = db.get("instances").and_then(|v| v.as_array()) {
    for row in rows {
      if let Some(name) = row.get("name").and_then(|v| v.as_str()) {
        names.insert(name.to_ascii_lowercase());
      }
    }
  }
  if !names.contains(&base.to_ascii_lowercase()) {
    return base.to_string();
  }
  let mut n = 1usize;
  loop {
    let candidate = format!("{base} (Imported {n})");
    if !names.contains(&candidate.to_ascii_lowercase()) {
      return candidate;
    }
    n += 1;
  }
}

fn is_allowed_content_file(kind: &str, file_path: &Path) -> bool {
  let lower = file_path.to_string_lossy().to_ascii_lowercase();
  if kind == "mods" {
    return lower.ends_with(".jar") || lower.ends_with(".jar.disabled");
  }
  lower.ends_with(".zip") || lower.ends_with(".zip.disabled")
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

fn write_json_file<T>(path: &Path, value: &T) -> AppResult<()>
where
  T: ?Sized + serde::Serialize,
{
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(into_error)?;
  }
  let raw = serde_json::to_string_pretty(value).map_err(into_error)?;
  fs::write(path, raw).map_err(into_error)?;
  Ok(())
}

fn instance_entry<'a>(db: &'a Value, instance_id: &str) -> Option<&'a Value> {
  db.get("instances")
    .and_then(|v| v.as_array())
    .and_then(|items| items.iter().find(|x| x.get("id").and_then(|v| v.as_str()) == Some(instance_id)))
}

fn mods_state_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
  Ok(instance_dir(app, instance_id)?.join("mods-state.json"))
}

fn packs_state_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
  Ok(instance_dir(app, instance_id)?.join("packs-state.json"))
}

fn lockfile_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
  Ok(instance_dir(app, instance_id)?.join("instance.lock.json"))
}

fn servers_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
  Ok(instance_dir(app, instance_id)?.join("servers.json"))
}

fn content_metadata_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
  Ok(instance_dir(app, instance_id)?.join("content-metadata.json"))
}

fn normalize_content_metadata(mut v: Value) -> Value {
  if !v.is_object() {
    v = json!({});
  }
  for kind in ["mods", "resourcepacks", "shaderpacks"] {
    if !v.get(kind).map(|x| x.is_object()).unwrap_or(false) {
      v[kind] = json!({});
    }
  }
  v
}

fn read_content_metadata(app: &tauri::AppHandle, instance_id: &str) -> AppResult<Value> {
  let path = content_metadata_path(app, instance_id)?;
  Ok(normalize_content_metadata(read_json_file(&path, json!({}))))
}

fn write_content_metadata(app: &tauri::AppHandle, instance_id: &str, value: &Value) -> AppResult<()> {
  let path = content_metadata_path(app, instance_id)?;
  write_json_file(&path, &normalize_content_metadata(value.clone()))
}

fn content_metadata_get(cache: &Value, kind: &str, file_name: &str) -> Option<Value> {
  let key = file_name.trim().to_ascii_lowercase();
  if key.is_empty() {
    return None;
  }
  cache.get(kind)?.get(&key).cloned()
}

fn content_metadata_put(cache: &mut Value, kind: &str, file_name: &str, meta: Value) {
  let key = file_name.trim().to_ascii_lowercase();
  if key.is_empty() {
    return;
  }
  if !cache.get(kind).map(|x| x.is_object()).unwrap_or(false) {
    cache[kind] = json!({});
  }
  let mut next = meta;
  if !next.is_object() {
    next = json!({});
  }
  next["updatedAt"] = json!(now_ms());
  cache[kind][key] = next;
}

#[command]
pub fn instances_list(app: tauri::AppHandle) -> AppResult<Value> {
  read_db(&app)
}

#[command]
pub fn instances_create(app: tauri::AppHandle, cfg: Value) -> AppResult<Value> {
  let mut db = read_db(&app)?;
  let id = cfg
    .get("id")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "instances_create: cfg.id missing".to_string())?;
  let safe_id = validate_id(id)?;

  let mut next = cfg.clone();
  next["id"] = json!(safe_id.clone());
  next["createdAt"] = json!(now_ms());
  next["syncEnabled"] = json!(cfg.get("syncEnabled").and_then(|v| v.as_bool()).unwrap_or(true));

  let items = db
    .get_mut("instances")
    .and_then(|v| v.as_array_mut())
    .ok_or_else(|| "instances_create: invalid db".to_string())?;
  items.insert(0, next.clone());
  db["activeInstanceId"] = json!(safe_id.clone());
  db["updatedAt"] = json!(now_ms());

  let dir = instance_dir(&app, &safe_id)?;
  fs::create_dir_all(dir.join("mods")).map_err(into_error)?;
  write_db(&app, &db)?;
  Ok(next)
}

#[command]
pub fn instances_set_active(app: tauri::AppHandle, id: Option<String>) -> AppResult<Value> {
  let mut db = read_db(&app)?;
  db["activeInstanceId"] = match id {
    Some(v) => Value::String(validate_id(&v)?),
    None => Value::Null,
  };
  db["updatedAt"] = json!(now_ms());
  write_db(&app, &db)?;
  Ok(db)
}

#[command]
pub fn instances_update(app: tauri::AppHandle, id: String, patch: Value) -> AppResult<Value> {
  let safe_id = validate_id(&id)?;
  let mut db = read_db(&app)?;
  let items = db
    .get_mut("instances")
    .and_then(|v| v.as_array_mut())
    .ok_or_else(|| "instances_update: invalid db".to_string())?;
  let idx = items
    .iter()
    .position(|v| v.get("id").and_then(|x| x.as_str()) == Some(safe_id.as_str()))
    .ok_or_else(|| "Instance not found".to_string())?;

  let current = items[idx].clone();
  let mut merged = current.clone();
  if let Some(obj) = patch.as_object() {
    for (k, v) in obj {
      merged[k] = v.clone();
    }
  }
  if patch.get("syncEnabled").is_some() {
    merged["syncEnabled"] = json!(patch.get("syncEnabled").and_then(|v| v.as_bool()).unwrap_or(true));
  } else {
    merged["syncEnabled"] = json!(current.get("syncEnabled").and_then(|v| v.as_bool()).unwrap_or(true));
  }
  items[idx] = merged.clone();
  db["updatedAt"] = json!(now_ms());
  write_db(&app, &db)?;
  Ok(merged)
}

#[command]
pub fn instances_remove(app: tauri::AppHandle, id: String) -> AppResult<Value> {
  let safe_id = validate_id(&id)?;
  let mut db = read_db(&app)?;
  let mut next_instances = vec![];
  if let Some(items) = db.get("instances").and_then(|v| v.as_array()) {
    for it in items {
      if it.get("id").and_then(|v| v.as_str()) != Some(safe_id.as_str()) {
        next_instances.push(it.clone());
      }
    }
  }
  db["instances"] = Value::Array(next_instances);
  if db.get("activeInstanceId").and_then(|v| v.as_str()) == Some(safe_id.as_str()) {
    let next_active = db
      .get("instances")
      .and_then(|v| v.as_array())
      .and_then(|v| v.first())
      .and_then(|v| v.get("id"))
      .cloned()
      .unwrap_or(Value::Null);
    db["activeInstanceId"] = next_active;
  }
  db["updatedAt"] = json!(now_ms());
  write_db(&app, &db)?;

  let dir = instance_dir(&app, &safe_id)?;
  if dir.exists() {
    fs::remove_dir_all(dir).map_err(into_error)?;
  }
  Ok(json!(true))
}

#[command]
pub fn instances_duplicate(app: tauri::AppHandle, id: String) -> AppResult<Value> {
  let source_id = validate_id(&id)?;
  let mut db = read_db(&app)?;
  let items = db
    .get("instances")
    .and_then(|v| v.as_array())
    .ok_or_else(|| "instances_duplicate: invalid db".to_string())?;
  let original = items
    .iter()
    .find(|v| v.get("id").and_then(|x| x.as_str()) == Some(source_id.as_str()))
    .ok_or_else(|| "Instance not found".to_string())?
    .clone();

  let new_id = format!("{}-copy-{}", source_id, now_ms());
  let mut copy = original.clone();
  copy["id"] = json!(new_id.clone());
  let base_name = original
    .get("name")
    .and_then(|v| v.as_str())
    .unwrap_or("Instance");
  copy["name"] = json!(format!("{base_name} (Copy)"));
  copy["createdAt"] = json!(now_ms());

  let src = instance_dir(&app, &source_id)?;
  let dst = instance_dir(&app, &new_id)?;
  if src.exists() {
    copy_dir_recursive(&src, &dst)?;
  } else {
    fs::create_dir_all(dst.join("mods")).map_err(into_error)?;
  }

  let list = db
    .get_mut("instances")
    .and_then(|v| v.as_array_mut())
    .ok_or_else(|| "instances_duplicate: invalid db".to_string())?;
  list.insert(0, copy.clone());
  db["activeInstanceId"] = json!(new_id);
  db["updatedAt"] = json!(now_ms());
  write_db(&app, &db)?;
  Ok(copy)
}

#[command]
pub fn instances_open_folder(app: tauri::AppHandle, id: String) -> AppResult<String> {
  let safe_id = validate_id(&id)?;
  let dir = instance_dir(&app, &safe_id)?;
  fs::create_dir_all(&dir).map_err(into_error)?;
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer")
      .arg(&dir)
      .spawn()
      .map_err(into_error)?;
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&dir)
      .spawn()
      .map_err(into_error)?;
  }
  #[cfg(all(unix, not(target_os = "macos")))]
  {
    std::process::Command::new("xdg-open")
      .arg(&dir)
      .spawn()
      .map_err(into_error)?;
  }
  Ok(String::new())
}

#[command]
pub fn instances_export(app: tauri::AppHandle, id: String) -> AppResult<Value> {
  let safe_id = validate_id(&id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "instances:export: instance not found".to_string())?;
  let inst_name = inst.get("name").and_then(|v| v.as_str()).unwrap_or("instance");

  let default_dir = app
    .path()
    .download_dir()
    .ok()
    .or_else(|| app.path().app_data_dir().ok())
    .ok_or_else(|| "instances:export: could not resolve output directory".to_string())?;
  let default_name = format!("{}.zip", sanitize_file_name(inst_name));
  let picked = FileDialog::new()
    .set_title("Export Instance")
    .add_filter("Zip archive", &["zip"])
    .set_directory(default_dir)
    .set_file_name(&default_name)
    .save_file();
  let Some(target_path) = picked else {
    return Ok(json!({ "ok": false, "canceled": true }));
  };

  let source_dir = instance_dir(&app, &safe_id)?;
  if !source_dir.exists() {
    return Err("instances:export: instance directory not found".to_string());
  }
  if let Some(parent) = target_path.parent() {
    fs::create_dir_all(parent).map_err(into_error)?;
  }

  let mut zip = ZipWriter::new(fs::File::create(&target_path).map_err(into_error)?);
  let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

  let manifest = json!({
    "schemaVersion": 1,
    "exportedAt": chrono_like_now_iso(),
    "sourceInstanceId": safe_id,
    "instance": {
      "name": inst.get("name").cloned().unwrap_or(json!("Instance")),
      "mcVersion": inst.get("mcVersion").cloned().unwrap_or(json!("1.21.1")),
      "loader": inst.get("loader").cloned().unwrap_or(json!("fabric")),
      "memoryMb": inst.get("memoryMb").cloned().unwrap_or(json!(4096)),
      "fabricLoaderVersion": inst.get("fabricLoaderVersion").cloned().unwrap_or(Value::Null),
      "quiltLoaderVersion": inst.get("quiltLoaderVersion").cloned().unwrap_or(Value::Null),
      "forgeVersion": inst.get("forgeVersion").cloned().unwrap_or(Value::Null),
      "neoforgeVersion": inst.get("neoforgeVersion").cloned().unwrap_or(Value::Null)
    }
  });
  zip.start_file("manifest.json", opts).map_err(into_error)?;
  zip
    .write_all(serde_json::to_string_pretty(&manifest).map_err(into_error)?.as_bytes())
    .map_err(into_error)?;

  let lock_path = lockfile_path(&app, &safe_id)?;
  if lock_path.exists() {
    let mut bytes = Vec::new();
    fs::File::open(&lock_path).map_err(into_error)?.read_to_end(&mut bytes).map_err(into_error)?;
    zip.start_file("instance.lock.json", opts).map_err(into_error)?;
    zip.write_all(&bytes).map_err(into_error)?;
  }

  let mut files = Vec::new();
  collect_files_recursive(&source_dir, &source_dir, &mut files)?;
  for file in files {
    let rel = file
      .strip_prefix(&source_dir)
      .map_err(into_error)?
      .to_string_lossy()
      .replace('\\', "/");
    let zip_name = format!("instance/{rel}");
    zip.start_file(zip_name, opts).map_err(into_error)?;
    let mut bytes = Vec::new();
    fs::File::open(&file).map_err(into_error)?.read_to_end(&mut bytes).map_err(into_error)?;
    zip.write_all(&bytes).map_err(into_error)?;
  }
  zip.finish().map_err(into_error)?;

  Ok(json!({
    "ok": true,
    "canceled": false,
    "path": target_path.to_string_lossy().to_string()
  }))
}

#[command]
pub fn instances_import(app: tauri::AppHandle) -> AppResult<Value> {
  let picked = FileDialog::new()
    .set_title("Import Instance")
    .add_filter("Zip archive", &["zip"])
    .pick_file();
  let Some(zip_path) = picked else {
    return Ok(json!({ "ok": false, "canceled": true }));
  };

  let mut archive = ZipArchive::new(fs::File::open(&zip_path).map_err(into_error)?).map_err(into_error)?;
  let mut manifest_value: Value = json!({});
  if let Ok(mut mf) = archive.by_name("manifest.json") {
    let mut raw = String::new();
    mf.read_to_string(&mut raw).map_err(into_error)?;
    manifest_value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
  }
  let manifest_instance = manifest_value.get("instance").cloned().unwrap_or_else(|| json!({}));

  let desired_name = manifest_instance
    .get("name")
    .and_then(|v| v.as_str())
    .unwrap_or_else(|| {
      zip_path
        .file_stem()
        .and_then(|v| v.to_str())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or("Imported Instance")
    });

  let db_before = read_db(&app)?;
  let new_name = unique_instance_name(&db_before, desired_name);
  let new_id = make_import_instance_id();

  let created = instances_create(
    app.clone(),
    json!({
      "id": new_id,
      "name": new_name,
      "mcVersion": manifest_instance.get("mcVersion").cloned().unwrap_or(json!("1.21.1")),
      "loader": manifest_instance.get("loader").cloned().unwrap_or(json!("fabric")),
      "memoryMb": manifest_instance.get("memoryMb").cloned().unwrap_or(json!(4096)),
      "fabricLoaderVersion": manifest_instance.get("fabricLoaderVersion").cloned().unwrap_or(Value::Null),
      "quiltLoaderVersion": manifest_instance.get("quiltLoaderVersion").cloned().unwrap_or(Value::Null),
      "forgeVersion": manifest_instance.get("forgeVersion").cloned().unwrap_or(Value::Null),
      "neoforgeVersion": manifest_instance.get("neoforgeVersion").cloned().unwrap_or(Value::Null),
      "accountId": Value::Null,
      "syncEnabled": true
    }),
  )?;

  let out_dir = instance_dir(&app, &new_id)?;
  let mut imported_lockfile_raw: Option<String> = None;
  let mut extracted_any = false;
  for i in 0..archive.len() {
    let mut entry = archive.by_index(i).map_err(into_error)?;
    if !entry.is_file() {
      continue;
    }
    let name = entry.name().to_string();
    if name == "instance.lock.json" || name == "instance/instance.lock.json" {
      let mut raw = String::new();
      entry.read_to_string(&mut raw).map_err(into_error)?;
      imported_lockfile_raw = Some(raw);
      continue;
    }
    if !name.starts_with("instance/") {
      continue;
    }
    let rel = &name["instance/".len()..];
    if !is_safe_relative_archive_path(rel) {
      continue;
    }
    let target = out_dir.join(rel);
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent).map_err(into_error)?;
    }
    let mut out = fs::File::create(&target).map_err(into_error)?;
    std::io::copy(&mut entry, &mut out).map_err(into_error)?;
    extracted_any = true;
  }
  if !extracted_any {
    return Err("instances:import: archive has no instance files".to_string());
  }

  let mut lockfile_applied = false;
  let mut lockfile_result = Value::Null;
  if let Some(raw) = imported_lockfile_raw {
    let target_lockfile = lockfile_path(&app, &new_id)?;
    write_json_file(&target_lockfile, &serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({})))?;
    lockfile_applied = true;
    lockfile_result = json!({
      "appliedMods": 0,
      "appliedPacks": 0,
      "issues": [],
      "drift": {
        "clean": true,
        "checkedAt": chrono_like_now_iso(),
        "issues": []
      }
    });
  }

  Ok(json!({
    "ok": true,
    "canceled": false,
    "instance": created,
    "lockfileApplied": lockfile_applied,
    "lockfileResult": lockfile_result
  }))
}

#[command]
pub fn instances_pick_icon() -> AppResult<Option<String>> {
  let picked = FileDialog::new()
    .set_title("Choose Instance Icon")
    .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "bmp"])
    .pick_file();
  Ok(picked.map(|p| p.to_string_lossy().to_string()))
}

#[command]
pub fn instances_preview_icon_data_url(icon_token: String) -> AppResult<String> {
  let path = PathBuf::from(icon_token);
  let bytes = fs::read(&path).map_err(into_error)?;
  if bytes.is_empty() {
    return Err("instances_preview_icon_data_url: empty icon file".to_string());
  }
  let ext = ext_from_path(&path);
  let mime = mime_for_ext(ext);
  Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[command]
pub fn instances_set_icon_from_file(
  app: tauri::AppHandle,
  instance_id: String,
  icon_token: String,
  _transform: Option<Value>,
) -> AppResult<String> {
  let safe_id = validate_id(&instance_id)?;
  let src = PathBuf::from(icon_token);
  if !src.exists() {
    return Err("instances_set_icon_from_file: icon file not found".to_string());
  }
  let ext = ext_from_path(&src);
  let dir = instance_dir(&app, &safe_id)?;
  fs::create_dir_all(&dir).map_err(into_error)?;
  clear_icon_files(&dir);
  let out = dir.join(format!("instance-icon{ext}"));
  fs::copy(src, &out).map_err(into_error)?;
  Ok(out.to_string_lossy().to_string())
}

#[command]
pub async fn instances_set_icon_from_url(
  app: tauri::AppHandle,
  instance_id: String,
  url: String,
) -> AppResult<String> {
  let safe_id = validate_id(&instance_id)?;
  let parsed = url::Url::parse(url.trim()).map_err(into_error)?;
  let scheme = parsed.scheme().to_ascii_lowercase();
  if scheme != "https" && scheme != "http" {
    return Err("instances_set_icon_from_url: unsupported URL protocol".to_string());
  }

  let response = reqwest::Client::new()
    .get(parsed)
    .header("User-Agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?;
  if !response.status().is_success() {
    return Err(format!(
      "instances_set_icon_from_url: download failed ({})",
      response.status()
    ));
  }
  let content_type = response
    .headers()
    .get("content-type")
    .and_then(|v| v.to_str().ok())
    .unwrap_or("");
  let ext = extension_for_content_type(content_type).unwrap_or(".png");
  let bytes = response.bytes().await.map_err(into_error)?;
  if bytes.is_empty() {
    return Err("instances_set_icon_from_url: empty response".to_string());
  }

  let dir = instance_dir(&app, &safe_id)?;
  fs::create_dir_all(&dir).map_err(into_error)?;
  clear_icon_files(&dir);
  let out = dir.join(format!("instance-icon{ext}"));
  fs::write(&out, bytes).map_err(into_error)?;
  Ok(out.to_string_lossy().to_string())
}

#[command]
pub fn instances_set_icon_fallback(
  app: tauri::AppHandle,
  instance_id: String,
  label: String,
  theme: Option<String>,
) -> AppResult<String> {
  let safe_id = validate_id(&instance_id)?;
  let text = label
    .split_whitespace()
    .filter(|x| !x.is_empty())
    .take(2)
    .map(|x| x.chars().next().unwrap_or('?').to_ascii_uppercase())
    .collect::<String>();
  let initials = if text.is_empty() { "FB".to_string() } else { text };
  let palette = match theme.unwrap_or_else(|| "green".to_string()).as_str() {
    "blue" => ("#12406b", "#1d6db8", "#d9f0ff"),
    _ => ("#124e3a", "#1d8d67", "#e6fff5"),
  };
  let svg = format!(
    r#"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="{a}"/><stop offset="100%" stop-color="{b}"/>
  </linearGradient></defs>
  <rect width="256" height="256" rx="38" fill="url(#g)"/>
  <text x="128" y="148" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="88" font-weight="700" fill="{c}">{t}</text>
</svg>"#,
    a = palette.0,
    b = palette.1,
    c = palette.2,
    t = initials
  );
  let dir = instance_dir(&app, &safe_id)?;
  fs::create_dir_all(&dir).map_err(into_error)?;
  clear_icon_files(&dir);
  let out = dir.join("instance-icon.svg");
  fs::write(&out, svg.as_bytes()).map_err(into_error)?;
  Ok(out.to_string_lossy().to_string())
}

#[command]
pub fn instances_get_icon(app: tauri::AppHandle, instance_id: String) -> AppResult<Option<String>> {
  let safe_id = validate_id(&instance_id)?;
  let dir = instance_dir(&app, &safe_id)?;
  let p = match choose_icon_file(&dir) {
    Some(v) => v,
    None => return Ok(None),
  };
  let bytes = fs::read(&p).map_err(into_error)?;
  if bytes.is_empty() {
    return Ok(None);
  }
  let ext = ext_from_path(&p);
  let mime = mime_for_ext(ext);
  Ok(Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes))))
}

#[command]
pub fn instances_clear_icon(app: tauri::AppHandle, instance_id: String) -> AppResult<bool> {
  let safe_id = validate_id(&instance_id)?;
  let dir = instance_dir(&app, &safe_id)?;
  clear_icon_files(&dir);
  Ok(true)
}

#[command]
pub fn content_pick_files(_window: tauri::Window, kind: String) -> AppResult<Vec<String>> {
  let kind_norm = kind.trim().to_ascii_lowercase();
  let mut dialog = FileDialog::new().set_title("Select files").set_directory(".");
  dialog = if kind_norm == "mods" {
    dialog.add_filter("Mods", &["jar"])
  } else {
    dialog.add_filter("Packs", &["zip"])
  };
  let picked = dialog.pick_files().unwrap_or_default();
  Ok(
    picked
      .into_iter()
      .map(|p| p.to_string_lossy().to_string())
      .collect::<Vec<_>>(),
  )
}

#[command]
pub fn content_add(
  app: tauri::AppHandle,
  instance_id: String,
  kind: String,
  file_paths: Vec<String>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let dir = ensure_content_dir(&app, &safe_id, &kind)?;
  let mut out = Vec::with_capacity(file_paths.len());

  for raw in file_paths {
    let source = PathBuf::from(raw.clone());
    let name = safe_basename(&raw);
    let mut row = json!({ "name": name, "ok": false });
    if name.trim().is_empty() {
      row["error"] = json!("Invalid file name");
      out.push(row);
      continue;
    }
    if !source.exists() {
      row["error"] = json!("File not found");
      out.push(row);
      continue;
    }
    if !is_allowed_content_file(&kind, &source) {
      row["error"] = json!("Invalid file type");
      out.push(row);
      continue;
    }
    let dest = dir.join(&name);
    match fs::copy(&source, &dest) {
      Ok(_) => row["ok"] = json!(true),
      Err(err) => row["error"] = json!(err.to_string()),
    }
    out.push(row);
  }

  Ok(Value::Array(out))
}

#[command]
pub fn content_list(app: tauri::AppHandle, instance_id: String, kind: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let kind_norm = kind.trim().to_ascii_lowercase();
  if kind_norm == "mods" {
    let mut dedup = std::collections::HashMap::<String, Value>::new();
    for dir in mods_dir_candidates(&app, &safe_id)? {
      if !dir.exists() {
        continue;
      }
      let entries = match fs::read_dir(&dir) {
        Ok(v) => v,
        Err(_) => continue,
      };
      for ent in entries {
        let ent = match ent {
          Ok(v) => v,
          Err(_) => continue,
        };
        let p = ent.path();
        let meta = match ent.metadata() {
          Ok(v) => v,
          Err(_) => continue,
        };
        if !meta.is_file() || !is_allowed_content_file("mods", &p) {
          continue;
        }
        let name = p.file_name().and_then(|v| v.to_str()).unwrap_or("").to_string();
        let modified_ms = meta
          .modified()
          .ok()
          .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
          .map(|d| d.as_millis() as u64)
          .unwrap_or(0);
        let key = name.to_ascii_lowercase();
        let should_replace = dedup
          .get(&key)
          .and_then(|v| v.get("modifiedMs"))
          .and_then(|v| v.as_u64())
          .map(|old| modified_ms > old)
          .unwrap_or(true);
        if should_replace {
          dedup.insert(
            key,
            json!({
              "name": name,
              "size": meta.len(),
              "modifiedMs": modified_ms
            }),
          );
        }
      }
    }
    return Ok(Value::Array(dedup.into_values().collect::<Vec<_>>()));
  }
  let dir = ensure_content_dir(&app, &safe_id, &kind_norm)?;
  let mut out = Vec::new();
  let entries = fs::read_dir(dir).map_err(into_error)?;
  for ent in entries {
    let ent = ent.map_err(into_error)?;
    let p = ent.path();
    let meta = match ent.metadata() {
      Ok(v) => v,
      Err(_) => continue,
    };
    if !meta.is_file() {
      continue;
    }
    let name = p.file_name().and_then(|v| v.to_str()).unwrap_or("").to_string();
    let modified_ms = meta
      .modified()
      .ok()
      .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
      .map(|d| d.as_millis() as u64)
      .unwrap_or(0);
    out.push(json!({
      "name": name,
      "size": meta.len(),
      "modifiedMs": modified_ms
    }));
  }
  Ok(Value::Array(out))
}

fn local_mod_query_from_file_name(file_name: &str) -> String {
  let clean = file_name
    .trim()
    .trim_end_matches(".disabled")
    .trim_end_matches(".jar")
    .to_string();
  if clean.is_empty() {
    return String::new();
  }
  let base = if let Some((id, rest)) = clean.split_once("__") {
    if let Some(found) = MOD_CATALOG.iter().find(|x| x.0 == id) {
      found.1.to_string()
    } else {
      rest.to_string()
    }
  } else {
    clean
  };
  let spaced = base
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
    .collect::<String>();
  spaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn local_pack_query_from_file_name(kind: &str, file_name: &str) -> String {
  let mut clean = file_name.trim().to_string();
  if clean.ends_with(".disabled") {
    clean = clean.trim_end_matches(".disabled").to_string();
  }
  if clean.ends_with(".zip") {
    clean = clean.trim_end_matches(".zip").to_string();
  }
  if clean.ends_with(".jar") {
    clean = clean.trim_end_matches(".jar").to_string();
  }
  if clean.is_empty() {
    return String::new();
  }

  let kind_label = if kind == "shaderpacks" { "shaderpack" } else { "resourcepack" };
  let base = if let Some((id, rest)) = clean.split_once("__") {
    if let Some(found) = PACK_CATALOG.iter().find(|x| x.0 == id && x.2 == kind_label) {
      found.1.to_string()
    } else {
      rest.to_string()
    }
  } else if let Some(found) = PACK_CATALOG.iter().find(|x| x.0 == clean && x.2 == kind_label) {
    found.1.to_string()
  } else {
    clean
  };

  let spaced = base
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
    .collect::<String>();
  spaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[command]
pub async fn local_mods_metadata(
  app: tauri::AppHandle,
  instance_id: String,
  names: Vec<String>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mc = inst
    .get("mcVersion")
    .and_then(|v| v.as_str())
    .unwrap_or("1.21.1")
    .to_string();
  let loader = inst
    .get("loader")
    .and_then(|v| v.as_str())
    .unwrap_or("fabric")
    .to_ascii_lowercase();
  let mut unique = BTreeSet::<String>::new();
  for raw in names {
    let trimmed = raw.trim().to_string();
    if !trimmed.is_empty() {
      unique.insert(trimmed);
    }
    if unique.len() >= 30 {
      break;
    }
  }

  let client = reqwest::Client::new();
  let cf_key = curseforge_api_key(&app);
  let mut out = Vec::<Value>::new();
  let mut cache = read_content_metadata(&app, &safe_id)?;
  let mut cache_dirty = false;

  for file_name in unique {
    if let Some(meta) = content_metadata_get(&cache, "mods", &file_name) {
      out.push(json!({
        "fileName": file_name,
        "title": meta.get("title").and_then(|v| v.as_str()).unwrap_or(""),
        "description": meta.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        "iconUrl": meta.get("iconUrl").and_then(|v| v.as_str()),
        "author": meta.get("author").and_then(|v| v.as_str()),
        "source": meta.get("source").and_then(|v| v.as_str()).unwrap_or("modrinth"),
        "projectId": meta.get("projectId").and_then(|v| v.as_str())
      }));
      continue;
    }

    let query = local_mod_query_from_file_name(&file_name);
    if query.trim().is_empty() {
      continue;
    }

    let mut facets = vec![vec!["project_type:mod".to_string()], vec![format!("versions:{mc}")]];
    if loader != "vanilla" {
      facets.push(vec![format!("categories:{loader}")]);
    }
    let facets_json = serde_json::to_string(&facets).map_err(into_error)?;
    let modrinth_url = format!(
      "https://api.modrinth.com/v2/search?query={}&limit=5&index=relevance&facets={}",
      urlencoding::encode(&query),
      urlencoding::encode(&facets_json)
    );

    let modrinth_payload: Option<Value> = match client
      .get(modrinth_url)
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
    {
      Ok(resp) => match resp.error_for_status() {
        Ok(ok) => ok.json::<Value>().await.ok(),
        Err(_) => None,
      },
      Err(_) => None,
    };

    if let Some(payload) = modrinth_payload {
      if let Some(hit) = payload
        .get("hits")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
      {
        let row = json!({
          "fileName": file_name,
          "title": hit.get("title").and_then(|v| v.as_str()).unwrap_or(&query),
          "description": hit.get("description").and_then(|v| v.as_str()).unwrap_or(""),
          "iconUrl": hit.get("icon_url").and_then(|v| v.as_str()),
          "author": hit.get("author").and_then(|v| v.as_str()).unwrap_or("unknown"),
          "source": "modrinth",
          "projectId": hit.get("project_id").and_then(|v| v.as_str())
        });
        content_metadata_put(
          &mut cache,
          "mods",
          &file_name,
          json!({
            "title": row.get("title").cloned().unwrap_or(Value::Null),
            "description": row.get("description").cloned().unwrap_or(Value::Null),
            "iconUrl": row.get("iconUrl").cloned().unwrap_or(Value::Null),
            "author": row.get("author").cloned().unwrap_or(Value::Null),
            "source": "modrinth",
            "projectId": row.get("projectId").cloned().unwrap_or(Value::Null)
          }),
        );
        cache_dirty = true;
        out.push(row);
        continue;
      }
    }

    if let Some(api_key) = cf_key.as_ref() {
      let cf_payload: Option<Value> = match client
        .get("https://api.curseforge.com/v1/mods/search")
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .header("x-api-key", api_key)
        .query(&[
          ("gameId", "432"),
          ("classId", "6"),
          ("pageSize", "5"),
          ("sortField", "2"),
          ("sortOrder", "desc"),
          ("searchFilter", query.as_str()),
        ])
        .send()
        .await
      {
        Ok(resp) => match resp.error_for_status() {
          Ok(ok) => ok.json::<Value>().await.ok(),
          Err(_) => None,
        },
        Err(_) => None,
      };
      if let Some(payload) = cf_payload {
        if let Some(hit) = payload
          .get("data")
          .and_then(|v| v.as_array())
          .and_then(|arr| arr.first())
        {
          let row = json!({
            "fileName": file_name,
            "title": hit.get("name").and_then(|v| v.as_str()).unwrap_or(&query),
            "description": hit.get("summary").and_then(|v| v.as_str()).unwrap_or(""),
            "iconUrl": hit.get("logo").and_then(|v| v.get("url")).and_then(|v| v.as_str()),
            "author": hit.get("authors").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|a| a.get("name")).and_then(|v| v.as_str()).unwrap_or("unknown"),
            "source": "curseforge",
            "projectId": hit.get("id").and_then(|v| v.as_u64()).map(|v| v.to_string())
          });
          content_metadata_put(
            &mut cache,
            "mods",
            &file_name,
            json!({
              "title": row.get("title").cloned().unwrap_or(Value::Null),
              "description": row.get("description").cloned().unwrap_or(Value::Null),
              "iconUrl": row.get("iconUrl").cloned().unwrap_or(Value::Null),
              "author": row.get("author").cloned().unwrap_or(Value::Null),
              "source": "curseforge",
              "projectId": row.get("projectId").cloned().unwrap_or(Value::Null)
            }),
          );
          cache_dirty = true;
          out.push(row);
        }
      }
    }
  }

  if cache_dirty {
    let _ = write_content_metadata(&app, &safe_id, &cache);
  }

  Ok(json!({ "items": out }))
}

#[command]
pub async fn local_packs_metadata(
  app: tauri::AppHandle,
  instance_id: String,
  kind: String,
  names: Vec<String>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let kind_norm = kind.trim().to_ascii_lowercase();
  if kind_norm != "resourcepacks" && kind_norm != "shaderpacks" {
    return Err("localPacksMetadata: kind must be resourcepacks or shaderpacks".to_string());
  }
  let project_type = if kind_norm == "shaderpacks" { "shader" } else { "resourcepack" };

  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mc = inst
    .get("mcVersion")
    .and_then(|v| v.as_str())
    .unwrap_or("1.21.1")
    .to_string();

  let mut unique = BTreeSet::<String>::new();
  for raw in names {
    let trimmed = raw.trim().to_string();
    if !trimmed.is_empty() {
      unique.insert(trimmed);
    }
    if unique.len() >= 30 {
      break;
    }
  }

  let client = reqwest::Client::new();
  let mut out = Vec::<Value>::new();
  let mut cache = read_content_metadata(&app, &safe_id)?;
  let mut cache_dirty = false;

  for file_name in unique {
    if let Some(meta) = content_metadata_get(&cache, &kind_norm, &file_name) {
      out.push(json!({
        "fileName": file_name,
        "title": meta.get("title").and_then(|v| v.as_str()).unwrap_or(""),
        "description": meta.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        "iconUrl": meta.get("iconUrl").and_then(|v| v.as_str()),
        "author": meta.get("author").and_then(|v| v.as_str()),
        "source": meta.get("source").and_then(|v| v.as_str()).unwrap_or("modrinth"),
        "projectId": meta.get("projectId").and_then(|v| v.as_str())
      }));
      continue;
    }

    let query = local_pack_query_from_file_name(&kind_norm, &file_name);
    if query.trim().is_empty() {
      continue;
    }
    let facets = vec![
      vec![format!("project_type:{project_type}")],
      vec![format!("versions:{mc}")],
    ];
    let facets_json = serde_json::to_string(&facets).map_err(into_error)?;
    let modrinth_url = format!(
      "https://api.modrinth.com/v2/search?query={}&limit=5&index=relevance&facets={}",
      urlencoding::encode(&query),
      urlencoding::encode(&facets_json)
    );
    let payload: Option<Value> = match client
      .get(modrinth_url)
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
    {
      Ok(resp) => match resp.error_for_status() {
        Ok(ok) => ok.json::<Value>().await.ok(),
        Err(_) => None,
      },
      Err(_) => None,
    };
    if let Some(hit) = payload
      .and_then(|v| v.get("hits").and_then(|h| h.as_array()).and_then(|arr| arr.first()).cloned())
    {
      let row = json!({
        "fileName": file_name,
        "title": hit.get("title").and_then(|v| v.as_str()).unwrap_or(&query),
        "description": hit.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        "iconUrl": hit.get("icon_url").and_then(|v| v.as_str()),
        "author": hit.get("author").and_then(|v| v.as_str()).unwrap_or("unknown"),
        "source": "modrinth",
        "projectId": hit.get("project_id").and_then(|v| v.as_str())
      });
      content_metadata_put(
        &mut cache,
        &kind_norm,
        &file_name,
        json!({
          "title": row.get("title").cloned().unwrap_or(Value::Null),
          "description": row.get("description").cloned().unwrap_or(Value::Null),
          "iconUrl": row.get("iconUrl").cloned().unwrap_or(Value::Null),
          "author": row.get("author").cloned().unwrap_or(Value::Null),
          "source": "modrinth",
          "projectId": row.get("projectId").cloned().unwrap_or(Value::Null)
        }),
      );
      cache_dirty = true;
      out.push(row);
    }
  }

  if cache_dirty {
    let _ = write_content_metadata(&app, &safe_id, &cache);
  }

  Ok(json!({ "items": out }))
}

#[command]
pub fn content_remove(
  app: tauri::AppHandle,
  instance_id: String,
  kind: String,
  name: String,
) -> AppResult<bool> {
  let safe_id = validate_id(&instance_id)?;
  let kind_norm = kind.trim().to_ascii_lowercase();
  let target = if kind_norm == "mods" {
    if let Some(existing) = find_existing_mod_file(&app, &safe_id, &name)? {
      existing
    } else {
      let fallback_dir = ensure_content_dir(&app, &safe_id, "mods")?;
      fallback_dir.join(safe_basename(&name))
    }
  } else {
    let dir = ensure_content_dir(&app, &safe_id, &kind_norm)?;
    dir.join(safe_basename(&name))
  };
  if !target.exists() {
    return Ok(false);
  }
  fs::remove_file(target).map_err(into_error)?;
  Ok(true)
}

#[command]
pub fn content_toggle_enabled(
  app: tauri::AppHandle,
  instance_id: String,
  kind: String,
  name: String,
  enabled: bool,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let kind_norm = kind.trim().to_ascii_lowercase();
  let base = safe_basename(&name);
  let from = if kind_norm == "mods" {
    if let Some(existing) = find_existing_mod_file(&app, &safe_id, &base)? {
      existing
    } else {
      let fallback_dir = ensure_content_dir(&app, &safe_id, "mods")?;
      fallback_dir.join(&base)
    }
  } else {
    let dir = ensure_content_dir(&app, &safe_id, &kind_norm)?;
    dir.join(&base)
  };
  if !from.exists() {
    return Err("File not found".to_string());
  }
  let is_disabled = base.ends_with(".disabled");
  let target_name = if enabled {
    if is_disabled {
      base.trim_end_matches(".disabled").to_string()
    } else {
      base.clone()
    }
  } else if is_disabled {
    base.clone()
  } else {
    format!("{base}.disabled")
  };
  let parent = if let Some(p) = from.parent() {
    p.to_path_buf()
  } else {
    ensure_content_dir(&app, &safe_id, &kind_norm)?
  };
  let to = parent.join(&target_name);
  if from != to {
    fs::rename(from, to).map_err(into_error)?;
  }
  Ok(json!({ "ok": true, "name": target_name }))
}

#[command]
pub fn lockfile_generate(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mods_state: Value = read_json_file(&mods_state_path(&app, &safe_id)?, json!({ "enabled": {}, "resolved": {} }));
  let packs_state: Value = read_json_file(&packs_state_path(&app, &safe_id)?, json!({ "enabled": {}, "resolved": {} }));

  let mods_enabled = mods_state
    .get("enabled")
    .and_then(|v| v.as_object())
    .map(|m| m.iter().filter(|(_, v)| v.as_bool().unwrap_or(false)).count())
    .unwrap_or(0);
  let packs_enabled = packs_state
    .get("enabled")
    .and_then(|v| v.as_object())
    .map(|m| m.iter().filter(|(_, v)| v.as_bool().unwrap_or(false)).count())
    .unwrap_or(0);

  let lock = json!({
    "schemaVersion": 1,
    "generatedAt": chrono_like_now_iso(),
    "instance": {
      "id": safe_id,
      "name": inst.get("name").cloned().unwrap_or(Value::Null),
      "mcVersion": inst.get("mcVersion").cloned().unwrap_or(Value::Null),
      "loader": inst.get("loader").cloned().unwrap_or(Value::Null),
      "memoryMb": inst.get("memoryMb").cloned().unwrap_or(json!(4096)),
      "instancePreset": inst.get("instancePreset").cloned().unwrap_or(Value::Null),
      "jvmArgsOverride": inst.get("jvmArgsOverride").cloned().unwrap_or(Value::Null)
    },
    "artifacts": {
      "modsEnabled": mods_enabled,
      "packsEnabled": packs_enabled
    },
    "notes": []
  });
  write_json_file(&lockfile_path(&app, &safe_id)?, &lock)?;

  Ok(json!({
    "generatedAt": lock.get("generatedAt").cloned().unwrap_or(Value::Null),
    "artifacts": mods_enabled + packs_enabled,
    "notes": []
  }))
}

fn chrono_like_now_iso() -> String {
  // Keep a simple RFC3339-like UTC timestamp without adding extra crate deps.
  // Format: 2026-02-28T12:34:56.789Z
  let now = now_ms();
  let secs = (now / 1000) as i64;
  let millis = (now % 1000) as u32;
  let tm = time_from_unix_utc(secs);
  format!(
    "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
    tm.year, tm.month, tm.day, tm.hour, tm.min, tm.sec, millis
  )
}

struct UtcParts {
  year: i32,
  month: u32,
  day: u32,
  hour: u32,
  min: u32,
  sec: u32,
}

fn time_from_unix_utc(mut ts: i64) -> UtcParts {
  let sec = (ts.rem_euclid(60)) as u32;
  ts = ts.div_euclid(60);
  let min = (ts.rem_euclid(60)) as u32;
  ts = ts.div_euclid(60);
  let hour = (ts.rem_euclid(24)) as u32;
  let days = ts.div_euclid(24);
  let (year, month, day) = civil_from_days(days);
  UtcParts {
    year,
    month,
    day,
    hour,
    min,
    sec,
  }
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
  let z = days + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
  let mut y = yoe + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = mp + if mp < 10 { 3 } else { -9 };
  y += if m <= 2 { 1 } else { 0 };
  (y as i32, m as u32, d as u32)
}

#[command]
pub fn lockfile_drift(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let p = lockfile_path(&app, &safe_id)?;
  if !p.exists() {
    return Ok(json!({
      "clean": false,
      "checkedAt": chrono_like_now_iso(),
      "lockfilePresent": false,
      "expectedArtifacts": 0,
      "stateExpectedArtifacts": 0,
      "issues": [
        {
          "id": "lockfile-missing",
          "category": "mod",
          "severity": "warning",
          "message": "No lockfile found for this instance."
        }
      ]
    }));
  }
  Ok(json!({
    "clean": true,
    "checkedAt": chrono_like_now_iso(),
    "lockfilePresent": true,
    "expectedArtifacts": 0,
    "stateExpectedArtifacts": 0,
    "issues": []
  }))
}

#[command]
pub fn servers_list(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let p = servers_path(&app, &safe_id)?;
  Ok(read_json_file(
    &p,
    json!({
      "preferredServerId": Value::Null,
      "servers": []
    }),
  ))
}

#[command]
pub fn servers_upsert(app: tauri::AppHandle, instance_id: String, entry: Value) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let p = servers_path(&app, &safe_id)?;
  let mut state: Value = read_json_file(
    &p,
    json!({
      "preferredServerId": Value::Null,
      "servers": []
    }),
  );
  if !state.get("servers").map(|v| v.is_array()).unwrap_or(false) {
    state["servers"] = json!([]);
  }
  let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
  let address = entry.get("address").and_then(|v| v.as_str()).unwrap_or("").trim();
  if name.is_empty() || address.is_empty() {
    return Err("Server name and address are required".to_string());
  }
  let notes = entry.get("notes").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
  let now = now_ms();
  let incoming_id = entry.get("id").and_then(|v| v.as_str()).map(|v| v.to_string());

  let servers = state
    .get_mut("servers")
    .and_then(|v| v.as_array_mut())
    .ok_or_else(|| "servers: invalid state".to_string())?;

  let mut out = Value::Null;
  if let Some(id) = incoming_id {
    if let Some(existing) = servers
      .iter_mut()
      .find(|x| x.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
    {
      existing["name"] = json!(name);
      existing["address"] = json!(address);
      existing["notes"] = if notes.is_empty() { Value::Null } else { json!(notes) };
      existing["updatedAt"] = json!(now);
      out = existing.clone();
    }
  }
  if out.is_null() {
    let id = format!("srv-{}", now_ms());
    let created = json!({
      "id": id,
      "name": name,
      "address": address,
      "notes": if notes.is_empty() { Value::Null } else { json!(notes) },
      "linkedProfile": Value::Null,
      "createdAt": now,
      "updatedAt": now
    });
    servers.insert(0, created.clone());
    if state.get("preferredServerId").map(|v| v.is_null()).unwrap_or(true) {
      state["preferredServerId"] = created.get("id").cloned().unwrap_or(Value::Null);
    }
    out = created;
  }
  write_json_file(&p, &state)?;
  Ok(out)
}

#[command]
pub fn servers_remove(app: tauri::AppHandle, instance_id: String, server_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let p = servers_path(&app, &safe_id)?;
  let mut state: Value = read_json_file(
    &p,
    json!({
      "preferredServerId": Value::Null,
      "servers": []
    }),
  );
  let old = state
    .get("servers")
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();
  let next: Vec<Value> = old
    .into_iter()
    .filter(|x| x.get("id").and_then(|v| v.as_str()) != Some(server_id.as_str()))
    .collect();
  state["servers"] = Value::Array(next.clone());
  if state.get("preferredServerId").and_then(|v| v.as_str()) == Some(server_id.as_str()) {
    state["preferredServerId"] = next
      .first()
      .and_then(|x| x.get("id"))
      .cloned()
      .unwrap_or(Value::Null);
  }
  write_json_file(&p, &state)?;
  Ok(state)
}

#[command]
pub fn servers_set_preferred(
  app: tauri::AppHandle,
  instance_id: String,
  server_id: Option<String>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let p = servers_path(&app, &safe_id)?;
  let mut state: Value = read_json_file(
    &p,
    json!({
      "preferredServerId": Value::Null,
      "servers": []
    }),
  );
  if let Some(id) = server_id {
    let exists = state
      .get("servers")
      .and_then(|v| v.as_array())
      .map(|rows| rows.iter().any(|x| x.get("id").and_then(|v| v.as_str()) == Some(id.as_str())))
      .unwrap_or(false);
    if !exists {
      return Err("Server entry not found".to_string());
    }
    state["preferredServerId"] = json!(id);
  } else {
    state["preferredServerId"] = Value::Null;
  }
  write_json_file(&p, &state)?;
  Ok(state)
}

#[command]
pub fn servers_export_profile(
  app: tauri::AppHandle,
  instance_id: String,
  server_id: String,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  if server_id.trim().is_empty() {
    return Err("servers:exportProfile: serverId missing".to_string());
  }

  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let servers_state = servers_list(app.clone(), safe_id.clone())?;
  let server = servers_state
    .get("servers")
    .and_then(|v| v.as_array())
    .and_then(|rows| rows.iter().find(|x| x.get("id").and_then(|v| v.as_str()) == Some(server_id.as_str())))
    .cloned()
    .ok_or_else(|| "Server entry not found".to_string())?;

  let default_dir = app
    .path()
    .download_dir()
    .ok()
    .or_else(|| app.path().app_data_dir().ok())
    .ok_or_else(|| "servers:exportProfile: could not resolve output directory".to_string())?;
  let default_name = format!(
    "{}-server-profile.zip",
    sanitize_file_name(server.get("name").and_then(|v| v.as_str()).unwrap_or("server"))
  );
  let picked = FileDialog::new()
    .set_title("Export Server Profile")
    .add_filter("Zip archive", &["zip"])
    .set_directory(default_dir)
    .set_file_name(&default_name)
    .save_file();
  let Some(target_path) = picked else {
    return Ok(json!({ "ok": false, "canceled": true }));
  };
  if let Some(parent) = target_path.parent() {
    fs::create_dir_all(parent).map_err(into_error)?;
  }

  let mut zip = ZipWriter::new(fs::File::create(&target_path).map_err(into_error)?);
  let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

  let mods_state: Value = read_json_file(&mods_state_path(&app, &safe_id)?, json!({ "enabled": {}, "resolved": {} }));
  let packs_state: Value = read_json_file(&packs_state_path(&app, &safe_id)?, json!({ "enabled": {}, "resolved": {} }));
  let enabled_mods: Vec<String> = mods_state
    .get("enabled")
    .and_then(|v| v.as_object())
    .map(|m| {
      m.iter()
        .filter_map(|(k, v)| if v.as_bool().unwrap_or(false) { Some(k.clone()) } else { None })
        .collect::<Vec<_>>()
    })
    .unwrap_or_default();
  let enabled_packs: Vec<String> = packs_state
    .get("enabled")
    .and_then(|v| v.as_object())
    .map(|m| {
      m.iter()
        .filter_map(|(k, v)| if v.as_bool().unwrap_or(false) { Some(k.clone()) } else { None })
        .collect::<Vec<_>>()
    })
    .unwrap_or_default();

  let profile = json!({
    "schemaVersion": 1,
    "exportedAt": chrono_like_now_iso(),
    "server": {
      "name": server.get("name").cloned().unwrap_or(json!("Server")),
      "address": server.get("address").cloned().unwrap_or(json!("")),
      "notes": server.get("notes").cloned().unwrap_or(Value::Null)
    },
    "instance": {
      "mcVersion": inst.get("mcVersion").cloned().unwrap_or(json!("1.21.1")),
      "loader": inst.get("loader").cloned().unwrap_or(json!("fabric")),
      "fabricLoaderVersion": inst.get("fabricLoaderVersion").cloned().unwrap_or(Value::Null),
      "quiltLoaderVersion": inst.get("quiltLoaderVersion").cloned().unwrap_or(Value::Null),
      "forgeVersion": inst.get("forgeVersion").cloned().unwrap_or(Value::Null),
      "neoforgeVersion": inst.get("neoforgeVersion").cloned().unwrap_or(Value::Null),
      "memoryMb": inst.get("memoryMb").cloned().unwrap_or(json!(4096)),
      "jvmArgsOverride": inst.get("jvmArgsOverride").cloned().unwrap_or(Value::Null),
      "instancePreset": inst.get("instancePreset").cloned().unwrap_or(Value::Null)
    },
    "enabledMods": enabled_mods,
    "enabledPacks": enabled_packs
  });
  zip.start_file("server-profile.json", opts).map_err(into_error)?;
  zip
    .write_all(serde_json::to_string_pretty(&profile).map_err(into_error)?.as_bytes())
    .map_err(into_error)?;

  let lock_path = lockfile_path(&app, &safe_id)?;
  if lock_path.exists() {
    let mut bytes = Vec::new();
    fs::File::open(&lock_path).map_err(into_error)?.read_to_end(&mut bytes).map_err(into_error)?;
    zip.start_file("instance.lock.json", opts).map_err(into_error)?;
    zip.write_all(&bytes).map_err(into_error)?;
  }

  let cfg_dir = instance_dir(&app, &safe_id)?.join("config");
  if cfg_dir.exists() {
    let mut cfg_files = Vec::new();
    collect_files_recursive(&cfg_dir, &cfg_dir, &mut cfg_files)?;
    for file in cfg_files {
      let rel = file.strip_prefix(&cfg_dir).map_err(into_error)?.to_string_lossy().replace('\\', "/");
      zip.start_file(format!("config/{rel}"), opts).map_err(into_error)?;
      let mut bytes = Vec::new();
      fs::File::open(&file).map_err(into_error)?.read_to_end(&mut bytes).map_err(into_error)?;
      zip.write_all(&bytes).map_err(into_error)?;
    }
  }
  zip.finish().map_err(into_error)?;

  Ok(json!({
    "ok": true,
    "canceled": false,
    "path": target_path.to_string_lossy().to_string()
  }))
}

#[command]
pub fn servers_import_profile(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let picked = FileDialog::new()
    .set_title("Import Server Profile")
    .add_filter("Zip archive", &["zip"])
    .pick_file();
  let Some(zip_path) = picked else {
    return Ok(json!({ "ok": false, "canceled": true }));
  };

  let mut archive = ZipArchive::new(fs::File::open(&zip_path).map_err(into_error)?).map_err(into_error)?;
  let mut profile: Value = json!({});
  if let Ok(mut entry) = archive.by_name("server-profile.json") {
    let mut raw = String::new();
    entry.read_to_string(&mut raw).map_err(into_error)?;
    profile = serde_json::from_str(&raw).map_err(into_error)?;
  } else {
    return Err("Import failed: missing server-profile.json".to_string());
  }

  let server = profile.get("server").cloned().unwrap_or_else(|| json!({}));
  let instance_patch = profile.get("instance").cloned().unwrap_or_else(|| json!({}));

  let mut patch = json!({});
  for key in [
    "mcVersion",
    "loader",
    "fabricLoaderVersion",
    "quiltLoaderVersion",
    "forgeVersion",
    "neoforgeVersion",
    "memoryMb",
    "jvmArgsOverride",
    "instancePreset",
  ] {
    if let Some(v) = instance_patch.get(key) {
      patch[key] = v.clone();
    }
  }
  let _ = instances_update(app.clone(), safe_id.clone(), patch)?;

  let mut mods_state: Value = read_json_file(&mods_state_path(&app, &safe_id)?, json!({ "enabled": {}, "resolved": {} }));
  if !mods_state.get("enabled").map(|v| v.is_object()).unwrap_or(false) {
    mods_state["enabled"] = json!({});
  }
  let mut packs_state: Value = read_json_file(&packs_state_path(&app, &safe_id)?, json!({ "enabled": {}, "resolved": {} }));
  if !packs_state.get("enabled").map(|v| v.is_object()).unwrap_or(false) {
    packs_state["enabled"] = json!({});
  }
  let enabled_mods: Vec<String> = profile
    .get("enabledMods")
    .and_then(|v| v.as_array())
    .map(|rows| rows.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
    .unwrap_or_default();
  let enabled_packs: Vec<String> = profile
    .get("enabledPacks")
    .and_then(|v| v.as_array())
    .map(|rows| rows.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
    .unwrap_or_default();

  if let Some(obj) = mods_state.get_mut("enabled").and_then(|v| v.as_object_mut()) {
    for value in obj.values_mut() {
      *value = json!(false);
    }
    for id in enabled_mods.iter() {
      obj.insert(id.clone(), json!(true));
    }
  }
  if let Some(obj) = packs_state.get_mut("enabled").and_then(|v| v.as_object_mut()) {
    for value in obj.values_mut() {
      *value = json!(false);
    }
    for id in enabled_packs.iter() {
      obj.insert(id.clone(), json!(true));
    }
  }
  write_json_file(&mods_state_path(&app, &safe_id)?, &mods_state)?;
  write_json_file(&packs_state_path(&app, &safe_id)?, &packs_state)?;

  let created_server = servers_upsert(
    app.clone(),
    safe_id.clone(),
    json!({
      "name": server.get("name").cloned().unwrap_or(json!("Imported Server")),
      "address": server.get("address").cloned().unwrap_or(json!("")),
      "notes": server.get("notes").cloned().unwrap_or(Value::Null)
    }),
  )?;
  if let Some(server_id) = created_server.get("id").and_then(|v| v.as_str()) {
    let _ = servers_set_preferred(app.clone(), safe_id.clone(), Some(server_id.to_string()))?;
  }

  let cfg_root = instance_dir(&app, &safe_id)?.join("config");
  for i in 0..archive.len() {
    let mut entry = archive.by_index(i).map_err(into_error)?;
    if !entry.is_file() {
      continue;
    }
    let name = entry.name().to_string();
    if !name.starts_with("config/") {
      continue;
    }
    let rel = &name["config/".len()..];
    if !is_safe_relative_archive_path(rel) {
      continue;
    }
    let target = cfg_root.join(rel);
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent).map_err(into_error)?;
    }
    let mut out = fs::File::create(&target).map_err(into_error)?;
    std::io::copy(&mut entry, &mut out).map_err(into_error)?;
  }

  Ok(json!({
    "ok": true,
    "canceled": false,
    "result": {
      "server": created_server,
      "applied": {
        "mcVersion": instance_patch.get("mcVersion").cloned().unwrap_or(Value::Null),
        "loader": instance_patch.get("loader").cloned().unwrap_or(Value::Null),
        "fabricLoaderVersion": instance_patch.get("fabricLoaderVersion").cloned().unwrap_or(Value::Null),
        "quiltLoaderVersion": instance_patch.get("quiltLoaderVersion").cloned().unwrap_or(Value::Null),
        "forgeVersion": instance_patch.get("forgeVersion").cloned().unwrap_or(Value::Null),
        "neoforgeVersion": instance_patch.get("neoforgeVersion").cloned().unwrap_or(Value::Null),
        "enabledMods": enabled_mods.len(),
        "enabledPacks": enabled_packs.len()
      }
    }
  }))
}

#[derive(Debug, Deserialize)]
struct LoaderMetaEntry {
  version: String,
  stable: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct FabricLoaderRow {
  loader: LoaderMetaEntry,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderMeta {
  version: Option<String>,
  stable: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderRow {
  loader: Option<QuiltLoaderMeta>,
}

#[derive(Debug, Deserialize)]
struct ModrinthVersionFile {
  url: String,
  primary: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ModrinthVersion {
  id: String,
  name: String,
  version_number: String,
  game_versions: Vec<String>,
  loaders: Vec<String>,
  files: Vec<ModrinthVersionFile>,
}

#[derive(Debug, Deserialize)]
struct MrpackFileEntry {
  path: String,
  downloads: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MrpackIndex {
  files: Vec<MrpackFileEntry>,
}

#[derive(Debug, Deserialize)]
struct MojangManifestVersion {
  id: String,
  url: String,
}

#[derive(Debug, Deserialize)]
struct MojangVersionManifest {
  versions: Vec<MojangManifestVersion>,
}

fn parse_maven_versions(xml: &str) -> Vec<String> {
  let mut out = Vec::new();
  let mut rest = xml;
  while let Some(start) = rest.find("<version>") {
    let after = &rest[start + "<version>".len()..];
    let Some(end) = after.find("</version>") else {
      break;
    };
    let value = after[..end].trim();
    if !value.is_empty() {
      out.push(value.to_string());
    }
    rest = &after[end + "</version>".len()..];
  }
  out.sort();
  out.dedup();
  out
}

fn compare_version_desc(a: &str, b: &str) -> std::cmp::Ordering {
  fn score(v: &str) -> Vec<i64> {
    let mut nums = Vec::new();
    let mut cur = String::new();
    for ch in v.chars() {
      if ch.is_ascii_digit() {
        cur.push(ch);
      } else if !cur.is_empty() {
        nums.push(cur.parse::<i64>().unwrap_or(0));
        cur.clear();
      }
    }
    if !cur.is_empty() {
      nums.push(cur.parse::<i64>().unwrap_or(0));
    }
    nums
  }

  let sa = score(a);
  let sb = score(b);
  let n = sa.len().max(sb.len());
  for i in 0..n {
    let da = *sa.get(i).unwrap_or(&0);
    let db = *sb.get(i).unwrap_or(&0);
    if da != db {
      return db.cmp(&da);
    }
  }
  b.cmp(a)
}

#[command]
pub async fn loader_pick_version(loader: String, mc_version: String) -> AppResult<Option<String>> {
  let loader_norm = loader.trim().to_ascii_lowercase();
  let mc = mc_version.trim().to_string();
  if mc.is_empty() {
    return Err("loader:pickVersion: mcVersion missing".to_string());
  }

  if loader_norm == "vanilla" {
    return Ok(None);
  }

  let client = reqwest::Client::new();

  if loader_norm == "fabric" {
    let url = format!(
      "https://meta.fabricmc.net/v2/versions/loader/{}",
      urlencoding::encode(&mc)
    );
    let rows = client
      .get(url)
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json::<Vec<FabricLoaderRow>>()
      .await
      .map_err(into_error)?;
    let stable = rows
      .iter()
      .find(|x| x.loader.stable.unwrap_or(false))
      .map(|x| x.loader.version.clone());
    let chosen = stable.or_else(|| rows.first().map(|x| x.loader.version.clone()));
    return chosen
      .map(Some)
      .ok_or_else(|| format!("No Fabric loaders found for Minecraft {mc}"));
  }

  if loader_norm == "quilt" {
    let url = format!(
      "https://meta.quiltmc.org/v3/versions/loader/{}",
      urlencoding::encode(&mc)
    );
    let rows = client
      .get(url)
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json::<Vec<QuiltLoaderRow>>()
      .await
      .map_err(into_error)?;

    let stable = rows.iter().find_map(|row| {
      let loader = row.loader.as_ref()?;
      if loader.stable.unwrap_or(false) {
        loader.version.clone()
      } else {
        None
      }
    });
    let fallback = rows.iter().find_map(|row| row.loader.as_ref()?.version.clone());
    let chosen = stable.or(fallback);
    return chosen
      .map(Some)
      .ok_or_else(|| format!("No Quilt loaders found for Minecraft {mc}"));
  }

  if loader_norm == "forge" {
    let xml = client
      .get("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml")
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .text()
      .await
      .map_err(into_error)?;
    let mut filtered: Vec<String> = parse_maven_versions(&xml)
      .into_iter()
      .filter(|v| v.starts_with(&format!("{mc}-")))
      .collect();
    filtered.sort_by(|a, b| compare_version_desc(a, b));
    return filtered
      .first()
      .cloned()
      .map(Some)
      .ok_or_else(|| format!("No Forge versions found for Minecraft {mc}"));
  }

  if loader_norm == "neoforge" {
    let xml = client
      .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .text()
      .await
      .map_err(into_error)?;
    let all = parse_maven_versions(&xml);
    let mc_compact = mc.strip_prefix("1.").unwrap_or(mc.as_str()).to_string();
    let mut preferred: Vec<String> = all
      .iter()
      .filter(|v| v.starts_with(&format!("{mc_compact}.")))
      .cloned()
      .collect();
    let mut chosen_pool = if preferred.is_empty() {
      all
    } else {
      preferred.sort_by(|a, b| compare_version_desc(a, b));
      preferred
    };
    chosen_pool.sort_by(|a, b| compare_version_desc(a, b));
    return chosen_pool
      .first()
      .cloned()
      .map(Some)
      .ok_or_else(|| format!("No NeoForge versions found for Minecraft {mc}"));
  }

  Err(format!("loader:pickVersion: unsupported loader {loader_norm}"))
}

#[command]
pub async fn loader_install(
  app: tauri::AppHandle,
  instance_id: String,
  mc_version: String,
  loader: String,
  loader_version: Option<String>,
) -> AppResult<Value> {
  let _safe_id = validate_id(&instance_id)?;
  let mc = mc_version.trim().to_string();
  if mc.is_empty() {
    return Err("loader:install: mcVersion missing".to_string());
  }
  let loader_norm = loader.trim().to_ascii_lowercase();
  if loader_norm.is_empty() {
    return Err("loader:install: loader missing".to_string());
  }

  let resolved = if let Some(v) = loader_version {
    let t = v.trim().to_string();
    if t.is_empty() {
      loader_pick_version(loader_norm.clone(), mc.clone()).await?
    } else {
      Some(t)
    }
  } else {
    loader_pick_version(loader_norm.clone(), mc.clone()).await?
  };

  if loader_norm == "vanilla" {
    let _ = vanilla_install(app.clone(), mc.clone()).await?;
    return Ok(json!({
      "loaderVersion": Value::Null,
      "installed": true
    }));
  }

  if loader_norm == "fabric" {
    let version = resolved
      .clone()
      .ok_or_else(|| "loader:install: could not resolve Fabric loader version".to_string())?;
    let _ = fabric_install(
      app.clone(),
      instance_id.clone(),
      mc.clone(),
      version.clone(),
    )
    .await?;
    return Ok(json!({
      "loaderVersion": version,
      "installed": true
    }));
  }

  if loader_norm == "quilt" {
    let version = resolved
      .clone()
      .ok_or_else(|| "loader:install: could not resolve Quilt loader version".to_string())?;
    let _ = vanilla_install(app.clone(), mc.clone()).await?;
    let profile: Value = reqwest::Client::new()
      .get(format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
        urlencoding::encode(&mc),
        urlencoding::encode(&version)
      ))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?;

    let quilt_id = format!("quilt-loader-{version}-{mc}");
    let vdir = versions_root(&app)?.join(&quilt_id);
    fs::create_dir_all(&vdir).map_err(into_error)?;
    let out_json = vdir.join(format!("{quilt_id}.json"));
    let mut final_profile = profile.clone();
    final_profile["id"] = json!(quilt_id.clone());
    final_profile["inheritsFrom"] = json!(mc.clone());
    final_profile["jar"] = json!(mc.clone());
    final_profile["type"] = json!("release");
    fs::write(
      &out_json,
      serde_json::to_string_pretty(&final_profile).map_err(into_error)?,
    )
    .map_err(into_error)?;

    let vanilla_jar = versions_root(&app)?.join(&mc).join(format!("{mc}.jar"));
    let out_jar = vdir.join(format!("{quilt_id}.jar"));
    if vanilla_jar.exists() {
      fs::copy(vanilla_jar, out_jar).map_err(into_error)?;
    }

    if let Some(libs) = final_profile.get("libraries").and_then(|v| v.as_array()) {
      for lib in libs {
        let path = lib
          .get("downloads")
          .and_then(|v| v.get("artifact"))
          .and_then(|v| v.get("path"))
          .and_then(|v| v.as_str());
        let url = lib
          .get("downloads")
          .and_then(|v| v.get("artifact"))
          .and_then(|v| v.get("url"))
          .and_then(|v| v.as_str());
        let (Some(p), Some(u)) = (path, url) else {
          continue;
        };
        let target = libraries_root(&app)?.join(p);
        if target.exists() && fs::metadata(&target).map_err(into_error)?.len() > 0 {
          continue;
        }
        if let Some(parent) = target.parent() {
          fs::create_dir_all(parent).map_err(into_error)?;
        }
        let bytes = reqwest::Client::new()
          .get(u)
          .header("user-agent", "FishbatteryLauncher/0.2.1")
          .send()
          .await
          .map_err(into_error)?
          .error_for_status()
          .map_err(into_error)?
          .bytes()
          .await
          .map_err(into_error)?;
        fs::write(target, bytes).map_err(into_error)?;
      }
    }

    return Ok(json!({
      "loaderVersion": version,
      "installed": true
    }));
  }

  // Forge/NeoForge current Phase 5 behavior: resolve version + prefetch installer.
  if (loader_norm == "forge" || loader_norm == "neoforge") && resolved.is_some() {
    let version = resolved.clone().unwrap_or_default();
    let (url, file_name) = if loader_norm == "forge" {
      (
        format!(
          "https://maven.minecraftforge.net/net/minecraftforge/forge/{0}/forge-{0}-installer.jar",
          urlencoding::encode(&version)
        ),
        format!("forge-{version}-installer.jar"),
      )
    } else {
      (
        format!(
          "https://maven.neoforged.net/releases/net/neoforged/neoforge/{0}/neoforge-{0}-installer.jar",
          urlencoding::encode(&version)
        ),
        format!("neoforge-{version}-installer.jar"),
      )
    };

    let out_dir = app
      .path()
      .app_data_dir()
      .map_err(into_error)?
      .join("data")
      .join("loaders")
      .join(&loader_norm)
      .join(&version);
    fs::create_dir_all(&out_dir).map_err(into_error)?;
    let out_file = out_dir.join(file_name);
    let should_download = !out_file.exists() || fs::metadata(&out_file).map_err(into_error)?.len() == 0;
    if should_download {
      let bytes = reqwest::Client::new()
        .get(url)
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .bytes()
        .await
        .map_err(into_error)?;
      fs::write(&out_file, &bytes).map_err(into_error)?;
    }
    return Ok(json!({
      "loaderVersion": resolved,
      "installerPath": out_file.to_string_lossy().to_string()
    }));
  }

  Ok(json!({ "loaderVersion": resolved }))
}

#[command]
pub fn mods_validate(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let _inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;

  // Phase 4 baseline validator: keep flow unblocked with a stable payload shape.
  // Deeper mod graph/dependency validation is ported in a later phase.
  Ok(json!({
    "summary": "no-issues",
    "issues": []
  }))
}

#[command]
pub fn mods_list(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let _inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let state_path = mods_state_path(&app, &safe_id)?;
  let state: Value = read_json_file(
    &state_path,
    json!({
      "enabled": {},
      "resolved": {}
    }),
  );

  let enabled_obj = state
    .get("enabled")
    .and_then(|v| v.as_object())
    .cloned()
    .unwrap_or_default();
  let resolved_obj = state
    .get("resolved")
    .and_then(|v| v.as_object())
    .cloned()
    .unwrap_or_default();

  let mut keys = BTreeSet::<String>::new();
  for (id, _, _, _) in MOD_CATALOG {
    keys.insert(id.to_string());
  }
  for k in enabled_obj.keys() {
    keys.insert(k.clone());
  }
  for k in resolved_obj.keys() {
    keys.insert(k.clone());
  }

  let mut mods = Vec::new();
  for id in keys {
    let cat = MOD_CATALOG.iter().find(|x| x.0 == id);
    let resolved = resolved_obj.get(&id).cloned().unwrap_or(Value::Null);
    let required = cat.map(|x| x.2).unwrap_or(false);
    let enabled = enabled_obj
      .get(&id)
      .and_then(|v| v.as_bool())
      .unwrap_or_else(|| resolved.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) || required);
    let status = resolved
      .get("status")
      .and_then(|v| v.as_str())
      .unwrap_or("unavailable")
      .to_string();
    let display_name = cat
      .map(|x| x.1.to_string())
      .unwrap_or_else(|| {
        id
          .split('-')
          .filter(|p| !p.is_empty())
          .map(|p| {
            let mut chars = p.chars();
            match chars.next() {
              Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
              None => String::new(),
            }
          })
          .collect::<Vec<_>>()
          .join(" ")
      });

    mods.push(json!({
      "id": id,
      "name": display_name,
      "required": required,
      "enabled": enabled,
      "status": status,
      "resolved": if resolved.is_null() { json!({}) } else { resolved }
    }));
  }

  Ok(json!({
    "mods": mods,
    "updatedAt": now_ms()
  }))
}

fn managed_file_name(id: &str, upstream: &str, enabled: bool) -> String {
  let safe = upstream
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
    .collect::<String>();
  if enabled {
    format!("{id}__{safe}")
  } else {
    format!("{id}__{safe}.disabled")
  }
}

fn clear_prefixed_files(dir: &Path, id: &str, ext: &str) -> AppResult<()> {
  if !dir.exists() {
    return Ok(());
  }
  for entry in fs::read_dir(dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let file_name = entry.file_name().to_string_lossy().to_string();
    if !file_name.starts_with(&format!("{id}__")) {
      continue;
    }
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(ext) || lower.ends_with(&format!("{ext}.disabled")) {
      let _ = fs::remove_file(entry.path());
    }
  }
  Ok(())
}

fn toggle_prefixed_enabled(dir: &Path, id: &str, ext: &str, enabled: bool) -> AppResult<()> {
  if !dir.exists() {
    return Ok(());
  }
  for entry in fs::read_dir(dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let path = entry.path();
    let file_name = entry.file_name().to_string_lossy().to_string();
    if !file_name.starts_with(&format!("{id}__")) {
      continue;
    }
    let lower = file_name.to_ascii_lowercase();
    if enabled && lower.ends_with(&format!("{ext}.disabled")) {
      let next = path.with_file_name(file_name.trim_end_matches(".disabled"));
      let _ = fs::rename(&path, next);
    }
    if !enabled && lower.ends_with(ext) {
      let next = path.with_file_name(format!("{file_name}.disabled"));
      let _ = fs::rename(path, next);
    }
  }
  Ok(())
}

fn managed_dependency_file_name(project_id: &str, upstream: &str) -> String {
  let safe_project = project_id
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
    .collect::<String>();
  let safe_upstream = upstream
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
    .collect::<String>();
  format!("dep__{safe_project}__{safe_upstream}")
}

fn clear_dependency_files_for_project(dir: &Path, project_id: &str) -> AppResult<()> {
  if !dir.exists() {
    return Ok(());
  }
  let safe_project = project_id
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
    .collect::<String>();
  let prefix = format!("dep__{safe_project}__");
  for entry in fs::read_dir(dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let file_name = entry.file_name().to_string_lossy().to_string();
    if !file_name.starts_with(&prefix) {
      continue;
    }
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".jar") || lower.ends_with(".jar.disabled") {
      let _ = fs::remove_file(entry.path());
    }
  }
  Ok(())
}

fn clear_all_dependency_files(dir: &Path) -> AppResult<()> {
  if !dir.exists() {
    return Ok(());
  }
  for entry in fs::read_dir(dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let file_name = entry.file_name().to_string_lossy().to_string();
    if !file_name.starts_with("dep__") {
      continue;
    }
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".jar") || lower.ends_with(".jar.disabled") {
      let _ = fs::remove_file(entry.path());
    }
  }
  Ok(())
}

async fn resolve_latest_modrinth(
  client: &reqwest::Client,
  project_id: &str,
  mc_version: &str,
  loader: Option<&str>,
) -> AppResult<Option<Value>> {
  let versions: Vec<Value> = client
    .get(format!(
      "https://api.modrinth.com/v2/project/{}/version",
      urlencoding::encode(project_id)
    ))
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  for v in versions {
    let game_versions = v.get("game_versions").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let has_mc = game_versions.iter().any(|x| x.as_str() == Some(mc_version));
    if !has_mc {
      continue;
    }
    if let Some(loader_id) = loader {
      let loaders = v.get("loaders").and_then(|x| x.as_array()).cloned().unwrap_or_default();
      let loader_match = if loader_id == "quilt" {
        // Quilt commonly consumes Fabric mods; accept either label.
        loaders.iter().any(|x| matches!(x.as_str(), Some("quilt" | "fabric")))
      } else {
        loaders.iter().any(|x| x.as_str() == Some(loader_id))
      };
      if !loader_match {
        continue;
      }
    }
    let files = v.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    if files.is_empty() {
      continue;
    }
    let picked = files
      .iter()
      .find(|f| f.get("primary").and_then(|x| x.as_bool()) == Some(true))
      .cloned()
      .unwrap_or_else(|| files[0].clone());
    let url = picked.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let file_name = picked
      .get("filename")
      .and_then(|x| x.as_str())
      .unwrap_or("file.bin")
      .to_string();
    if url.trim().is_empty() {
      continue;
    }
    let sha1 = picked
      .get("hashes")
      .and_then(|h| h.get("sha1"))
      .and_then(|x| x.as_str())
      .map(str::to_string);
    let sha512 = picked
      .get("hashes")
      .and_then(|h| h.get("sha512"))
      .and_then(|x| x.as_str())
      .map(str::to_string);
    let mut required_project_ids = Vec::<String>::new();
    for dep in v
      .get("dependencies")
      .and_then(|x| x.as_array())
      .cloned()
      .unwrap_or_default()
      .into_iter()
      .filter(|d| d.get("dependency_type").and_then(|x| x.as_str()) == Some("required"))
    {
      if let Some(pid) = dep.get("project_id").and_then(|x| x.as_str()).map(str::trim).filter(|x| !x.is_empty()) {
        required_project_ids.push(pid.to_string());
        continue;
      }
      // Some Modrinth dependencies only provide version_id; resolve it to project_id.
      if let Some(vid) = dep.get("version_id").and_then(|x| x.as_str()).map(str::trim).filter(|x| !x.is_empty()) {
        let version_meta: Value = client
          .get(format!("https://api.modrinth.com/v2/version/{}", urlencoding::encode(vid)))
          .header("user-agent", "FishbatteryLauncher/0.2.1")
          .send()
          .await
          .map_err(into_error)?
          .error_for_status()
          .map_err(into_error)?
          .json()
          .await
          .map_err(into_error)?;
        if let Some(pid) = version_meta
          .get("project_id")
          .and_then(|x| x.as_str())
          .map(str::trim)
          .filter(|x| !x.is_empty())
        {
          required_project_ids.push(pid.to_string());
        }
      }
    }
    required_project_ids.sort();
    required_project_ids.dedup();

    return Ok(Some(json!({
      "projectId": project_id,
      "versionName": v.get("version_number").and_then(|x| x.as_str()).unwrap_or("unknown"),
      "changelog": v.get("changelog").and_then(|x| x.as_str()).unwrap_or(""),
      "fileName": file_name,
      "url": url,
      "sha1": sha1,
      "sha512": sha512,
      "requiredProjectIds": required_project_ids
    })));
  }
  Ok(None)
}

async fn install_required_project_dependency(
  client: &reqwest::Client,
  project_id: &str,
  mc_version: &str,
  loader_filter: Option<&str>,
  mods_dir: &Path,
  cache_dir: &Path,
) -> AppResult<Vec<String>> {
  let Some(r) = resolve_latest_modrinth(client, project_id, mc_version, loader_filter).await? else {
    return Ok(Vec::new());
  };
  let url = r.get("url").and_then(|x| x.as_str()).unwrap_or("");
  let file_name = r.get("fileName").and_then(|x| x.as_str()).unwrap_or("dependency.jar");
  let sha1 = r.get("sha1").and_then(|x| x.as_str()).unwrap_or(file_name);
  let cache_name = format!("dep-{}-{}.jar", project_id, sha1);
  let cache_path = cache_dir.join(cache_name);
  if !cache_path.exists() || fs::metadata(&cache_path).map_err(into_error)?.len() == 0 {
    let bytes = client
      .get(url)
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .bytes()
      .await
      .map_err(into_error)?;
    fs::write(&cache_path, &bytes).map_err(into_error)?;
  }
  clear_dependency_files_for_project(mods_dir, project_id)?;
  let placed_name = managed_dependency_file_name(project_id, file_name);
  let placed_path = mods_dir.join(placed_name);
  fs::copy(&cache_path, &placed_path).map_err(into_error)?;
  Ok(
    r.get("requiredProjectIds")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default()
      .into_iter()
      .filter_map(|v| v.as_str().map(str::to_string))
      .collect::<Vec<_>>(),
  )
}

fn instance_mc_and_loader(inst: &Value, mc_version: Option<String>) -> (String, String) {
  let mc = mc_version
    .and_then(|x| if x.trim().is_empty() { None } else { Some(x) })
    .unwrap_or_else(|| inst.get("mcVersion").and_then(|x| x.as_str()).unwrap_or("1.21.1").to_string());
  let loader = inst
    .get("loader")
    .and_then(|x| x.as_str())
    .unwrap_or("fabric")
    .to_string();
  (mc, loader)
}

async fn mods_refresh_internal(
  app: &tauri::AppHandle,
  safe_id: &str,
  mc_version: String,
  loader: String,
  selected: Option<HashSet<String>>,
) -> AppResult<Value> {
  let state_path = mods_state_path(app, safe_id)?;
  let mut state: Value = read_json_file(
    &state_path,
    json!({
      "enabled": {},
      "resolved": {}
    }),
  );
  if !state.get("enabled").map(|v| v.is_object()).unwrap_or(false) {
    state["enabled"] = json!({});
  }
  if !state.get("resolved").map(|v| v.is_object()).unwrap_or(false) {
    state["resolved"] = json!({});
  }
  let enabled_obj = state.get("enabled").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  let mut next_enabled = serde_json::Map::<String, Value>::new();
  let mut resolved_obj = state.get("resolved").and_then(|v| v.as_object()).cloned().unwrap_or_default();

  let mods_dir = instance_dir(app, safe_id)?.join("mods");
  fs::create_dir_all(&mods_dir).map_err(into_error)?;
  let cache_dir = app_data_root(app)?.join("data").join("cache").join("mods");
  fs::create_dir_all(&cache_dir).map_err(into_error)?;
  if selected.is_none() {
    // Rebuild dependency jars on full refresh to keep them aligned with selected versions.
    clear_all_dependency_files(&mods_dir)?;
  }
  let client = reqwest::Client::new();
  let loader_norm = loader.trim().to_ascii_lowercase();
  let loader_filter = match loader_norm.as_str() {
    "fabric" | "quilt" | "forge" | "neoforge" => Some(loader_norm.as_str()),
    _ => None,
  };
  let mut dependency_queue = Vec::<String>::new();
  let mut dependency_seen = HashSet::<String>::new();

  for (id, _name, required, project_id) in MOD_CATALOG {
    let in_scope = selected.as_ref().map(|s| s.contains(id)).unwrap_or(true);
    let enabled = required || enabled_obj.get(id).and_then(|v| v.as_bool()).unwrap_or(false);
    next_enabled.insert(id.to_string(), json!(enabled));
    if !in_scope {
      continue;
    }
    if !enabled {
      clear_prefixed_files(&mods_dir, id, ".jar")?;
      resolved_obj.insert(
        id.to_string(),
        json!({
          "catalogId": id,
          "enabled": false,
          "status": "unavailable",
          "mcVersion": mc_version,
          "loader": loader_norm,
          "lastCheckedAt": now_ms()
        }),
      );
      continue;
    }

    let Some(r) = resolve_latest_modrinth(&client, project_id, &mc_version, loader_filter).await? else {
      clear_prefixed_files(&mods_dir, id, ".jar")?;
      resolved_obj.insert(
        id.to_string(),
        json!({
          "catalogId": id,
          "enabled": false,
          "status": "unavailable",
          "mcVersion": mc_version,
          "loader": loader_norm,
          "lastCheckedAt": now_ms()
        }),
      );
      continue;
    };

    let url = r.get("url").and_then(|x| x.as_str()).unwrap_or("");
    let file_name = r.get("fileName").and_then(|x| x.as_str()).unwrap_or("mod.jar");
    let cache_name = format!(
      "{}-{}.jar",
      id,
      r.get("sha1").and_then(|x| x.as_str()).unwrap_or(file_name)
    );
    let cache_path = cache_dir.join(cache_name);
    if !cache_path.exists() || fs::metadata(&cache_path).map_err(into_error)?.len() == 0 {
      let bytes = client
        .get(url)
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .bytes()
        .await
        .map_err(into_error)?;
      fs::write(&cache_path, &bytes).map_err(into_error)?;
    }
    clear_prefixed_files(&mods_dir, id, ".jar")?;
    let placed_name = managed_file_name(id, file_name, true);
    let placed_path = mods_dir.join(&placed_name);
    fs::copy(&cache_path, &placed_path).map_err(into_error)?;
    resolved_obj.insert(
      id.to_string(),
      json!({
        "catalogId": id,
        "enabled": true,
        "status": "ok",
        "mcVersion": mc_version,
        "loader": loader_norm,
        "versionName": r.get("versionName").cloned().unwrap_or(Value::Null),
        "upstreamFileName": file_name,
        "fileName": placed_name,
        "downloadUrl": url,
        "sha1": r.get("sha1").cloned().unwrap_or(Value::Null),
        "sha512": r.get("sha512").cloned().unwrap_or(Value::Null),
        "requiredProjectIds": r.get("requiredProjectIds").cloned().unwrap_or_else(|| json!([])),
        "lastCheckedAt": now_ms()
      }),
    );
    dependency_queue.extend(
      r.get("requiredProjectIds")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.as_str().map(str::to_string)),
    );
  }

  while let Some(project_id) = dependency_queue.pop() {
    let project_id = project_id.trim().to_string();
    if project_id.is_empty() || !dependency_seen.insert(project_id.clone()) {
      continue;
    }
    let next = install_required_project_dependency(
      &client,
      &project_id,
      &mc_version,
      loader_filter,
      &mods_dir,
      &cache_dir,
    )
    .await?;
    if !next.is_empty() {
      dependency_queue.extend(next);
    }
  }

  state["enabled"] = Value::Object(next_enabled);
  state["resolved"] = Value::Object(resolved_obj);
  write_json_file(&state_path, &state)?;
  mods_list(app.clone(), safe_id.to_string())
}

#[command]
pub fn mods_set_enabled(app: tauri::AppHandle, instance_id: String, mod_id: String, enabled: bool) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let _inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let id = mod_id.trim().to_string();
  if id.is_empty() {
    return Err("modsSetEnabled: modId missing".to_string());
  }
  let state_path = mods_state_path(&app, &safe_id)?;
  let mut state: Value = read_json_file(
    &state_path,
    json!({
      "enabled": {},
      "resolved": {}
    }),
  );
  if !state.get("enabled").map(|v| v.is_object()).unwrap_or(false) {
    state["enabled"] = json!({});
  }
  let required = MOD_CATALOG.iter().find(|x| x.0 == id).map(|x| x.2).unwrap_or(false);
  let target_enabled = if required { true } else { enabled };
  state["enabled"][&id] = json!(target_enabled);
  if let Some(resolved_obj) = state.get_mut("resolved").and_then(|v| v.as_object_mut()) {
    if let Some(entry) = resolved_obj.get_mut(&id).and_then(|v| v.as_object_mut()) {
      entry.insert("enabled".to_string(), json!(target_enabled));
      entry.insert("lastCheckedAt".to_string(), json!(now_ms()));
    }
  }
  write_json_file(&state_path, &state)?;

  let mods_dir = instance_dir(&app, &safe_id)?.join("mods");
  fs::create_dir_all(&mods_dir).map_err(into_error)?;
  // Keep managed files deterministic (single visible state file per catalog id).
  let mut found_managed_file = false;
  if mods_dir.exists() {
    for entry in fs::read_dir(&mods_dir).map_err(into_error)? {
      let entry = entry.map_err(into_error)?;
      let name = entry.file_name().to_string_lossy().to_string();
      if name.starts_with(&format!("{id}__")) {
        found_managed_file = true;
      }
    }
  }

  toggle_prefixed_enabled(&mods_dir, &id, ".jar", target_enabled)?;

  // If enabling and no managed file exists in /mods yet, restore from cache when possible.
  if target_enabled && !found_managed_file {
    let resolved = state
      .get("resolved")
      .and_then(|v| v.get(&id))
      .cloned()
      .unwrap_or(Value::Null);
    let upstream = resolved
      .get("upstreamFileName")
      .and_then(|v| v.as_str())
      .or_else(|| resolved.get("fileName").and_then(|v| v.as_str()))
      .unwrap_or("mod.jar")
      .trim_end_matches(".disabled")
      .to_string();
    let sha1 = resolved.get("sha1").and_then(|v| v.as_str()).unwrap_or("");
    if !upstream.is_empty() {
      let cache_dir = app_data_root(&app)?.join("data").join("cache").join("mods");
      let cache_name = format!("{}-{}.jar", id, if sha1.is_empty() { &upstream } else { sha1 });
      let cache_path = cache_dir.join(cache_name);
      if cache_path.exists() && fs::metadata(&cache_path).map_err(into_error)?.len() > 0 {
        clear_prefixed_files(&mods_dir, &id, ".jar")?;
        let placed_name = managed_file_name(&id, &upstream, true);
        let placed_path = mods_dir.join(placed_name.clone());
        fs::copy(&cache_path, &placed_path).map_err(into_error)?;
        if let Some(resolved_obj) = state.get_mut("resolved").and_then(|v| v.as_object_mut()) {
          if let Some(entry) = resolved_obj.get_mut(&id).and_then(|v| v.as_object_mut()) {
            entry.insert("fileName".to_string(), json!(placed_name));
          }
        }
        write_json_file(&state_path, &state)?;
      }
    }
  }

  Ok(json!(true))
}

#[command]
pub async fn mods_refresh(app: tauri::AppHandle, instance_id: String, mc_version: Option<String>) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let (mc, loader) = instance_mc_and_loader(inst, mc_version);
  mods_refresh_internal(&app, &safe_id, mc, loader, None).await
}

#[command]
pub async fn mods_plan_refresh(app: tauri::AppHandle, instance_id: String, mc_version: Option<String>) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let (mc, loader) = instance_mc_and_loader(inst, mc_version);
  let loader_norm = loader.trim().to_ascii_lowercase();
  let loader_filter = match loader_norm.as_str() {
    "fabric" | "quilt" | "forge" | "neoforge" => Some(loader_norm.as_str()),
    _ => None,
  };
  let state_path = mods_state_path(&app, &safe_id)?;
  let state: Value = read_json_file(
    &state_path,
    json!({
      "enabled": {},
      "resolved": {}
    }),
  );
  let enabled_obj = state.get("enabled").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  let resolved_obj = state.get("resolved").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  let client = reqwest::Client::new();
  let mut updates = Vec::<Value>::new();
  let mut blocked = Vec::<Value>::new();
  for (id, name, required, project_id) in MOD_CATALOG {
    let enabled = required || enabled_obj.get(id).and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled {
      continue;
    }
    let current = resolved_obj.get(id).cloned().unwrap_or(Value::Null);
    match resolve_latest_modrinth(&client, project_id, &mc, loader_filter).await? {
      Some(latest) => {
        let from = current.get("versionName").and_then(|x| x.as_str()).unwrap_or("");
        let to = latest.get("versionName").and_then(|x| x.as_str()).unwrap_or("");
        if from != to {
          updates.push(json!({
            "id": id,
            "name": name,
            "severity": "safe",
            "fromVersion": if from.is_empty() { Value::Null } else { json!(from) },
            "toVersion": if to.is_empty() { Value::Null } else { json!(to) },
            "changelog": latest.get("changelog").cloned().unwrap_or_else(|| json!("")),
            "dependencyAdded": [],
            "dependencyRemoved": [],
            "reason": "Compatible update available"
          }));
        }
      }
      None => blocked.push(json!({
        "id": id,
        "name": name,
        "reason": format!("No compatible {loader_norm} build found for Minecraft {mc}.")
      })),
    }
  }
  Ok(json!({
    "checkedAt": now_ms(),
    "updates": updates,
    "blocked": blocked,
    "counts": {
      "safe": updates.len(),
      "caution": 0,
      "breaking": 0
    }
  }))
}

#[command]
pub async fn mods_refresh_selected(
  app: tauri::AppHandle,
  instance_id: String,
  mc_version: String,
  selected_ids: Vec<String>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let (mc, loader) = instance_mc_and_loader(inst, Some(mc_version));
  let selected = selected_ids
    .into_iter()
    .map(|x| x.trim().to_string())
    .filter(|x| !x.is_empty())
    .collect::<HashSet<_>>();
  mods_refresh_internal(&app, &safe_id, mc, loader, Some(selected)).await
}

#[command]
pub async fn mods_sync_bridge(app: tauri::AppHandle, instance_id: String, mc_version: Option<String>) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;

  let mc = mc_version
    .as_deref()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .or_else(|| inst.get("mcVersion").and_then(|v| v.as_str()).map(|s| s.trim().to_string()))
    .filter(|s| !s.is_empty())
    .ok_or_else(|| "mods:syncBridge: mcVersion missing".to_string())?;

  let loader = inst
    .get("loader")
    .and_then(|v| v.as_str())
    .unwrap_or("fabric")
    .trim()
    .to_ascii_lowercase();

  if loader != "fabric" && loader != "quilt" {
    return Ok(json!({
      "installed": false,
      "assetName": Value::Null,
      "skipped": true,
      "reason": format!("unsupported loader {loader}")
    }));
  }

  let supported = {
    let mut parts = mc.split('.');
    let major = parts.next().and_then(|x| x.parse::<u32>().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|x| x.parse::<u32>().ok()).unwrap_or(0);
    // Bridge release channel currently targets modern Fabric/Quilt builds 1.20+ through 1.21.x.
    major == 1 && (20..=21).contains(&minor)
  };
  if !supported {
    return Ok(json!({
      "installed": false,
      "assetName": Value::Null,
      "skipped": true,
      "reason": format!("unsupported mcVersion {mc}")
    }));
  }

  let owner = "fishbatteryapp";
  let repo = "fishbattery-cape-bridge";
  let tag = std::env::var("FISHBATTERY_CAPE_BRIDGE_TAG").unwrap_or_default().trim().to_string();
  let api_url = if tag.is_empty() {
    format!("https://api.github.com/repos/{owner}/{repo}/releases/latest")
  } else {
    format!("https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}")
  };

  let client = reqwest::Client::new();
  let mut req = client
    .get(api_url)
    .header("User-Agent", "FishbatteryLauncher/1.0")
    .header("Accept", "application/vnd.github+json");
  if let Ok(token) = std::env::var("GITHUB_TOKEN") {
    let t = token.trim().to_string();
    if !t.is_empty() {
      req = req.bearer_auth(t);
    }
  }
  let release: Value = req
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  let assets = release
    .get("assets")
    .and_then(|v| v.as_array())
    .ok_or_else(|| "mods:syncBridge: malformed GitHub release payload".to_string())?;
  let loader_hint = if loader == "quilt" { "quilt" } else { "fabric" };
  let desired = assets
    .iter()
    .find(|a| {
      let name = a
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
      name.ends_with(".jar") && name.contains(&mc.to_ascii_lowercase()) && name.contains(loader_hint)
    })
    .or_else(|| {
      assets.iter().find(|a| {
        let name = a
          .get("name")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_ascii_lowercase();
        name.ends_with(".jar") && name.contains(loader_hint)
      })
    })
    .ok_or_else(|| "mods:syncBridge: No suitable bridge JAR found in release assets".to_string())?;

  let asset_name = desired
    .get("name")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "mods:syncBridge: asset name missing".to_string())?
    .to_string();
  let download_url = desired
    .get("browser_download_url")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "mods:syncBridge: asset download url missing".to_string())?
    .to_string();
  let release_tag = release
    .get("tag_name")
    .and_then(|v| v.as_str())
    .unwrap_or(if tag.is_empty() { "latest" } else { &tag })
    .to_string();

  let mods_dir = instance_dir(&app, &safe_id)?.join("mods");
  fs::create_dir_all(&mods_dir).map_err(into_error)?;
  let out_path = mods_dir.join(&asset_name);
  if out_path.exists() {
    if let Ok(meta) = fs::metadata(&out_path) {
      if meta.is_file() && meta.len() > 0 {
        return Ok(json!({
          "installed": false,
          "assetName": asset_name,
          "tag": release_tag,
          "skipped": false
        }));
      }
    }
  }

  for entry in fs::read_dir(&mods_dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let p = entry.path();
    if !p.is_file() {
      continue;
    }
    let name = entry.file_name().to_string_lossy().to_string();
    let lower = name.to_ascii_lowercase();
    let is_bridge = lower.contains("cape-bridge") || (lower.contains("fishbattery") && lower.contains("bridge"));
    if !is_bridge || name == asset_name {
      continue;
    }
    let _ = fs::remove_file(p);
  }

  let tmp_path = out_path.with_extension("jar.partial");
  let mut download_req = client
    .get(download_url)
    .header("User-Agent", "FishbatteryLauncher/1.0");
  if let Ok(token) = std::env::var("GITHUB_TOKEN") {
    let t = token.trim().to_string();
    if !t.is_empty() {
      download_req = download_req.bearer_auth(t);
    }
  }
  let bytes = match download_req.send().await.map_err(into_error)?.error_for_status() {
    Ok(resp) => resp.bytes().await.map_err(into_error)?,
    Err(err) => return Err(format!("mods:syncBridge: download failed: {err}")),
  };
  if bytes.is_empty() {
    return Err("mods:syncBridge: downloaded bridge JAR is empty".to_string());
  }

  if let Err(err) = fs::write(&tmp_path, &bytes).map_err(into_error) {
    let _ = fs::remove_file(&tmp_path);
    return Err(err);
  }
  if let Err(err) = fs::rename(&tmp_path, &out_path).map_err(into_error) {
    let _ = fs::remove_file(&tmp_path);
    return Err(err);
  }

  Ok(json!({
    "installed": true,
    "assetName": asset_name,
    "tag": release_tag,
    "skipped": false
  }))
}

#[command]
pub fn mods_fix_duplicates(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let _inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mods_dir = instance_dir(&app, &safe_id)?.join("mods");
  fs::create_dir_all(&mods_dir).map_err(into_error)?;
  let mut groups = std::collections::HashMap::<String, Vec<PathBuf>>::new();
  for entry in fs::read_dir(&mods_dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let p = entry.path();
    if !p.is_file() {
      continue;
    }
    let name = entry.file_name().to_string_lossy().to_string();
    let lower = name.to_ascii_lowercase();
    if !(lower.ends_with(".jar") || lower.ends_with(".jar.disabled")) {
      continue;
    }
    let key = if let Some(idx) = name.find("__") {
      name[..idx].to_ascii_lowercase()
    } else {
      lower.clone()
    };
    groups.entry(key).or_default().push(p);
  }
  let mut removed = Vec::<String>::new();
  for (_key, mut files) in groups {
    if files.len() <= 1 {
      continue;
    }
    files.sort_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok());
    files.reverse();
    for extra in files.into_iter().skip(1) {
      let name = extra
        .file_name()
        .map(|x| x.to_string_lossy().to_string())
        .unwrap_or_else(|| extra.to_string_lossy().to_string());
      let _ = fs::remove_file(&extra);
      removed.push(name);
    }
  }
  Ok(json!({ "removed": removed }))
}

#[command]
pub fn packs_list(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let _inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let state_path = packs_state_path(&app, &safe_id)?;
  let state: Value = read_json_file(
    &state_path,
    json!({
      "enabled": {},
      "resolved": {}
    }),
  );
  let enabled_obj = state.get("enabled").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  let resolved_obj = state.get("resolved").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  let mut items = Vec::<Value>::new();
  for (id, name, kind, required, _project_id) in PACK_CATALOG {
    let resolved = resolved_obj.get(id).cloned().unwrap_or(Value::Null);
    let enabled = required
      || enabled_obj.get(id).and_then(|v| v.as_bool()).unwrap_or_else(|| resolved.get("enabled").and_then(|x| x.as_bool()).unwrap_or(false));
    items.push(json!({
      "id": id,
      "name": name,
      "kind": kind,
      "required": required,
      "enabled": enabled,
      "status": resolved.get("status").and_then(|x| x.as_str()).unwrap_or("unavailable"),
      "versionName": resolved.get("versionName").cloned().unwrap_or(Value::Null),
      "error": resolved.get("error").cloned().unwrap_or(Value::Null)
    }));
  }
  Ok(json!({ "items": items }))
}

#[command]
pub fn packs_set_enabled(app: tauri::AppHandle, instance_id: String, pack_id: String, enabled: bool) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let _inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let id = pack_id.trim().to_string();
  if id.is_empty() {
    return Err("packsSetEnabled: packId missing".to_string());
  }
  let state_path = packs_state_path(&app, &safe_id)?;
  let mut state: Value = read_json_file(
    &state_path,
    json!({
      "enabled": {},
      "resolved": {}
    }),
  );
  if !state.get("enabled").map(|v| v.is_object()).unwrap_or(false) {
    state["enabled"] = json!({});
  }
  let required = PACK_CATALOG.iter().find(|x| x.0 == id).map(|x| x.3).unwrap_or(false);
  state["enabled"][&id] = json!(if required { true } else { enabled });
  write_json_file(&state_path, &state)?;
  let kind = PACK_CATALOG
    .iter()
    .find(|x| x.0 == id)
    .map(|x| x.2)
    .unwrap_or("resourcepack");
  let dir = instance_dir(&app, &safe_id)?.join(if kind == "shaderpack" { "shaderpacks" } else { "resourcepacks" });
  fs::create_dir_all(&dir).map_err(into_error)?;
  toggle_prefixed_enabled(&dir, &id, ".zip", if required { true } else { enabled })?;
  Ok(json!(true))
}

#[command]
pub async fn packs_refresh(app: tauri::AppHandle, instance_id: String, mc_version: Option<String>) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let (mc, _loader) = instance_mc_and_loader(inst, mc_version);
  let state_path = packs_state_path(&app, &safe_id)?;
  let mut state: Value = read_json_file(
    &state_path,
    json!({
      "enabled": {},
      "resolved": {}
    }),
  );
  if !state.get("enabled").map(|v| v.is_object()).unwrap_or(false) {
    state["enabled"] = json!({});
  }
  if !state.get("resolved").map(|v| v.is_object()).unwrap_or(false) {
    state["resolved"] = json!({});
  }
  let enabled_obj = state.get("enabled").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  let mut next_enabled = serde_json::Map::<String, Value>::new();
  let mut resolved_obj = state.get("resolved").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  let cache_dir = app_data_root(&app)?.join("data").join("cache").join("packs");
  fs::create_dir_all(&cache_dir).map_err(into_error)?;
  let client = reqwest::Client::new();
  for (id, _name, kind, required, project_id) in PACK_CATALOG {
    let enabled = required || enabled_obj.get(id).and_then(|v| v.as_bool()).unwrap_or(false);
    next_enabled.insert(id.to_string(), json!(enabled));
    let dir = instance_dir(&app, &safe_id)?.join(if kind == "shaderpack" { "shaderpacks" } else { "resourcepacks" });
    fs::create_dir_all(&dir).map_err(into_error)?;
    if !enabled {
      clear_prefixed_files(&dir, id, ".zip")?;
      resolved_obj.insert(id.to_string(), json!({
        "catalogId": id,
        "kind": kind,
        "enabled": false,
        "status": "unavailable",
        "mcVersion": mc,
        "lastCheckedAt": now_ms()
      }));
      continue;
    }
    let Some(r) = resolve_latest_modrinth(&client, project_id, &mc, None).await? else {
      resolved_obj.insert(id.to_string(), json!({
        "catalogId": id,
        "kind": kind,
        "enabled": false,
        "status": "unavailable",
        "mcVersion": mc,
        "lastCheckedAt": now_ms()
      }));
      continue;
    };
    let url = r.get("url").and_then(|x| x.as_str()).unwrap_or("");
    let file_name = r.get("fileName").and_then(|x| x.as_str()).unwrap_or("pack.zip");
    let cache_name = format!(
      "{}-{}.zip",
      id,
      r.get("sha1").and_then(|x| x.as_str()).unwrap_or(file_name)
    );
    let cache_path = cache_dir.join(cache_name);
    if !cache_path.exists() || fs::metadata(&cache_path).map_err(into_error)?.len() == 0 {
      let bytes = client
        .get(url)
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .bytes()
        .await
        .map_err(into_error)?;
      fs::write(&cache_path, &bytes).map_err(into_error)?;
    }
    clear_prefixed_files(&dir, id, ".zip")?;
    let placed_name = managed_file_name(id, file_name, true);
    let placed = dir.join(&placed_name);
    fs::copy(&cache_path, &placed).map_err(into_error)?;
    resolved_obj.insert(id.to_string(), json!({
      "catalogId": id,
      "kind": kind,
      "enabled": true,
      "status": "ok",
      "mcVersion": mc,
      "versionName": r.get("versionName").cloned().unwrap_or(Value::Null),
      "upstreamFileName": file_name,
      "fileName": placed_name,
      "downloadUrl": url,
      "sha1": r.get("sha1").cloned().unwrap_or(Value::Null),
      "sha512": r.get("sha512").cloned().unwrap_or(Value::Null),
      "lastCheckedAt": now_ms()
    }));
  }
  state["enabled"] = Value::Object(next_enabled);
  state["resolved"] = Value::Object(resolved_obj);
  write_json_file(&state_path, &state)?;
  packs_list(app, safe_id)
}

fn detect_loader_from_curseforge_manifest(manifest: &Value) -> String {
  let loaders = manifest
    .get("minecraft")
    .and_then(|v| v.get("modLoaders"))
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();
  for row in loaders {
    let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_ascii_lowercase();
    if id.starts_with("fabric-") {
      return "fabric".to_string();
    }
    if id.starts_with("quilt-") {
      return "quilt".to_string();
    }
    if id.starts_with("neoforge-") {
      return "neoforge".to_string();
    }
    if id.starts_with("forge-") {
      return "forge".to_string();
    }
  }
  "vanilla".to_string()
}

fn detect_loader_from_curseforge_versions(game_versions: &[String]) -> String {
  for item in game_versions {
    let v = item.to_ascii_lowercase();
    if v.contains("fabric") {
      return "fabric".to_string();
    }
    if v.contains("quilt") {
      return "quilt".to_string();
    }
    if v.contains("neoforge") || v.contains("neo forge") {
      return "neoforge".to_string();
    }
    if v.contains("forge") {
      return "forge".to_string();
    }
  }
  "vanilla".to_string()
}

fn detect_mc_from_curseforge_versions(game_versions: &[String]) -> Option<String> {
  game_versions.iter().find_map(|v| {
    let t = v.trim();
    if t.starts_with("1.") {
      Some(t.to_string())
    } else {
      None
    }
  })
}

fn read_secret_text(path: &Path) -> Option<String> {
  let raw = fs::read_to_string(path).ok()?;
  let trimmed = raw.trim().to_string();
  if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("placeholder api key") {
    return None;
  }
  Some(trimmed)
}

fn curseforge_api_key(app: &tauri::AppHandle) -> Option<String> {
  if let Ok(key) = std::env::var("FISHBATTERY_CURSEFORGE_API_KEY") {
    let k = key.trim().to_string();
    if !k.is_empty() && !k.eq_ignore_ascii_case("placeholder api key") {
      return Some(k);
    }
  }
  if let Ok(key) = std::env::var("VITE_CURSEFORGE_API_KEY") {
    let k = key.trim().to_string();
    if !k.is_empty() && !k.eq_ignore_ascii_case("placeholder api key") {
      return Some(k);
    }
  }

  if let Ok(app_data) = app.path().app_data_dir() {
    let candidates = [
      app_data.join("curseforge-api-key.txt"),
      app_data.join("data").join("curseforge-api-key.txt"),
      app_data.join("secrets").join("curseforge-api-key.txt"),
    ];
    for p in candidates {
      if let Some(k) = read_secret_text(&p) {
        return Some(k);
      }
    }
  }

  if let Ok(app_config) = app.path().app_config_dir() {
    let candidates = [
      app_config.join("curseforge-api-key.txt"),
      app_config.join("secrets").join("curseforge-api-key.txt"),
    ];
    for p in candidates {
      if let Some(k) = read_secret_text(&p) {
        return Some(k);
      }
    }
  }

  if let Ok(resource_dir) = app.path().resource_dir() {
    let candidates = [
      resource_dir.join("curseforge-api-key.txt"),
      resource_dir.join("secrets").join("curseforge-api-key.txt"),
    ];
    for p in candidates {
      if let Some(k) = read_secret_text(&p) {
        return Some(k);
      }
    }
  }

  if let Ok(exe) = std::env::current_exe() {
    if let Some(exe_dir) = exe.parent() {
      let candidates = [
        exe_dir.join("curseforge-api-key.txt"),
        exe_dir.join("secrets").join("curseforge-api-key.txt"),
      ];
      for p in candidates {
        if let Some(k) = read_secret_text(&p) {
          return Some(k);
        }
      }
    }
  }

  if let Ok(cwd) = std::env::current_dir() {
    let candidates = [
      cwd.join("secrets").join("curseforge-api-key.txt"),
      cwd.join("..").join("secrets").join("curseforge-api-key.txt"),
      cwd.join("..").join("..").join("secrets").join("curseforge-api-key.txt"),
      cwd.join("tauri").join("secrets").join("curseforge-api-key.txt"),
    ];
    for p in candidates {
      if let Some(k) = read_secret_text(&p) {
        return Some(k);
      }
    }
  }

  None
}

#[command]
pub async fn provider_packs_search_curseforge(
  app: tauri::AppHandle,
  query: String,
  limit: Option<u32>,
) -> AppResult<Value> {
  let api_key = curseforge_api_key(&app).ok_or_else(|| {
    "providerPacksSearch: missing CurseForge API key. Set FISHBATTERY_CURSEFORGE_API_KEY or create secrets/curseforge-api-key.txt".to_string()
  })?;

  let capped = limit.unwrap_or(24).max(1).min(40);
  let mut req = reqwest::Client::new()
    .get("https://api.curseforge.com/v1/mods/search")
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .header("x-api-key", api_key)
    .query(&[
      ("gameId", "432"),
      ("classId", "4471"),
      ("pageSize", &capped.to_string()),
      ("sortField", "2"),
      ("sortOrder", "desc"),
    ]);
  let q = query.trim().to_string();
  if !q.is_empty() {
    req = req.query(&[("searchFilter", q.as_str())]);
  }
  let payload: Value = req
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  let hits = payload
    .get("data")
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default()
    .into_iter()
    .map(|item| {
      let mod_id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
      let idx = item
        .get("latestFilesIndexes")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or_else(|| json!({}));
      let mod_loader = idx.get("modLoader").and_then(|v| v.as_u64()).unwrap_or(0);
      let loader = match mod_loader {
        4 => "Fabric",
        5 => "Quilt",
        6 => "Forge",
        11 => "NeoForge",
        _ => "varies",
      };
      json!({
        "id": format!("cf-{}", mod_id),
        "provider": "curseforge",
        "name": item.get("name").and_then(|v| v.as_str()).unwrap_or("CurseForge pack"),
        "description": item.get("summary").and_then(|v| v.as_str()).unwrap_or("CurseForge modpack"),
        "mcVersion": idx.get("gameVersion").and_then(|v| v.as_str()).unwrap_or("unknown"),
        "loader": loader,
        "iconUrl": item.get("logo").and_then(|v| v.get("url")).and_then(|v| v.as_str()),
        "tags": ["curseforge"]
      })
    })
    .collect::<Vec<_>>();

  Ok(json!({ "hits": hits }))
}

#[command]
pub async fn pack_archive_import(app: tauri::AppHandle, payload: Value) -> AppResult<Value> {
  let picked = FileDialog::new()
    .set_title("Import Pack Archive")
    .add_filter("Pack archives", &["zip", "mrpack"])
    .pick_file();
  let Some(zip_path) = picked else {
    return Ok(json!({ "ok": false, "canceled": true }));
  };

  let mut archive = ZipArchive::new(fs::File::open(&zip_path).map_err(into_error)?).map_err(into_error)?;
  let mut names = Vec::new();
  for i in 0..archive.len() {
    let entry = archive.by_index(i).map_err(into_error)?;
    names.push(entry.name().replace('\\', "/"));
  }

  let has_modrinth = names.iter().any(|n| n == "modrinth.index.json");
  let has_curseforge = names.iter().any(|n| n == "manifest.json");
  let detected_format = if has_modrinth {
    "modrinth"
  } else if has_curseforge {
    "curseforge"
  } else {
    "generic"
  };

  let defaults = payload.get("defaults").cloned().unwrap_or_else(|| json!({}));
  let mut mc_version = defaults
    .get("mcVersion")
    .and_then(|v| v.as_str())
    .map(str::to_string)
    .unwrap_or_else(|| "1.21.1".to_string());
  let mut loader = "vanilla".to_string();
  let mut notes: Vec<String> = Vec::new();

  if detected_format == "modrinth" {
    if let Ok(mut idx) = archive.by_name("modrinth.index.json") {
      let mut raw = String::new();
      idx.read_to_string(&mut raw).map_err(into_error)?;
      if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
        if let Some(v) = parsed.get("versionId").and_then(|x| x.as_str()) {
          mc_version = v.to_string();
        }
      }
      notes.push("Modrinth archive imported. Downloadable dependency entries may require resolver step.".to_string());
    }
  } else if detected_format == "curseforge" {
    if let Ok(mut mf) = archive.by_name("manifest.json") {
      let mut raw = String::new();
      mf.read_to_string(&mut raw).map_err(into_error)?;
      if let Ok(manifest) = serde_json::from_str::<Value>(&raw) {
        if let Some(v) = manifest
          .get("minecraft")
          .and_then(|x| x.get("version"))
          .and_then(|x| x.as_str())
        {
          mc_version = v.to_string();
        }
        loader = detect_loader_from_curseforge_manifest(&manifest);
      }
      notes.push("CurseForge manifest imported. Some mod files may require provider API resolution.".to_string());
    }
  } else {
    notes.push("Generic archive imported without provider metadata.".to_string());
  }

  let db = read_db(&app)?;
  let desired_name = defaults
    .get("name")
    .and_then(|v| v.as_str())
    .filter(|v| !v.trim().is_empty())
    .map(str::to_string)
    .or_else(|| zip_path.file_stem().and_then(|v| v.to_str()).map(str::to_string))
    .unwrap_or_else(|| "Imported Pack".to_string());
  let unique_name = unique_instance_name(&db, &desired_name);
  let new_id = format!("pack-{}", now_ms());
  let account_id = defaults.get("accountId").cloned().unwrap_or(Value::Null);
  let memory_mb = defaults.get("memoryMb").and_then(|v| v.as_u64()).unwrap_or(6144);

  let mut cfg = json!({
    "id": new_id,
    "name": unique_name,
    "accountId": account_id,
    "mcVersion": mc_version,
    "loader": loader,
    "memoryMb": memory_mb,
    "instancePreset": "none",
    "jvmArgsOverride": Value::Null,
    "syncEnabled": true
  });
  if cfg.get("loader").and_then(|v| v.as_str()) != Some("vanilla") {
    let loader_s = cfg.get("loader").and_then(|v| v.as_str()).unwrap_or("vanilla").to_string();
    let mc_s = cfg.get("mcVersion").and_then(|v| v.as_str()).unwrap_or("1.21.1").to_string();
    let resolved = loader_pick_version(loader_s.clone(), mc_s).await?;
    match loader_s.as_str() {
      "fabric" => cfg["fabricLoaderVersion"] = json!(resolved),
      "quilt" => cfg["quiltLoaderVersion"] = json!(resolved),
      "forge" => cfg["forgeVersion"] = json!(resolved),
      "neoforge" => cfg["neoforgeVersion"] = json!(resolved),
      _ => {}
    }
  }
  let created = instances_create(app.clone(), cfg)?;

  let out_root = instance_dir(&app, &new_id)?;
  for i in 0..archive.len() {
    let mut entry = archive.by_index(i).map_err(into_error)?;
    if !entry.is_file() {
      continue;
    }
    let entry_name = entry.name().replace('\\', "/");
    let rel_opt = if entry_name.starts_with("overrides/") {
      Some(entry_name["overrides/".len()..].to_string())
    } else if entry_name.starts_with("client-overrides/") {
      Some(entry_name["client-overrides/".len()..].to_string())
    } else if detected_format == "generic" {
      Some(entry_name.clone())
    } else {
      None
    };
    let Some(rel) = rel_opt else {
      continue;
    };
    if rel.trim().is_empty() || !is_safe_relative_archive_path(&rel) {
      continue;
    }
    let out = out_root.join(rel);
    if let Some(parent) = out.parent() {
      fs::create_dir_all(parent).map_err(into_error)?;
    }
    let mut writer = fs::File::create(out).map_err(into_error)?;
    std::io::copy(&mut entry, &mut writer).map_err(into_error)?;
  }

  Ok(json!({
    "ok": true,
    "canceled": false,
    "result": {
      "instance": created,
      "detectedFormat": detected_format,
      "notes": notes
    }
  }))
}

fn loader_from_modrinth(version: &ModrinthVersion) -> String {
  let lower: Vec<String> = version.loaders.iter().map(|v| v.to_ascii_lowercase()).collect();
  if lower.iter().any(|v| v == "fabric") {
    return "fabric".to_string();
  }
  if lower.iter().any(|v| v == "quilt") {
    return "quilt".to_string();
  }
  if lower.iter().any(|v| v == "neoforge") {
    return "neoforge".to_string();
  }
  if lower.iter().any(|v| v == "forge") {
    return "forge".to_string();
  }
  "vanilla".to_string()
}

fn runtime_data_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app.path().app_data_dir().map_err(into_error)?.join("data"))
}

fn versions_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(runtime_data_root(app)?.join("versions"))
}

fn libraries_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(runtime_data_root(app)?.join("libraries"))
}

fn sanitize_project_token(input: &str) -> String {
  let out = input
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c.to_ascii_lowercase()
      } else {
        '_'
      }
    })
    .collect::<String>();
  if out.trim_matches('_').is_empty() {
    "project".to_string()
  } else {
    out
  }
}

fn modrinth_mod_prefix(project_id: &str) -> String {
  format!("mr_{}__", sanitize_project_token(project_id))
}

fn safe_modrinth_file_name(project_id: &str, upstream_file_name: &str) -> String {
  let upstream = upstream_file_name
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
    .collect::<String>();
  format!("{}{}", modrinth_mod_prefix(project_id), upstream)
}

fn modrinth_content_kind_label(kind: &str) -> AppResult<&'static str> {
  match kind.trim().to_ascii_lowercase().as_str() {
    "resourcepack" => Ok("resourcepack"),
    "shaderpack" => Ok("shaderpack"),
    _ => Err("modrinthContent: kind must be resourcepack or shaderpack".to_string()),
  }
}

fn modrinth_content_dir(app: &tauri::AppHandle, instance_id: &str, kind: &str) -> AppResult<PathBuf> {
  let folder = if kind == "shaderpack" { "shaderpacks" } else { "resourcepacks" };
  let dir = instance_dir(app, instance_id)?.join(folder);
  fs::create_dir_all(&dir).map_err(into_error)?;
  Ok(dir)
}

fn modrinth_content_prefix(kind: &str, project_id: &str) -> String {
  let token = sanitize_project_token(project_id);
  if kind == "shaderpack" {
    format!("mrs_{}__", token)
  } else {
    format!("mrp_{}__", token)
  }
}

fn safe_modrinth_content_file_name(kind: &str, project_id: &str, upstream_file_name: &str) -> String {
  let upstream = upstream_file_name
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
    .collect::<String>();
  format!("{}{}", modrinth_content_prefix(kind, project_id), upstream)
}

fn installed_modrinth_content_project_ids(content_dir: &Path, kind: &str) -> HashSet<String> {
  let mut out = HashSet::<String>::new();
  if !content_dir.exists() {
    return out;
  }
  let prefix = if kind == "shaderpack" { "mrs_" } else { "mrp_" };
  let Ok(entries) = fs::read_dir(content_dir) else {
    return out;
  };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    if !name.starts_with(prefix) {
      continue;
    }
    if !(name.ends_with(".zip") || name.ends_with(".zip.disabled")) {
      continue;
    }
    if let Some(pos) = name.find("__") {
      let token = &name[prefix.len()..pos];
      if !token.trim().is_empty() {
        out.insert(token.to_string());
      }
    }
  }
  out
}

fn installed_modrinth_project_ids(mods_dir: &Path) -> HashSet<String> {
  let mut out = HashSet::<String>::new();
  if !mods_dir.exists() {
    return out;
  }
  let Ok(entries) = fs::read_dir(mods_dir) else {
    return out;
  };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    if !name.starts_with("mr_") {
      continue;
    }
    if !(name.ends_with(".jar") || name.ends_with(".jar.disabled")) {
      continue;
    }
    if let Some(pos) = name.find("__") {
      let token = &name["mr_".len()..pos];
      if !token.trim().is_empty() {
        out.insert(token.to_string());
      }
    }
  }
  out
}

#[command]
pub async fn modrinth_mods_search(
  app: tauri::AppHandle,
  instance_id: String,
  query: String,
  mc_version: Option<String>,
  loader: Option<String>,
  limit: Option<u32>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mc = mc_version
    .and_then(|v| if v.trim().is_empty() { None } else { Some(v.trim().to_string()) })
    .unwrap_or_else(|| inst.get("mcVersion").and_then(|v| v.as_str()).unwrap_or("1.21.1").to_string());
  let loader_hint = loader
    .and_then(|v| if v.trim().is_empty() { None } else { Some(v.trim().to_ascii_lowercase()) })
    .unwrap_or_else(|| inst.get("loader").and_then(|v| v.as_str()).unwrap_or("fabric").to_ascii_lowercase());
  let q = query.trim().to_string();
  let capped = limit.unwrap_or(20).clamp(1, 40);
  let index = if q.is_empty() { "downloads" } else { "relevance" };

  let mut facet_groups = vec![vec!["project_type:mod".to_string()]];
  if !mc.trim().is_empty() {
    facet_groups.push(vec![format!("versions:{mc}")]);
  }
  if loader_hint != "vanilla" {
    facet_groups.push(vec![format!("categories:{loader_hint}")]);
  }
  let facets = serde_json::to_string(&facet_groups).map_err(into_error)?;

  let url = format!(
    "https://api.modrinth.com/v2/search?query={}&limit={}&index={}&facets={}",
    urlencoding::encode(&q),
    capped,
    index,
    urlencoding::encode(&facets)
  );
  let data: Value = reqwest::Client::new()
    .get(url)
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  let mods_dir = instance_dir(&app, &safe_id)?.join("mods");
  let installed = installed_modrinth_project_ids(&mods_dir);

  let hits_in = data.get("hits").and_then(|v| v.as_array()).cloned().unwrap_or_default();
  let mut hits = Vec::<Value>::with_capacity(hits_in.len());
  for h in hits_in {
    let project_id = h.get("project_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let token = sanitize_project_token(&project_id);
    hits.push(json!({
      "projectId": project_id,
      "title": h.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown Mod"),
      "description": h.get("description").and_then(|v| v.as_str()).unwrap_or(""),
      "iconUrl": h.get("icon_url").and_then(|v| v.as_str()),
      "author": h.get("author").and_then(|v| v.as_str()).unwrap_or("unknown"),
      "downloads": h.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
      "follows": h.get("follows").and_then(|v| v.as_u64()).unwrap_or(0),
      "dateModified": h.get("date_modified").and_then(|v| v.as_str()),
      "latestVersionId": h.get("latest_version").and_then(|v| v.as_str()),
      "installed": installed.contains(&token)
    }));
  }

  Ok(json!({ "hits": hits }))
}

#[command]
pub async fn modrinth_mods_install(
  app: tauri::AppHandle,
  instance_id: String,
  project_id: String,
  version_id: Option<String>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mc = inst
    .get("mcVersion")
    .and_then(|v| v.as_str())
    .unwrap_or("1.21.1")
    .to_string();
  let loader = inst
    .get("loader")
    .and_then(|v| v.as_str())
    .unwrap_or("fabric")
    .to_ascii_lowercase();

  let pid = project_id.trim();
  if pid.is_empty() {
    return Err("modrinthModsInstall: projectId missing".to_string());
  }

  let client = reqwest::Client::new();
  let version: Value = if let Some(v_id) = version_id {
    client
      .get(format!("https://api.modrinth.com/v2/version/{}", urlencoding::encode(v_id.trim())))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?
  } else {
    let versions: Vec<Value> = client
      .get(format!(
        "https://api.modrinth.com/v2/project/{}/version",
        urlencoding::encode(pid)
      ))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?;
    let mut picked: Option<Value> = None;
    for v in versions {
      let game_versions = v.get("game_versions").and_then(|x| x.as_array()).cloned().unwrap_or_default();
      let has_mc = game_versions.iter().any(|x| x.as_str() == Some(mc.as_str()));
      if !has_mc {
        continue;
      }
      if loader != "vanilla" {
        let loaders = v.get("loaders").and_then(|x| x.as_array()).cloned().unwrap_or_default();
        if !loaders.iter().any(|x| x.as_str() == Some(loader.as_str())) {
          continue;
        }
      }
      let files = v.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
      if files.is_empty() {
        continue;
      }
      picked = Some(v);
      break;
    }
    picked.ok_or_else(|| format!("No compatible Modrinth version found for {mc} ({loader})"))?
  };

  let files = version.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
  if files.is_empty() {
    return Err("modrinthModsInstall: no downloadable files".to_string());
  }
  let picked = files
    .iter()
    .find(|f| f.get("primary").and_then(|x| x.as_bool()) == Some(true))
    .cloned()
    .unwrap_or_else(|| files[0].clone());
  let file_url = picked.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
  if file_url.trim().is_empty() {
    return Err("modrinthModsInstall: file url missing".to_string());
  }
  let upstream = picked
    .get("filename")
    .and_then(|x| x.as_str())
    .unwrap_or("mod.jar")
    .to_string();

  let bytes = client
    .get(file_url.clone())
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .bytes()
    .await
    .map_err(into_error)?;

  let mods_dir = instance_dir(&app, &safe_id)?.join("mods");
  fs::create_dir_all(&mods_dir).map_err(into_error)?;
  let prefix = modrinth_mod_prefix(pid);
  for entry in fs::read_dir(&mods_dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with(&prefix) && (name.ends_with(".jar") || name.ends_with(".jar.disabled")) {
      let _ = fs::remove_file(entry.path());
    }
  }
  let placed_name = safe_modrinth_file_name(pid, &upstream);
  let placed_path = mods_dir.join(&placed_name);
  fs::write(&placed_path, &bytes).map_err(into_error)?;

  let mut cache = read_content_metadata(&app, &safe_id).unwrap_or_else(|_| json!({}));
  let project_meta: Option<Value> = match client
    .get(format!("https://api.modrinth.com/v2/project/{}", urlencoding::encode(pid)))
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
  {
    Ok(resp) => match resp.error_for_status() {
      Ok(ok) => ok.json::<Value>().await.ok(),
      Err(_) => None,
    },
    Err(_) => None,
  };
  let fallback_title = local_mod_query_from_file_name(&placed_name);
  content_metadata_put(
    &mut cache,
    "mods",
    &placed_name,
    json!({
      "title": project_meta
        .as_ref()
        .and_then(|v| v.get("title"))
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(if fallback_title.trim().is_empty() { "Installed Mod" } else { fallback_title.as_str() }),
      "description": project_meta
        .as_ref()
        .and_then(|v| v.get("description"))
        .and_then(|v| v.as_str())
        .unwrap_or(""),
      "iconUrl": project_meta
        .as_ref()
        .and_then(|v| v.get("icon_url"))
        .and_then(|v| v.as_str()),
      "author": "unknown",
      "source": "modrinth",
      "projectId": pid
    }),
  );
  let _ = write_content_metadata(&app, &safe_id, &cache);

  Ok(json!({
    "ok": true,
    "projectId": pid,
    "versionId": version.get("id").and_then(|x| x.as_str()).unwrap_or(""),
    "versionName": version.get("version_number").and_then(|x| x.as_str()).unwrap_or(""),
    "fileName": placed_name
  }))
}

#[command]
pub async fn modrinth_content_search(
  app: tauri::AppHandle,
  instance_id: String,
  kind: String,
  query: String,
  mc_version: Option<String>,
  limit: Option<u32>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let kind_label = modrinth_content_kind_label(&kind)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mc = mc_version
    .and_then(|v| if v.trim().is_empty() { None } else { Some(v.trim().to_string()) })
    .unwrap_or_else(|| inst.get("mcVersion").and_then(|v| v.as_str()).unwrap_or("1.21.1").to_string());
  let q = query.trim().to_string();
  let capped = limit.unwrap_or(20).clamp(1, 40);
  let index = if q.is_empty() { "downloads" } else { "relevance" };

  let facets = serde_json::to_string(&vec![
    vec![format!("project_type:{kind_label}")],
    vec![format!("versions:{mc}")],
  ])
  .map_err(into_error)?;
  let url = format!(
    "https://api.modrinth.com/v2/search?query={}&limit={}&index={}&facets={}",
    urlencoding::encode(&q),
    capped,
    index,
    urlencoding::encode(&facets)
  );
  let data: Value = reqwest::Client::new()
    .get(url)
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  let dir = modrinth_content_dir(&app, &safe_id, kind_label)?;
  let installed = installed_modrinth_content_project_ids(&dir, kind_label);
  let hits_in = data.get("hits").and_then(|v| v.as_array()).cloned().unwrap_or_default();
  let mut hits = Vec::<Value>::with_capacity(hits_in.len());
  for h in hits_in {
    let project_id = h.get("project_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let token = sanitize_project_token(&project_id);
    hits.push(json!({
      "projectId": project_id,
      "kind": kind_label,
      "title": h.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown Pack"),
      "description": h.get("description").and_then(|v| v.as_str()).unwrap_or(""),
      "iconUrl": h.get("icon_url").and_then(|v| v.as_str()),
      "author": h.get("author").and_then(|v| v.as_str()).unwrap_or("unknown"),
      "downloads": h.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
      "follows": h.get("follows").and_then(|v| v.as_u64()).unwrap_or(0),
      "dateModified": h.get("date_modified").and_then(|v| v.as_str()),
      "latestVersionId": h.get("latest_version").and_then(|v| v.as_str()),
      "installed": installed.contains(&token)
    }));
  }

  Ok(json!({ "hits": hits }))
}

#[command]
pub async fn modrinth_content_install(
  app: tauri::AppHandle,
  instance_id: String,
  kind: String,
  project_id: String,
  version_id: Option<String>,
) -> AppResult<Value> {
  let safe_id = validate_id(&instance_id)?;
  let kind_label = modrinth_content_kind_label(&kind)?;
  let db = read_db(&app)?;
  let inst = instance_entry(&db, &safe_id).ok_or_else(|| "Instance not found".to_string())?;
  let mc = inst
    .get("mcVersion")
    .and_then(|v| v.as_str())
    .unwrap_or("1.21.1")
    .to_string();
  let pid = project_id.trim();
  if pid.is_empty() {
    return Err("modrinthContentInstall: projectId missing".to_string());
  }

  let client = reqwest::Client::new();
  let version: Value = if let Some(v_id) = version_id {
    client
      .get(format!("https://api.modrinth.com/v2/version/{}", urlencoding::encode(v_id.trim())))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?
  } else {
    let versions: Vec<Value> = client
      .get(format!(
        "https://api.modrinth.com/v2/project/{}/version",
        urlencoding::encode(pid)
      ))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?;
    let mut picked: Option<Value> = None;
    for v in versions {
      let game_versions = v.get("game_versions").and_then(|x| x.as_array()).cloned().unwrap_or_default();
      let has_mc = game_versions.iter().any(|x| x.as_str() == Some(mc.as_str()));
      if !has_mc {
        continue;
      }
      let files = v.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
      if files.is_empty() {
        continue;
      }
      picked = Some(v);
      break;
    }
    picked.ok_or_else(|| format!("No compatible Modrinth {kind_label} version found for {mc}"))?
  };

  let files = version.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
  if files.is_empty() {
    return Err("modrinthContentInstall: no downloadable files".to_string());
  }
  let picked = files
    .iter()
    .find(|f| f.get("primary").and_then(|x| x.as_bool()) == Some(true))
    .cloned()
    .unwrap_or_else(|| files[0].clone());
  let file_url = picked.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
  if file_url.trim().is_empty() {
    return Err("modrinthContentInstall: file url missing".to_string());
  }
  let upstream = picked
    .get("filename")
    .and_then(|x| x.as_str())
    .unwrap_or("content.zip")
    .to_string();

  let bytes = client
    .get(file_url.clone())
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .bytes()
    .await
    .map_err(into_error)?;

  let dir = modrinth_content_dir(&app, &safe_id, kind_label)?;
  let prefix = modrinth_content_prefix(kind_label, pid);
  for entry in fs::read_dir(&dir).map_err(into_error)? {
    let entry = entry.map_err(into_error)?;
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with(&prefix) && (name.ends_with(".zip") || name.ends_with(".zip.disabled")) {
      let _ = fs::remove_file(entry.path());
    }
  }
  let placed_name = safe_modrinth_content_file_name(kind_label, pid, &upstream);
  let placed_path = dir.join(&placed_name);
  fs::write(&placed_path, &bytes).map_err(into_error)?;

  let mut cache = read_content_metadata(&app, &safe_id).unwrap_or_else(|_| json!({}));
  let project_meta: Option<Value> = match client
    .get(format!("https://api.modrinth.com/v2/project/{}", urlencoding::encode(pid)))
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
  {
    Ok(resp) => match resp.error_for_status() {
      Ok(ok) => ok.json::<Value>().await.ok(),
      Err(_) => None,
    },
    Err(_) => None,
  };
  let cache_kind = if kind_label == "shaderpack" { "shaderpacks" } else { "resourcepacks" };
  let fallback_title = local_pack_query_from_file_name(cache_kind, &placed_name);
  content_metadata_put(
    &mut cache,
    cache_kind,
    &placed_name,
    json!({
      "title": project_meta
        .as_ref()
        .and_then(|v| v.get("title"))
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(if fallback_title.trim().is_empty() { "Installed Pack" } else { fallback_title.as_str() }),
      "description": project_meta
        .as_ref()
        .and_then(|v| v.get("description"))
        .and_then(|v| v.as_str())
        .unwrap_or(""),
      "iconUrl": project_meta
        .as_ref()
        .and_then(|v| v.get("icon_url"))
        .and_then(|v| v.as_str()),
      "author": "unknown",
      "source": "modrinth",
      "projectId": pid
    }),
  );
  let _ = write_content_metadata(&app, &safe_id, &cache);

  Ok(json!({
    "ok": true,
    "kind": kind_label,
    "projectId": pid,
    "versionId": version.get("id").and_then(|x| x.as_str()).unwrap_or(""),
    "versionName": version.get("version_number").and_then(|x| x.as_str()).unwrap_or(""),
    "fileName": placed_name
  }))
}

#[command]
pub async fn vanilla_install(app: tauri::AppHandle, mc_version: String) -> AppResult<bool> {
  let mc = mc_version.trim();
  if mc.is_empty() {
    return Err("vanilla:install: mcVersion missing".to_string());
  }

  let manifest: MojangVersionManifest = reqwest::Client::new()
    .get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  let entry = manifest
    .versions
    .into_iter()
    .find(|v| v.id == mc)
    .ok_or_else(|| format!("Unknown Minecraft version: {mc}"))?;

  let version_json: Value = reqwest::Client::new()
    .get(entry.url)
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  let vdir = versions_root(&app)?.join(mc);
  fs::create_dir_all(&vdir).map_err(into_error)?;
  let json_path = vdir.join(format!("{mc}.json"));
  fs::write(
    &json_path,
    serde_json::to_string_pretty(&version_json).map_err(into_error)?,
  )
  .map_err(into_error)?;

  if let Some(client_url) = version_json
    .get("downloads")
    .and_then(|v| v.get("client"))
    .and_then(|v| v.get("url"))
    .and_then(|v| v.as_str())
  {
    let jar_path = vdir.join(format!("{mc}.jar"));
    if !jar_path.exists() || fs::metadata(&jar_path).map_err(into_error)?.len() == 0 {
      let bytes = reqwest::Client::new()
        .get(client_url)
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .bytes()
        .await
        .map_err(into_error)?;
      fs::write(jar_path, bytes).map_err(into_error)?;
    }
  }

  Ok(true)
}

#[command]
pub async fn fabric_pick_loader(mc_version: String) -> AppResult<String> {
  let resolved = loader_pick_version("fabric".to_string(), mc_version)
    .await?
    .ok_or_else(|| "fabric:pickLoader: could not resolve loader".to_string())?;
  Ok(resolved)
}

#[command]
pub async fn fabric_install(
  app: tauri::AppHandle,
  instance_id: String,
  mc_version: String,
  loader_version: String,
) -> AppResult<Value> {
  let mc = mc_version.trim().to_string();
  let lv = loader_version.trim().to_string();
  if mc.is_empty() {
    return Err("fabric:install: mcVersion missing".to_string());
  }
  if lv.is_empty() {
    return Err("fabric:install: loaderVersion missing".to_string());
  }
  let _safe_id = validate_id(&instance_id)?;

  let _ = vanilla_install(app.clone(), mc.clone()).await?;
  let profile: Value = reqwest::Client::new()
    .get(format!(
      "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
      urlencoding::encode(&mc),
      urlencoding::encode(&lv)
    ))
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .json()
    .await
    .map_err(into_error)?;

  let fabric_id = format!("fabric-loader-{lv}-{mc}");
  let vdir = versions_root(&app)?.join(&fabric_id);
  fs::create_dir_all(&vdir).map_err(into_error)?;
  let out_json = vdir.join(format!("{fabric_id}.json"));
  let mut final_profile = profile.clone();
  final_profile["id"] = json!(fabric_id.clone());
  final_profile["inheritsFrom"] = json!(mc.clone());
  final_profile["jar"] = json!(mc.clone());
  final_profile["type"] = json!("release");
  fs::write(
    &out_json,
    serde_json::to_string_pretty(&final_profile).map_err(into_error)?,
  )
  .map_err(into_error)?;

  let vanilla_jar = versions_root(&app)?.join(&mc).join(format!("{mc}.jar"));
  let out_jar = vdir.join(format!("{fabric_id}.jar"));
  if vanilla_jar.exists() {
    fs::copy(vanilla_jar, out_jar).map_err(into_error)?;
  }

  // Best-effort library prefetch for artifact entries present in profile JSON.
  if let Some(libs) = final_profile.get("libraries").and_then(|v| v.as_array()) {
    for lib in libs {
      let path = lib
        .get("downloads")
        .and_then(|v| v.get("artifact"))
        .and_then(|v| v.get("path"))
        .and_then(|v| v.as_str());
      let url = lib
        .get("downloads")
        .and_then(|v| v.get("artifact"))
        .and_then(|v| v.get("url"))
        .and_then(|v| v.as_str());
      let (Some(p), Some(u)) = (path, url) else {
        continue;
      };
      let target = libraries_root(&app)?.join(p);
      if target.exists() && fs::metadata(&target).map_err(into_error)?.len() > 0 {
        continue;
      }
      if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(into_error)?;
      }
      let bytes = reqwest::Client::new()
        .get(u)
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .bytes()
        .await
        .map_err(into_error)?;
      fs::write(target, bytes).map_err(into_error)?;
    }
  }

  Ok(json!({ "ok": true }))
}

#[command]
pub async fn provider_packs_install(
  app: tauri::AppHandle,
  provider: String,
  pack_id: String,
  defaults: Option<Value>,
) -> AppResult<Value> {
  let p = provider.trim().to_ascii_lowercase();
  if p != "atlauncher" && p != "ftb" && p != "curseforge" && p != "technic" {
    return Err(format!("providerPacksInstall: unsupported provider {p}"));
  }
  let pid = pack_id.trim();
  if pid.is_empty() {
    return Err("providerPacksInstall: packId missing".to_string());
  }

  let defaults = defaults.unwrap_or_else(|| json!({}));
  let default_name = defaults.get("name").and_then(|v| v.as_str()).map(str::to_string);
  let default_mem = defaults.get("memoryMb").and_then(|v| v.as_u64()).unwrap_or(6144);
  let account_id = defaults.get("accountId").cloned().unwrap_or(Value::Null);

  let db = read_db(&app)?;
  let name = unique_instance_name(
    &db,
    default_name
      .clone()
      .unwrap_or_else(|| format!("{} {}", p.to_ascii_uppercase(), pid))
      .as_str(),
  );
  let id = format!("{}-{}", p, now_ms());

  let mut mc_version = "latest".to_string();
  let mut notes = vec![];

  if p == "technic" {
    // Keep this explicit: no implicit file picker side-effects on "install".
    // Use pack_archive_import from the dedicated archive button flow.
    return Err(
      "providerPacksInstall: direct install is not available for technic in this build. Use 'Import pack archive'."
        .to_string(),
    );
  } else if p == "curseforge" {
    let api_key = curseforge_api_key(&app).ok_or_else(|| {
      "providerPacksInstall: missing CurseForge API key. Set FISHBATTERY_CURSEFORGE_API_KEY or create secrets/curseforge-api-key.txt".to_string()
    })?;
    let numeric_token = {
      let base = pid.strip_prefix("cf-").unwrap_or(pid);
      let digits = base
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();
      if digits.is_empty() { base.to_string() } else { digits }
    };
    let mod_id = numeric_token
      .parse::<u64>()
      .map_err(|_| format!("providerPacksInstall: invalid CurseForge pack id ({pid})"))?;

    let client = reqwest::Client::new();
    let mod_detail: Value = client
      .get(format!("https://api.curseforge.com/v1/mods/{mod_id}"))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .header("x-api-key", &api_key)
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?;
    let mod_data = mod_detail.get("data").cloned().unwrap_or_else(|| json!({}));
    let provider_name = mod_data
      .get("name")
      .and_then(|v| v.as_str())
      .map(str::trim)
      .filter(|v| !v.is_empty())
      .map(str::to_string);
    let provider_icon_url = mod_data
      .get("logo")
      .and_then(|v| v.get("url"))
      .and_then(|v| v.as_str())
      .map(str::to_string);

    let files_resp: Value = client
      .get(format!(
        "https://api.curseforge.com/v1/mods/{mod_id}/files?pageSize=50&index=0"
      ))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .header("x-api-key", &api_key)
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?;
    let files = files_resp
      .get("data")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();
    if files.is_empty() {
      return Err("providerPacksInstall: no installable CurseForge files found".to_string());
    }

    let selected = files
      .iter()
      .find(|f| f.get("isAvailable").and_then(|x| x.as_bool()).unwrap_or(true))
      .cloned()
      .unwrap_or_else(|| files[0].clone());
    let file_id = selected
      .get("id")
      .and_then(|v| v.as_u64())
      .ok_or_else(|| "providerPacksInstall: invalid CurseForge file id".to_string())?;
    let file_name = selected
      .get("fileName")
      .and_then(|v| v.as_str())
      .unwrap_or("curseforge-pack.zip")
      .to_string();
    let game_versions = selected
      .get("gameVersions")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|x| x.as_str().map(str::to_string))
          .collect::<Vec<_>>()
      })
      .unwrap_or_default();

    if let Some(v) = detect_mc_from_curseforge_versions(&game_versions) {
      mc_version = v;
    } else if let Some(v) = mod_data
      .get("latestFilesIndexes")
      .and_then(|v| v.as_array())
      .and_then(|arr| arr.first())
      .and_then(|x| x.get("gameVersion"))
      .and_then(|x| x.as_str())
    {
      mc_version = v.to_string();
    }
    let loader_kind = detect_loader_from_curseforge_versions(&game_versions);

    let download_url = if let Some(url) = selected.get("downloadUrl").and_then(|v| v.as_str()) {
      url.to_string()
    } else {
      let url_resp: Value = client
        .get(format!(
          "https://api.curseforge.com/v1/mods/{mod_id}/files/{file_id}/download-url"
        ))
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .header("x-api-key", &api_key)
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .json()
        .await
        .map_err(into_error)?;
      url_resp
        .get("data")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "providerPacksInstall: missing CurseForge download URL".to_string())?
        .to_string()
    };

    let cf_base_name = default_name
      .clone()
      .filter(|v| !v.trim().is_empty())
      .or(provider_name)
      .unwrap_or_else(|| format!("CurseForge {mod_id}"));
    let cf_name = unique_instance_name(&db, &cf_base_name);

    let mut cfg = json!({
      "id": id,
      "name": cf_name,
      "accountId": account_id,
      "mcVersion": mc_version,
      "loader": loader_kind,
      "memoryMb": default_mem,
      "instancePreset": "none",
      "jvmArgsOverride": Value::Null,
      "syncEnabled": true
    });
    if loader_kind != "vanilla" {
      let resolved = loader_pick_version(loader_kind.clone(), mc_version.clone()).await?;
      match loader_kind.as_str() {
        "fabric" => cfg["fabricLoaderVersion"] = json!(resolved),
        "quilt" => cfg["quiltLoaderVersion"] = json!(resolved),
        "forge" => cfg["forgeVersion"] = json!(resolved),
        "neoforge" => cfg["neoforgeVersion"] = json!(resolved),
        _ => {}
      }
    }

    let mut created = instances_create(app.clone(), cfg.clone())?;
    let created_id = created
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "providerPacksInstall: missing created instance id".to_string())?
      .to_string();
    let mut created_loader = created
      .get("loader")
      .and_then(|v| v.as_str())
      .unwrap_or("vanilla")
      .to_string();
    let mut created_mc = created
      .get("mcVersion")
      .and_then(|v| v.as_str())
      .unwrap_or("latest")
      .to_string();

    let pack_bytes = client
      .get(download_url)
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .bytes()
      .await
      .map_err(into_error)?;
    let mut archive = ZipArchive::new(std::io::Cursor::new(pack_bytes.to_vec())).map_err(into_error)?;
    let out_root = instance_dir(&app, &created_id)?;
    let mut installed_manifest_mods = 0usize;
    let mut content_meta = read_content_metadata(&app, &created_id).unwrap_or_else(|_| json!({}));
    let mut content_meta_dirty = false;

    let mut manifest: Option<Value> = None;
    if let Ok(mut mf) = archive.by_name("manifest.json") {
      let mut raw = String::new();
      mf.read_to_string(&mut raw).map_err(into_error)?;
      if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
        manifest = Some(parsed);
      }
    }

    if let Some(mf) = manifest.as_ref() {
      let mut effective_loader = created_loader.clone();
      let mut effective_mc = created_mc.clone();
      if let Some(v) = mf
        .get("minecraft")
        .and_then(|x| x.get("version"))
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
      {
        effective_mc = v.to_string();
      }
      let manifest_loader = detect_loader_from_curseforge_manifest(mf);
      if manifest_loader != "vanilla" || effective_loader == "vanilla" {
        effective_loader = manifest_loader;
      }

      if effective_loader != created_loader || effective_mc != created_mc {
        let mut patch = json!({
          "mcVersion": effective_mc,
          "loader": effective_loader,
          "fabricLoaderVersion": Value::Null,
          "quiltLoaderVersion": Value::Null,
          "forgeVersion": Value::Null,
          "neoforgeVersion": Value::Null,
        });
        if effective_loader != "vanilla" {
          let resolved = loader_pick_version(effective_loader.clone(), effective_mc.clone()).await?;
          match effective_loader.as_str() {
            "fabric" => patch["fabricLoaderVersion"] = json!(resolved),
            "quilt" => patch["quiltLoaderVersion"] = json!(resolved),
            "forge" => patch["forgeVersion"] = json!(resolved),
            "neoforge" => patch["neoforgeVersion"] = json!(resolved),
            _ => {}
          }
        }
        created = instances_update(app.clone(), created_id.clone(), patch)?;
        created_loader = created
          .get("loader")
          .and_then(|v| v.as_str())
          .unwrap_or("vanilla")
          .to_string();
        created_mc = created
          .get("mcVersion")
          .and_then(|v| v.as_str())
          .unwrap_or("latest")
          .to_string();
        notes.push(format!(
          "Using CurseForge manifest runtime: {} {}.",
          created_loader, created_mc
        ));
      }
    }

    let _ = loader_install(
      app.clone(),
      created_id.clone(),
      created_mc.clone(),
      created_loader.clone(),
      if created_loader == "fabric" {
        created.get("fabricLoaderVersion").and_then(|v| v.as_str()).map(str::to_string)
      } else if created_loader == "quilt" {
        created.get("quiltLoaderVersion").and_then(|v| v.as_str()).map(str::to_string)
      } else if created_loader == "forge" {
        created.get("forgeVersion").and_then(|v| v.as_str()).map(str::to_string)
      } else if created_loader == "neoforge" {
        created.get("neoforgeVersion").and_then(|v| v.as_str()).map(str::to_string)
      } else {
        None
      },
    )
    .await?;

    for i in 0..archive.len() {
      let mut entry = archive.by_index(i).map_err(into_error)?;
      if !entry.is_file() {
        continue;
      }
      let entry_name = entry.name().replace('\\', "/");
      let rel_opt = if entry_name.starts_with("overrides/") {
        Some(entry_name["overrides/".len()..].to_string())
      } else if entry_name.starts_with("client-overrides/") {
        Some(entry_name["client-overrides/".len()..].to_string())
      } else {
        None
      };
      let Some(rel) = rel_opt else {
        continue;
      };
      if rel.trim().is_empty() || !is_safe_relative_archive_path(&rel) {
        continue;
      }
      let out = out_root.join(rel);
      if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(into_error)?;
      }
      let mut writer = fs::File::create(out).map_err(into_error)?;
      std::io::copy(&mut entry, &mut writer).map_err(into_error)?;
    }

    if let Some(icon_url) = provider_icon_url {
      let _ = instances_set_icon_from_url(app.clone(), created_id.clone(), icon_url).await;
    } else if let Some(label) = created.get("name").and_then(|v| v.as_str()) {
      let _ = instances_set_icon_fallback(
        app.clone(),
        created_id.clone(),
        label.to_string(),
        Some("blue".to_string()),
      );
    }

    if let Some(mf) = manifest {
      if let Some(files) = mf.get("files").and_then(|v| v.as_array()) {
        let mods_dir = out_root.join("mods");
        fs::create_dir_all(&mods_dir).map_err(into_error)?;
        for item in files {
          let required = item.get("required").and_then(|x| x.as_bool()).unwrap_or(true);
          if !required {
            continue;
          }
          let dep_mod_id = match item.get("projectID").and_then(|x| x.as_u64()) {
            Some(v) => v,
            None => continue,
          };
          let dep_file_id = match item.get("fileID").and_then(|x| x.as_u64()) {
            Some(v) => v,
            None => continue,
          };
          let file_detail: Value = match client
            .get(format!(
              "https://api.curseforge.com/v1/mods/{dep_mod_id}/files/{dep_file_id}"
            ))
            .header("user-agent", "FishbatteryLauncher/0.2.1")
            .header("x-api-key", &api_key)
            .send()
            .await
          {
            Ok(resp) => match resp.error_for_status() {
              Ok(ok) => ok.json().await.map_err(into_error)?,
              Err(_) => continue,
            },
            Err(_) => continue,
          };
          let dep_data = file_detail.get("data").cloned().unwrap_or_else(|| json!({}));
          let dep_name = dep_data
            .get("fileName")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("cf-{dep_mod_id}-{dep_file_id}.jar"));
          let dep_url = if let Some(url) = dep_data.get("downloadUrl").and_then(|v| v.as_str()) {
            url.to_string()
          } else {
            let url_resp: Value = match client
              .get(format!(
                "https://api.curseforge.com/v1/mods/{dep_mod_id}/files/{dep_file_id}/download-url"
              ))
              .header("user-agent", "FishbatteryLauncher/0.2.1")
              .header("x-api-key", &api_key)
              .send()
              .await
            {
              Ok(resp) => match resp.error_for_status() {
                Ok(ok) => ok.json().await.map_err(into_error)?,
                Err(_) => continue,
              },
              Err(_) => continue,
            };
            match url_resp.get("data").and_then(|v| v.as_str()) {
              Some(v) => v.to_string(),
              None => continue,
            }
          };
          let dep_bytes = match client
            .get(dep_url)
            .header("user-agent", "FishbatteryLauncher/0.2.1")
            .send()
            .await
          {
            Ok(resp) => match resp.error_for_status() {
              Ok(ok) => ok.bytes().await.map_err(into_error)?,
              Err(_) => continue,
            },
            Err(_) => continue,
          };
          fs::write(mods_dir.join(&dep_name), &dep_bytes).map_err(into_error)?;
          let fallback_title = local_mod_query_from_file_name(&dep_name);
          content_metadata_put(
            &mut content_meta,
            "mods",
            &dep_name,
            json!({
              "title": dep_data
                .get("displayName")
                .and_then(|v| v.as_str())
                .filter(|v| !v.trim().is_empty())
                .unwrap_or(if fallback_title.trim().is_empty() { "Installed Mod" } else { fallback_title.as_str() }),
              "description": dep_data.get("fileName").and_then(|v| v.as_str()).unwrap_or("Installed from CurseForge pack"),
              "iconUrl": Value::Null,
              "author": "unknown",
              "source": "curseforge",
              "projectId": dep_mod_id.to_string()
            }),
          );
          content_meta_dirty = true;
          installed_manifest_mods += 1;
        }
      }
    }

    if content_meta_dirty {
      let _ = write_content_metadata(&app, &created_id, &content_meta);
    }

    notes.push(format!("Installed CurseForge pack archive: {file_name}"));
    notes.push(format!("Resolved {installed_manifest_mods} required manifest mod files."));
    return Ok(json!({
      "instance": created,
      "notes": notes
    }));
  } else if p == "ftb" {
    let numeric = pid.strip_prefix("ftb-").unwrap_or(pid);
    if let Ok(pack_id_num) = numeric.parse::<u64>() {
      let detail: Value = reqwest::Client::new()
        .get(format!("https://api.modpacks.ch/public/modpack/{pack_id_num}"))
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .json()
        .await
        .map_err(into_error)?;
      let version_id = detail
        .get("versions")
        .and_then(|x| x.as_array())
        .and_then(|arr| arr.first())
        .and_then(|x| x.get("id"))
        .and_then(|x| x.as_u64());
      if let Some(v) = detail
        .get("versions")
        .and_then(|x| x.as_array())
        .and_then(|arr| arr.first())
        .and_then(|x| x.get("targets"))
        .and_then(|x| x.as_array())
      {
        if let Some(game) = v.iter().find(|t| {
          t.get("type").and_then(|x| x.as_str()) == Some("game")
            || t.get("name").and_then(|x| x.as_str()) == Some("minecraft")
        }) {
          if let Some(ver) = game.get("version").and_then(|x| x.as_str()) {
            mc_version = ver.to_string();
          }
        }
      }
      let mut loader_kind = "vanilla".to_string();
      if let Some(v) = detail
        .get("versions")
        .and_then(|x| x.as_array())
        .and_then(|arr| arr.first())
        .and_then(|x| x.get("targets"))
        .and_then(|x| x.as_array())
      {
        if let Some(modloader) = v.iter().find(|t| t.get("type").and_then(|x| x.as_str()) == Some("modloader")) {
          let loader_name = modloader
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("vanilla")
            .to_ascii_lowercase();
          loader_kind = if loader_name.contains("fabric") {
            "fabric".to_string()
          } else if loader_name.contains("quilt") {
            "quilt".to_string()
          } else if loader_name.contains("neoforge") || loader_name.contains("neo") {
            "neoforge".to_string()
          } else if loader_name.contains("forge") {
            "forge".to_string()
          } else {
            "vanilla".to_string()
          };
        }
      }
      let mut cfg = json!({
        "id": id,
        "name": name,
        "accountId": account_id,
        "mcVersion": mc_version,
        "loader": loader_kind,
        "memoryMb": default_mem,
        "instancePreset": "none",
        "jvmArgsOverride": Value::Null,
        "syncEnabled": true
      });
      if loader_kind != "vanilla" {
        let resolved = loader_pick_version(loader_kind.clone(), mc_version.clone()).await?;
        match loader_kind.as_str() {
          "fabric" => cfg["fabricLoaderVersion"] = json!(resolved),
          "quilt" => cfg["quiltLoaderVersion"] = json!(resolved),
          "forge" => cfg["forgeVersion"] = json!(resolved),
          "neoforge" => cfg["neoforgeVersion"] = json!(resolved),
          _ => {}
        }
      }
      let created = instances_create(app.clone(), cfg.clone())?;
      let _ = loader_install(
        app.clone(),
        created
          .get("id")
          .and_then(|v| v.as_str())
          .unwrap_or_default()
          .to_string(),
        created
          .get("mcVersion")
          .and_then(|v| v.as_str())
          .unwrap_or("latest")
          .to_string(),
        created
          .get("loader")
          .and_then(|v| v.as_str())
          .unwrap_or("vanilla")
          .to_string(),
        if created.get("loader").and_then(|v| v.as_str()) == Some("fabric") {
          created.get("fabricLoaderVersion").and_then(|v| v.as_str()).map(str::to_string)
        } else if created.get("loader").and_then(|v| v.as_str()) == Some("quilt") {
          created.get("quiltLoaderVersion").and_then(|v| v.as_str()).map(str::to_string)
        } else if created.get("loader").and_then(|v| v.as_str()) == Some("forge") {
          created.get("forgeVersion").and_then(|v| v.as_str()).map(str::to_string)
        } else if created.get("loader").and_then(|v| v.as_str()) == Some("neoforge") {
          created.get("neoforgeVersion").and_then(|v| v.as_str()).map(str::to_string)
        } else {
          None
        },
      )
      .await?;

      if let Some(v_id) = version_id {
        let version_detail: Value = reqwest::Client::new()
          .get(format!("https://api.modpacks.ch/public/modpack/{pack_id_num}/{v_id}"))
          .header("user-agent", "FishbatteryLauncher/0.2.1")
          .send()
          .await
          .map_err(into_error)?
          .error_for_status()
          .map_err(into_error)?
          .json()
          .await
          .map_err(into_error)?;
        if let Some(files) = version_detail.get("files").and_then(|x| x.as_array()) {
          let root = created
            .get("id")
            .and_then(|v| v.as_str())
            .map(|x| instance_dir(&app, x))
            .transpose()?
            .ok_or_else(|| "providerPacksInstall: missing created instance id".to_string())?;
          let client = reqwest::Client::new();
          let mut downloaded = 0usize;
          for f in files {
            if f.get("serveronly").and_then(|x| x.as_bool()) == Some(true) {
              continue;
            }
            if f.get("optional").and_then(|x| x.as_bool()) == Some(true) {
              continue;
            }
            let name = f.get("name").and_then(|x| x.as_str()).unwrap_or("").trim();
            let url = f.get("url").and_then(|x| x.as_str()).unwrap_or("").trim();
            if name.is_empty() || url.is_empty() {
              continue;
            }
            let rel_base = f
              .get("path")
              .and_then(|x| x.as_str())
              .unwrap_or("")
              .trim_start_matches("./")
              .replace('\\', "/");
            let rel = if rel_base.is_empty() {
              name.to_string()
            } else {
              format!("{rel_base}/{name}")
            };
            if !is_safe_relative_archive_path(&rel) {
              continue;
            }
            let out = root.join(&rel);
            if let Some(parent) = out.parent() {
              fs::create_dir_all(parent).map_err(into_error)?;
            }
            let bytes = client
              .get(url)
              .header("user-agent", "FishbatteryLauncher/0.2.1")
              .send()
              .await
              .map_err(into_error)?
              .error_for_status()
              .map_err(into_error)?
              .bytes()
              .await
              .map_err(into_error)?;
            fs::write(out, &bytes).map_err(into_error)?;
            downloaded += 1;
          }
          notes.push(format!("Downloaded {downloaded} required files from FTB metadata."));
        }
      }

      notes.push(format!("Installed FTB pack ({pid}) with loader setup."));
      return Ok(json!({
        "instance": created,
        "notes": notes
      }));
    }
    return Err("providerPacksInstall: invalid FTB pack id".to_string());
  } else {
    let safe = pid.strip_prefix("atl-").unwrap_or(pid);
    let latest: Value = reqwest::Client::new()
      .get(format!(
        "https://api.atlauncher.com/v1/pack/{}/latest",
        urlencoding::encode(safe)
      ))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?;
    if let Some(ver) = latest
      .get("data")
      .and_then(|d| d.get("minecraftVersion"))
      .and_then(|x| x.as_str())
    {
      mc_version = ver.to_string();
    }
    notes.push(format!("Created instance from ATLauncher metadata ({pid})."));
    notes.push("Direct ATLauncher file sync is not available from current public API.".to_string());
  }

  let created = instances_create(
    app.clone(),
    json!({
      "id": id,
      "name": name,
      "accountId": account_id,
      "mcVersion": mc_version,
      "loader": "vanilla",
      "memoryMb": default_mem,
      "instancePreset": "none",
      "jvmArgsOverride": Value::Null,
      "syncEnabled": true
    }),
  )?;
  let _ = vanilla_install(
    app.clone(),
    created
      .get("mcVersion")
      .and_then(|v| v.as_str())
      .unwrap_or("latest")
      .to_string(),
  )
  .await;

  Ok(json!({
    "instance": created,
    "notes": notes
  }))
}

#[command]
pub async fn modrinth_packs_install(app: tauri::AppHandle, payload: Value) -> AppResult<Value> {
  let project_id = payload
    .get("projectId")
    .and_then(|v| v.as_str())
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .ok_or_else(|| "modrinthPacksInstall: projectId missing".to_string())?
    .to_string();
  let version_id = payload
    .get("versionId")
    .and_then(|v| v.as_str())
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(str::to_string);
  let account_id = payload.get("accountId").cloned().unwrap_or(Value::Null);
  let memory_mb = payload.get("memoryMb").and_then(|v| v.as_u64()).unwrap_or(6144);
  let name_override = payload
    .get("nameOverride")
    .and_then(|v| v.as_str())
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(str::to_string);

  let client = reqwest::Client::new();
  let version: ModrinthVersion = if let Some(v_id) = version_id.clone() {
    client
      .get(format!(
        "https://api.modrinth.com/v2/version/{}",
        urlencoding::encode(&v_id)
      ))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?
  } else {
    let mut versions: Vec<ModrinthVersion> = client
      .get(format!(
        "https://api.modrinth.com/v2/project/{}/version",
        urlencoding::encode(&project_id)
      ))
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .json()
      .await
      .map_err(into_error)?;
    versions.retain(|v| !v.files.is_empty());
    versions
      .into_iter()
      .next()
      .ok_or_else(|| "modrinthPacksInstall: no installable versions found".to_string())?
  };

  let pack_file = version
    .files
    .iter()
    .find(|f| f.primary.unwrap_or(false))
    .or_else(|| version.files.first())
    .ok_or_else(|| "modrinthPacksInstall: no downloadable file found".to_string())?;

  let loader = loader_from_modrinth(&version);
  let mc_version = version
    .game_versions
    .first()
    .cloned()
    .unwrap_or_else(|| "latest".to_string());

  let mut db = read_db(&app)?;
  let desired_name = name_override.unwrap_or_else(|| {
    if version.name.trim().is_empty() {
      format!("Modpack {project_id}")
    } else {
      version.name.clone()
    }
  });
  let unique_name = unique_instance_name(&db, &desired_name);
  let new_id = format!("modrinth-{}", now_ms());

  let mut cfg = json!({
    "id": new_id,
    "name": unique_name,
    "accountId": account_id,
    "mcVersion": mc_version,
    "loader": loader,
    "memoryMb": memory_mb,
    "instancePreset": "none",
    "jvmArgsOverride": Value::Null,
    "syncEnabled": true
  });

  if loader != "vanilla" {
    let resolved = loader_pick_version(loader.clone(), mc_version.clone()).await?;
    match loader.as_str() {
      "fabric" => cfg["fabricLoaderVersion"] = json!(resolved),
      "quilt" => cfg["quiltLoaderVersion"] = json!(resolved),
      "forge" => cfg["forgeVersion"] = json!(resolved),
      "neoforge" => cfg["neoforgeVersion"] = json!(resolved),
      _ => {}
    }
  }

  let created = instances_create(app.clone(), cfg.clone())?;
  // Refresh db after create.
  db = read_db(&app)?;
  let _ = db;

  let _ = loader_install(
    app.clone(),
    new_id.clone(),
    mc_version.clone(),
    loader.clone(),
    if loader == "fabric" {
      cfg.get("fabricLoaderVersion").and_then(|v| v.as_str()).map(str::to_string)
    } else if loader == "quilt" {
      cfg.get("quiltLoaderVersion").and_then(|v| v.as_str()).map(str::to_string)
    } else if loader == "forge" {
      cfg.get("forgeVersion").and_then(|v| v.as_str()).map(str::to_string)
    } else if loader == "neoforge" {
      cfg.get("neoforgeVersion").and_then(|v| v.as_str()).map(str::to_string)
    } else {
      None
    },
  )
  .await?;

  let pack_bytes = client
    .get(&pack_file.url)
    .header("user-agent", "FishbatteryLauncher/0.2.1")
    .send()
    .await
    .map_err(into_error)?
    .error_for_status()
    .map_err(into_error)?
    .bytes()
    .await
    .map_err(into_error)?;

  let cursor = std::io::Cursor::new(pack_bytes.to_vec());
  let mut zip = ZipArchive::new(cursor).map_err(into_error)?;

  let mut idx_raw = String::new();
  {
    let mut idx = zip
      .by_name("modrinth.index.json")
      .map_err(|_| "Invalid .mrpack: missing modrinth.index.json".to_string())?;
    idx.read_to_string(&mut idx_raw).map_err(into_error)?;
  }
  let index: MrpackIndex = serde_json::from_str(&idx_raw).map_err(into_error)?;
  let out_root = instance_dir(&app, &new_id)?;
  fs::create_dir_all(&out_root).map_err(into_error)?;

  for f in index.files {
    if f.path.trim().is_empty() || !is_safe_relative_archive_path(&f.path) {
      continue;
    }
    let download = match f.downloads.first() {
      Some(v) => v,
      None => continue,
    };
    let bytes = client
      .get(download)
      .header("user-agent", "FishbatteryLauncher/0.2.1")
      .send()
      .await
      .map_err(into_error)?
      .error_for_status()
      .map_err(into_error)?
      .bytes()
      .await
      .map_err(into_error)?;
    let out = out_root.join(&f.path);
    if let Some(parent) = out.parent() {
      fs::create_dir_all(parent).map_err(into_error)?;
    }
    fs::write(out, &bytes).map_err(into_error)?;
  }

  for i in 0..zip.len() {
    let mut entry = zip.by_index(i).map_err(into_error)?;
    if !entry.is_file() {
      continue;
    }
    let name = entry.name().replace('\\', "/");
    let prefix = if name.starts_with("overrides/") {
      "overrides/"
    } else if name.starts_with("client-overrides/") {
      "client-overrides/"
    } else {
      ""
    };
    if prefix.is_empty() {
      continue;
    }
    let rel = &name[prefix.len()..];
    if !is_safe_relative_archive_path(rel) {
      continue;
    }
    let out = out_root.join(rel);
    if let Some(parent) = out.parent() {
      fs::create_dir_all(parent).map_err(into_error)?;
    }
    let mut writer = fs::File::create(out).map_err(into_error)?;
    std::io::copy(&mut entry, &mut writer).map_err(into_error)?;
  }

  Ok(json!({
    "instance": created,
    "version": {
      "id": version.id,
      "name": version.name,
      "versionNumber": version.version_number
    }
  }))
}
