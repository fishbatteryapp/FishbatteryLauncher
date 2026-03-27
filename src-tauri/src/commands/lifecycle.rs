use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tar::Archive as TarArchive;
use tauri::{command, Manager, Window};
use zip::ZipArchive;

use crate::commands::{accounts_capes, runtime_ops};
use crate::error::{into_error, AppResult};
use crate::events::{emit_launch_log, emit_launch_log_app};
use crate::logs;
use crate::state::AppState;

const MAX_ROLLBACK_SNAPSHOTS: usize = 8;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "windows")]
fn hide_console_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(_cmd: &mut Command) {}

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

fn accounts_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_root(app)?.join("data").join("accounts.json"))
}

fn validate_id(id: &str, name: &str) -> AppResult<String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err(format!("{name}: id missing"));
    }
    if trimmed.len() > 128 {
        return Err(format!("{name}: id too long"));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(format!("{name}: id contains unsupported characters"));
    }
    Ok(trimmed.to_string())
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

fn read_instances_db(app: &tauri::AppHandle) -> AppResult<Value> {
    let path = instances_db_path(app)?;
    let mut db: Value = read_json_file(
        &path,
        json!({
          "activeInstanceId": Value::Null,
          "instances": [],
          "updatedAt": now_ms(),
        }),
    );
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
    Ok(db)
}

fn write_instances_db(app: &tauri::AppHandle, db: &Value) -> AppResult<()> {
    write_json_file(&instances_db_path(app)?, db)
}

fn find_instance<'a>(db: &'a Value, instance_id: &str) -> Option<&'a Value> {
    db.get("instances")
        .and_then(|v| v.as_array())
        .and_then(|items| {
            items
                .iter()
                .find(|x| x.get("id").and_then(|v| v.as_str()) == Some(instance_id))
        })
}

fn find_instance_mut<'a>(db: &'a mut Value, instance_id: &str) -> Option<&'a mut Value> {
    db.get_mut("instances")
        .and_then(|v| v.as_array_mut())
        .and_then(|items| {
            items
                .iter_mut()
                .find(|x| x.get("id").and_then(|v| v.as_str()) == Some(instance_id))
        })
}

fn instance_dir(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
    Ok(instances_root(app)?.join(instance_id))
}

fn java_bin_candidates_for_root(root: &Path, channel: &str) -> Vec<PathBuf> {
    if cfg!(target_os = "windows") {
        vec![
            root.join("runtime")
                .join(channel)
                .join("bin")
                .join("javaw.exe"),
            root.join("runtime")
                .join(channel)
                .join("bin")
                .join("java.exe"),
        ]
    } else {
        vec![root.join("runtime").join(channel).join("bin").join("java")]
    }
}

fn is_java_bin_filename(name: &str) -> bool {
    if cfg!(target_os = "windows") {
        let lower = name.to_ascii_lowercase();
        lower == "javaw.exe" || lower == "java.exe"
    } else {
        name == "java"
    }
}

fn discover_java_bins_recursive(root: &Path, max_depth: usize) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name().and_then(|x| x.to_str()).unwrap_or("");
                if is_java_bin_filename(name) {
                    out.push(p);
                }
                continue;
            }
            if p.is_dir() && depth < max_depth {
                stack.push((p, depth + 1));
            }
        }
    }
    out
}

fn bundled_runtime_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(data_root) = app_data_root(app) {
        roots.push(data_root.join("runtime"));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("runtime"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd.join("runtime"));
        if let Some(parent) = cwd.parent() {
            roots.push(parent.join("runtime"));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            roots.push(exe_dir.join("runtime"));
        }
    }
    roots
}

#[allow(dead_code)]
#[derive(Clone, Copy)]
enum JavaArchiveKind {
    Zip,
    TarGz,
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn java8_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::Zip,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn java8_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/8/ga/mac/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn java8_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    // Adoptium does not provide JRE 8 for macOS arm64; Corretto JDK 8 is a practical fallback.
    Some((
        "https://corretto.aws/downloads/latest/amazon-corretto-8-aarch64-macos-jdk.tar.gz",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn java8_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/8/ga/linux/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(not(any(
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "linux", target_arch = "x86_64")
)))]
fn java8_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    None
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn java17_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::Zip,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn java17_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/17/ga/mac/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn java17_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn java17_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(not(any(
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "linux", target_arch = "x86_64")
)))]
fn java17_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    None
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn java21_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::Zip,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn java21_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/21/ga/mac/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn java21_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn java21_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(not(any(
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "linux", target_arch = "x86_64")
)))]
fn java21_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    None
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn java25_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::Zip,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn java25_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/25/ga/mac/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn java25_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/25/ga/mac/aarch64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn java25_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    Some((
        "https://api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jre/hotspot/normal/eclipse",
        JavaArchiveKind::TarGz,
    ))
}

#[cfg(not(any(
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "linux", target_arch = "x86_64")
)))]
fn java25_download_spec() -> Option<(&'static str, JavaArchiveKind)> {
    None
}

fn java_download_spec(major: u32) -> Option<(&'static str, JavaArchiveKind)> {
    match major {
        8 => java8_download_spec(),
        17 => java17_download_spec(),
        21 => java21_download_spec(),
        25 => java25_download_spec(),
        _ => None,
    }
}

fn extract_zip_bytes(bytes: &[u8], out_dir: &Path) -> AppResult<()> {
    fs::create_dir_all(out_dir).map_err(into_error)?;
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(into_error)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(into_error)?;
        let name = entry.name().replace('\\', "/");
        let out = out_dir.join(name);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(into_error)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(into_error)?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(into_error)?;
        fs::write(&out, buf).map_err(into_error)?;
    }
    Ok(())
}

fn extract_targz_bytes(bytes: &[u8], out_dir: &Path) -> AppResult<()> {
    fs::create_dir_all(out_dir).map_err(into_error)?;
    let cursor = std::io::Cursor::new(bytes);
    let decoder = flate2::read::GzDecoder::new(cursor);
    let mut archive = TarArchive::new(decoder);
    archive.unpack(out_dir).map_err(into_error)?;
    Ok(())
}

fn has_java_major_in_bundled_roots(app: &tauri::AppHandle, wanted_major: u32) -> bool {
    for root in bundled_runtime_roots(app) {
        if !root.exists() {
            continue;
        }
        for p in discover_java_bins_recursive(&root, 6) {
            let program = p.to_string_lossy().to_string();
            if probe_java_major(&program) == Some(wanted_major) {
                return true;
            }
        }
    }
    false
}

async fn ensure_java8_runtime_available(app: &tauri::AppHandle, window: &Window) -> AppResult<()> {
    ensure_java_major_runtime_available(app, window, 8).await
}

async fn ensure_java_major_runtime_available(
    app: &tauri::AppHandle,
    window: &Window,
    wanted_major: u32,
) -> AppResult<()> {
    if has_java_major_in_bundled_roots(app, wanted_major) {
        return Ok(());
    }
    let Some((url, archive_kind)) = java_download_spec(wanted_major) else {
        return Err(format!(
            "launch: Java {} auto-download is not configured for this platform",
            wanted_major
        ));
    };

    let runtime_root = app_data_root(app)?.join("runtime");
    let managed_root = runtime_root.join(format!("java{}-managed", wanted_major));
    fs::create_dir_all(&managed_root).map_err(into_error)?;

    let _ = emit_launch_log(
        window,
        format!(
            "[launcher] Java {} runtime missing; downloading managed Java {} runtime",
            wanted_major, wanted_major
        ),
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(into_error)?;
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

    if managed_root.exists() {
        let _ = fs::remove_dir_all(&managed_root);
    }
    fs::create_dir_all(&managed_root).map_err(into_error)?;

    match archive_kind {
        JavaArchiveKind::Zip => extract_zip_bytes(&bytes, &managed_root)?,
        JavaArchiveKind::TarGz => extract_targz_bytes(&bytes, &managed_root)?,
    }

    if !has_java_major_in_bundled_roots(app, wanted_major) {
        return Err(format!(
            "launch: Java {} download completed but runtime was not discoverable",
            wanted_major
        ));
    }
    let _ = emit_launch_log(
        window,
        format!(
            "[launcher] Managed Java {} runtime installed at {}",
            wanted_major,
            managed_root.to_string_lossy()
        ),
    );
    Ok(())
}

fn parse_mc_semver_triplet(mc_version: &str) -> Option<(u32, u32, u32)> {
    let cleaned = mc_version.trim();
    if cleaned.is_empty() {
        return None;
    }
    let mut nums: Vec<u32> = Vec::new();
    for part in cleaned.split('.') {
        let digits: String = part.chars().take_while(|c| c.is_ascii_digit()).collect();
        if digits.is_empty() {
            break;
        }
        if let Ok(v) = digits.parse::<u32>() {
            nums.push(v);
        } else {
            break;
        }
    }
    if nums.len() < 2 {
        return None;
    }
    let major = nums[0];
    let minor = nums[1];
    let patch = nums.get(2).copied().unwrap_or(0);
    Some((major, minor, patch))
}

fn preferred_java_channels(mc_version: Option<&str>) -> Vec<&'static str> {
    let Some(version) = mc_version else {
        return vec!["java21", "java17", "java8"];
    };
    let Some((major, minor, patch)) = parse_mc_semver_triplet(version) else {
        return vec!["java21", "java17", "java8"];
    };
    if major != 1 {
        if major >= 24 {
            return vec!["java25", "java21", "java17", "java8"];
        }
        return vec!["java21", "java17", "java8"];
    }
    if minor <= 16 {
        return vec!["java8", "java17", "java21"];
    }
    if minor <= 19 {
        return vec!["java17", "java21", "java8"];
    }
    if minor == 20 && patch <= 4 {
        return vec!["java17", "java21", "java8"];
    }
    vec!["java21", "java17", "java8"]
}

fn parse_java_major_from_text(text: &str) -> Option<u32> {
    let line = text
        .lines()
        .find(|l| l.to_ascii_lowercase().contains("version"))
        .unwrap_or(text)
        .trim();
    let quoted = line
        .split('"')
        .nth(1)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| line.to_string());
    let first = quoted
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if first.is_empty() {
        return None;
    }
    if let Some(rest) = first.strip_prefix("1.") {
        let major = rest.split('.').next().unwrap_or("").trim();
        return major.parse::<u32>().ok();
    }
    first
        .split('.')
        .next()
        .unwrap_or("")
        .trim()
        .parse::<u32>()
        .ok()
}

fn probe_java_major(program: &str) -> Option<u32> {
    let mut cmd = Command::new(program);
    cmd.arg("-version");
    hide_console_window(&mut cmd);
    let out = cmd.output().ok()?;
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let text = if stderr.trim().is_empty() {
        stdout
    } else {
        stderr
    };
    parse_java_major_from_text(&text)
}

fn probe_java_data_model(program: &str) -> Option<u32> {
    let mut cmd = Command::new(program);
    cmd.args(["-XshowSettings:properties", "-version"]);
    hide_console_window(&mut cmd);
    let out = cmd.output().ok()?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let text = if stderr.trim().is_empty() {
        stdout.to_string()
    } else {
        stderr.to_string()
    };
    for line in text.lines() {
        let l = line.trim().to_ascii_lowercase();
        if l.contains("sun.arch.data.model") && l.contains('=') {
            let rhs = l.split('=').nth(1).map(|s| s.trim()).unwrap_or("");
            if rhs.starts_with("64") {
                return Some(64);
            }
            if rhs.starts_with("32") {
                return Some(32);
            }
        }
    }
    None
}

fn is_likely_32bit_java(program: &str) -> bool {
    if let Some(model) = probe_java_data_model(program) {
        return model == 32;
    }
    if cfg!(target_os = "windows") {
        let lower = program.to_ascii_lowercase();
        return lower.contains(r"\program files (x86)\");
    }
    false
}

fn mc_requires_java8(mc_version: &str) -> bool {
    let Some((major, minor, _)) = parse_mc_semver_triplet(mc_version) else {
        return false;
    };
    major == 1 && minor <= 16
}

fn channel_major(channel: &str) -> Option<u32> {
    channel.trim().strip_prefix("java")?.parse::<u32>().ok()
}

fn preferred_java_majors(mc_version: Option<&str>) -> Vec<u32> {
    preferred_java_channels(mc_version)
        .iter()
        .filter_map(|c| channel_major(c))
        .collect::<Vec<u32>>()
}

fn java_bins_from_home(home: &Path) -> Vec<PathBuf> {
    if cfg!(target_os = "windows") {
        vec![
            home.join("bin").join("javaw.exe"),
            home.join("bin").join("java.exe"),
        ]
    } else {
        vec![home.join("bin").join("java")]
    }
}

fn env_java_home_candidates_for_major(major: u32) -> Vec<PathBuf> {
    let keys = match major {
        8 => vec!["JAVA8_HOME", "JAVA_8_HOME", "JRE8_HOME"],
        17 => vec!["JAVA17_HOME", "JAVA_17_HOME"],
        21 => vec!["JAVA21_HOME", "JAVA_21_HOME"],
        25 => vec!["JAVA25_HOME", "JAVA_25_HOME"],
        _ => vec![],
    };
    let mut out = Vec::new();
    for key in keys {
        if let Ok(value) = std::env::var(key) {
            let p = PathBuf::from(value.trim());
            out.extend(java_bins_from_home(&p));
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn windows_known_java_candidates_for_major(major: u32) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut bases: Vec<PathBuf> = vec![
        PathBuf::from(r"C:\Program Files\Java"),
        PathBuf::from(r"C:\Program Files\Eclipse Adoptium"),
        PathBuf::from(r"C:\Program Files\Temurin"),
        PathBuf::from(r"C:\Program Files\Zulu"),
        PathBuf::from(r"C:\Program Files (x86)\Java"),
    ];
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        bases.push(PathBuf::from(program_files).join("Java"));
    }
    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        bases.push(PathBuf::from(program_files_x86).join("Java"));
    }

    let major_token = major.to_string();
    for base in bases {
        let Ok(rd) = fs::read_dir(&base) else {
            continue;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let name = p
                .file_name()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !(name.contains(&format!("jdk-{major_token}"))
                || name.contains(&format!("jre-{major_token}"))
                || name.contains(&format!("jdk{major_token}"))
                || name.contains(&format!("jre{major_token}"))
                || (major == 8 && (name.contains("1.8") || name.contains("java8")))
                || (major == 17 && name.contains("17"))
                || (major == 21 && name.contains("21"))
                || (major == 25 && name.contains("25")))
            {
                continue;
            }
            out.extend(java_bins_from_home(&p));
        }
    }
    out
}

#[cfg(not(target_os = "windows"))]
fn windows_known_java_candidates_for_major(_major: u32) -> Vec<PathBuf> {
    Vec::new()
}

fn resolve_java_executable(
    app: &tauri::AppHandle,
    mc_version: Option<&str>,
) -> (String, bool, String) {
    let channels = preferred_java_channels(mc_version);
    let preferred_majors = preferred_java_majors(mc_version);
    let mut bundled_candidates: Vec<(PathBuf, Option<u32>)> = Vec::new();
    let mut seen_bundled: std::collections::HashSet<String> = std::collections::HashSet::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        for channel in &channels {
            let major = channel_major(channel);
            for p in java_bin_candidates_for_root(&resource_dir, channel) {
                let key = p.to_string_lossy().to_string();
                if seen_bundled.insert(key) {
                    bundled_candidates.push((p, major));
                }
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        for channel in &channels {
            let major = channel_major(channel);
            for p in java_bin_candidates_for_root(&cwd, channel) {
                let key = p.to_string_lossy().to_string();
                if seen_bundled.insert(key) {
                    bundled_candidates.push((p, major));
                }
            }
        }
        if let Some(parent) = cwd.parent() {
            for channel in &channels {
                let major = channel_major(channel);
                for p in java_bin_candidates_for_root(parent, channel) {
                    let key = p.to_string_lossy().to_string();
                    if seen_bundled.insert(key) {
                        bundled_candidates.push((p, major));
                    }
                }
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for channel in &channels {
                let major = channel_major(channel);
                for p in java_bin_candidates_for_root(exe_dir, channel) {
                    let key = p.to_string_lossy().to_string();
                    if seen_bundled.insert(key) {
                        bundled_candidates.push((p, major));
                    }
                }
            }
        }
    }
    // Also discover extracted runtimes (e.g. runtime/<archive>/<jdk-dir>/bin/javaw.exe).
    for runtime_root in bundled_runtime_roots(app) {
        if !runtime_root.exists() {
            continue;
        }
        for p in discover_java_bins_recursive(&runtime_root, 5) {
            let key = p.to_string_lossy().to_string();
            if seen_bundled.insert(key) {
                bundled_candidates.push((p, None));
            }
        }
    }

    for wanted_major in &preferred_majors {
        for (candidate, candidate_major) in &bundled_candidates {
            if !candidate.exists() {
                continue;
            }
            if let Some(m) = candidate_major {
                if m != wanted_major {
                    continue;
                }
            }
            let program = candidate.to_string_lossy().to_string();
            if let Some(major) = probe_java_major(&program) {
                if major != *wanted_major {
                    continue;
                }
            } else {
                continue;
            }
            return (program, true, format!("{wanted_major}"));
        }

        let mut external_candidates: Vec<PathBuf> = Vec::new();
        external_candidates.extend(env_java_home_candidates_for_major(*wanted_major));
        external_candidates.extend(windows_known_java_candidates_for_major(*wanted_major));
        for candidate in external_candidates {
            if !candidate.exists() {
                continue;
            }
            let program = candidate.to_string_lossy().to_string();
            if let Some(major) = probe_java_major(&program) {
                if major == *wanted_major {
                    return (program, false, format!("{major}"));
                }
            }
        }
    }

    if let Some(path_major) = probe_java_major("java") {
        return ("java".to_string(), false, format!("PATH-{path_major}"));
    }
    ("java".to_string(), false, "PATH".to_string())
}

fn bridge_supported_mc_version(mc_version: &str) -> bool {
    let mut parts = mc_version.split('.');
    let major = parts
        .next()
        .and_then(|x| x.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|x| x.parse::<u32>().ok())
        .unwrap_or(0);
    // Bridge release channel currently targets modern Fabric builds 1.20+ through 1.21.x.
    major == 1 && (20..=21).contains(&minor)
}

fn mods_state_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
    Ok(instance_dir(app, instance_id)?.join("mods-state.json"))
}

fn packs_state_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
    Ok(instance_dir(app, instance_id)?.join("packs-state.json"))
}

fn rollback_db_path(app: &tauri::AppHandle, instance_id: &str) -> AppResult<PathBuf> {
    Ok(instance_dir(app, instance_id)?.join("rollback-snapshots.json"))
}

fn read_accounts_db(app: &tauri::AppHandle) -> Value {
    read_json_file(
        &accounts_db_path(app).unwrap_or_else(|_| PathBuf::from("")),
        json!({
          "active_id": Value::Null,
          "accounts": [],
        }),
    )
}

fn account_exists(app: &tauri::AppHandle, account_id: &str) -> bool {
    let db = read_accounts_db(app);
    db.get("accounts")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .any(|x| x.get("id").and_then(|v| v.as_str()) == Some(account_id))
        })
        .unwrap_or(false)
}

fn tail(lines: &[String], max: usize) -> Vec<String> {
    if lines.len() <= max {
        return lines.to_vec();
    }
    lines[lines.len() - max..].to_vec()
}

fn has_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

fn split_shell_words(input: &str) -> Vec<String> {
    let mut out = Vec::<String>::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    for ch in input.chars() {
        match quote {
            Some(q) => {
                if ch == q {
                    quote = None;
                } else {
                    cur.push(ch);
                }
            }
            None => {
                if ch == '"' || ch == '\'' {
                    quote = Some(ch);
                } else if ch.is_whitespace() {
                    if !cur.is_empty() {
                        out.push(cur.clone());
                        cur.clear();
                    }
                } else {
                    cur.push(ch);
                }
            }
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn run_hook_command(phase: &str, command: &str, app: &tauri::AppHandle) -> AppResult<()> {
    let cmd = command.trim();
    if cmd.is_empty() {
        return Ok(());
    }
    let _ = emit_launch_log_app(app, format!("[hook] Running {phase} hook: {cmd}"));

    let status = if cfg!(target_os = "windows") {
        let mut proc = Command::new("cmd");
        proc.args(["/C", cmd]);
        hide_console_window(&mut proc);
        proc.status().map_err(into_error)?
    } else {
        Command::new("sh")
            .args(["-c", cmd])
            .status()
            .map_err(into_error)?
    };

    if status.success() {
        let _ = emit_launch_log_app(app, format!("[hook] {phase} hook completed"));
        Ok(())
    } else {
        Err(format!(
            "{phase} hook exited with code {}",
            status.code().unwrap_or(-1)
        ))
    }
}

fn kill_pid(pid: u32) -> bool {
    if cfg!(target_os = "windows") {
        return Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
    }
    Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn runtime_data_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_root(app)?.join("data"))
}

fn versions_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(runtime_data_root(app)?.join("versions"))
}

fn libraries_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(runtime_data_root(app)?.join("libraries"))
}

fn assets_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(runtime_data_root(app)?.join("assets"))
}

fn ensure_launcher_profiles_stub(minecraft_dir: &Path) -> AppResult<()> {
    let launcher_profiles = minecraft_dir.join("launcher_profiles.json");
    if launcher_profiles.exists() {
        return Ok(());
    }
    let stub = json!({
      "profiles": {},
      "settings": {},
      "version": 3
    });
    write_json_file(&launcher_profiles, &stub)
}

fn ensure_instance_dirs(instance_path: &Path) -> AppResult<()> {
    fs::create_dir_all(instance_path).map_err(into_error)?;
    for dir in [
        "mods",
        "config",
        "resourcepacks",
        "shaderpacks",
        "saves",
        "logs",
        ".fishbattery",
    ] {
        fs::create_dir_all(instance_path.join(dir)).map_err(into_error)?;
    }
    Ok(())
}

fn launcher_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

fn launcher_arch_token() -> &'static str {
    if cfg!(target_pointer_width = "64") {
        "64"
    } else {
        "32"
    }
}

fn parse_maven_name(name: &str) -> Option<(String, String, String)> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut ext = "jar".to_string();
    let mut body = trimmed.to_string();
    if let Some((left, right)) = trimmed.split_once('@') {
        body = left.to_string();
        let e = right.trim();
        if !e.is_empty() {
            ext = e.to_string();
        }
    }
    let parts: Vec<&str> = body.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0];
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() >= 4 {
        Some(parts[3])
    } else {
        None
    };
    let group_path = group.replace('.', "/");
    let file = if let Some(c) = classifier {
        format!("{artifact}-{version}-{c}.{ext}")
    } else {
        format!("{artifact}-{version}.{ext}")
    };
    let rel = format!("{group_path}/{artifact}/{version}/{file}");
    Some((rel, ext, body))
}

fn default_repo_for_library(name: &str) -> &'static str {
    if name.starts_with("net.fabricmc:") || name.starts_with("net.fabricmc.intermediary:") {
        return "https://maven.fabricmc.net/";
    }
    if name.starts_with("net.minecraftforge:")
        || name.starts_with("cpw.mods:")
        || name.starts_with("net.md-5:")
        || name.starts_with("lzma:")
    {
        return "https://maven.minecraftforge.net/";
    }
    if name.starts_with("com.mojang:") || name.starts_with("net.minecraft:") {
        return "https://libraries.minecraft.net/";
    }
    "https://repo1.maven.org/maven2/"
}

fn rewrite_legacy_library_url(name: &str, rel: &str, current_url: Option<&str>) -> Option<String> {
    let url = current_url?.trim();
    if url.is_empty() {
        return None;
    }

    let rewritten_rel = if name.starts_with("java3d:vecmath:") {
        Some(rel.replacen("java3d/vecmath/", "javax/vecmath/vecmath/", 1))
    } else {
        None
    };
    let needs_forge_maven = name.starts_with("lzma:lzma:");
    let uses_maven_central =
        url.contains("repo1.maven.org/maven2/") || url.contains("repo.maven.apache.org/maven2/");

    if let Some(remapped_rel) = rewritten_rel {
        if uses_maven_central {
            return Some(format!("https://repo1.maven.org/maven2/{remapped_rel}"));
        }
    }

    if needs_forge_maven && uses_maven_central {
        return Some(format!("https://maven.minecraftforge.net/{rel}"));
    }

    None
}

fn push_unique_url(out: &mut Vec<String>, url: String) {
    if !out.iter().any(|existing| existing == &url) {
        out.push(url);
    }
}

fn known_maven_relative_path(url: &str) -> Option<&str> {
    const BASES: [&str; 9] = [
        "https://repo1.maven.org/maven2/",
        "https://repo.maven.apache.org/maven2/",
        "https://libraries.minecraft.net/",
        "https://maven.minecraftforge.net/",
        "https://maven.neoforged.net/releases/",
        "https://maven.fabricmc.net/",
        "https://maven.quiltmc.org/repository/release/",
        "https://maven.mohistmc.com/libraries/",
        "https://repo.spongepowered.org/maven/",
    ];

    BASES
        .iter()
        .find_map(|base| url.strip_prefix(base))
        .filter(|rel| !rel.trim().is_empty())
}

fn download_candidates(url: &str) -> Vec<String> {
    let mut candidates = vec![url.to_string()];
    let Some(rel) = known_maven_relative_path(url) else {
        if url.ends_with("/lzma/lzma/0.0.1/lzma-0.0.1.jar") {
            push_unique_url(
                &mut candidates,
                "https://libraries.minecraft.net/lzma/lzma/0.0.1/lzma-0.0.1.jar".to_string(),
            );
            push_unique_url(
                &mut candidates,
                "https://maven.mohistmc.com/libraries/lzma/lzma/0.0.1/lzma-0.0.1.jar".to_string(),
            );
        }
        return candidates;
    };

    const FALLBACK_BASES: [&str; 8] = [
        "https://repo1.maven.org/maven2/",
        "https://repo.maven.apache.org/maven2/",
        "https://libraries.minecraft.net/",
        "https://maven.minecraftforge.net/",
        "https://maven.neoforged.net/releases/",
        "https://maven.fabricmc.net/",
        "https://maven.quiltmc.org/repository/release/",
        "https://maven.mohistmc.com/libraries/",
    ];

    for base in FALLBACK_BASES {
        push_unique_url(&mut candidates, format!("{base}{rel}"));
    }

    if rel.starts_with("org/spongepowered/") {
        push_unique_url(
            &mut candidates,
            format!("https://repo.spongepowered.org/maven/{rel}"),
        );
    }

    candidates
}

fn ensure_library_download_fields(lib: &mut Value) {
    let has_classifiers = lib
        .get("downloads")
        .and_then(|v| v.get("classifiers"))
        .map(|v| v.is_object())
        .unwrap_or(false);
    let artifact_path_present = lib
        .get("downloads")
        .and_then(|v| v.get("artifact"))
        .and_then(|v| v.get("path"))
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    // Some legacy libraries (e.g. jinput-platform) are natives-only and
    // intentionally omit a base artifact jar. Do not synthesize one.
    if has_classifiers && !artifact_path_present {
        return;
    }

    let has_artifact = lib
        .get("downloads")
        .and_then(|v| v.get("artifact"))
        .and_then(|v| v.get("path"))
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        && lib
            .get("downloads")
            .and_then(|v| v.get("artifact"))
            .and_then(|v| v.get("url"))
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
    let Some(name) = lib.get("name").and_then(|v| v.as_str()) else {
        return;
    };
    let Some((rel, _ext, _)) = parse_maven_name(name) else {
        return;
    };
    if has_artifact {
        let current_url = lib
            .get("downloads")
            .and_then(|v| v.get("artifact"))
            .and_then(|v| v.get("url"))
            .and_then(|v| v.as_str());
        if let Some(rewritten_url) = rewrite_legacy_library_url(name, &rel, current_url) {
            lib["downloads"]["artifact"]["url"] = json!(rewritten_url);
        }
        return;
    }

    let base = lib
        .get("url")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default_repo_for_library(name).to_string());
    let base = if base.ends_with('/') {
        base
    } else {
        format!("{base}/")
    };
    let artifact = json!({
      "path": rel,
      "url": format!("{base}{rel}")
    });
    if !lib.is_object() {
        return;
    }
    if lib.get("downloads").is_none()
        || !lib.get("downloads").map(|v| v.is_object()).unwrap_or(false)
    {
        lib["downloads"] = json!({});
    }
    lib["downloads"]["artifact"] = artifact;
}

#[cfg(test)]
mod tests {
    use super::{download_candidates, rewrite_legacy_library_url};

    #[test]
    fn rewrites_vecmath_to_javax_group_on_maven_central() {
        let rewritten = rewrite_legacy_library_url(
            "java3d:vecmath:1.5.2",
            "java3d/vecmath/1.5.2/vecmath-1.5.2.jar",
            Some("https://repo1.maven.org/maven2/java3d/vecmath/1.5.2/vecmath-1.5.2.jar"),
        );
        assert_eq!(
            rewritten.as_deref(),
            Some("https://repo1.maven.org/maven2/javax/vecmath/vecmath/1.5.2/vecmath-1.5.2.jar")
        );
    }

    #[test]
    fn rewrites_lzma_to_forge_maven() {
        let rewritten = rewrite_legacy_library_url(
            "lzma:lzma:0.0.1",
            "lzma/lzma/0.0.1/lzma-0.0.1.jar",
            Some("https://repo1.maven.org/maven2/lzma/lzma/0.0.1/lzma-0.0.1.jar"),
        );
        assert_eq!(
            rewritten.as_deref(),
            Some("https://maven.minecraftforge.net/lzma/lzma/0.0.1/lzma-0.0.1.jar")
        );
    }

    #[test]
    fn includes_multiple_maven_fallbacks_for_library_downloads() {
        let candidates = download_candidates(
            "https://repo1.maven.org/maven2/com/google/guava/guava/21.0/guava-21.0.jar",
        );
        assert!(candidates.iter().any(|url| {
            url == "https://repo1.maven.org/maven2/com/google/guava/guava/21.0/guava-21.0.jar"
        }));
        assert!(candidates.iter().any(|url| {
            url == "https://repo.maven.apache.org/maven2/com/google/guava/guava/21.0/guava-21.0.jar"
        }));
        assert!(candidates.iter().any(|url| {
            url == "https://maven.minecraftforge.net/com/google/guava/guava/21.0/guava-21.0.jar"
        }));
        assert!(candidates.iter().any(|url| {
            url == "https://maven.fabricmc.net/com/google/guava/guava/21.0/guava-21.0.jar"
        }));
        assert!(candidates.iter().any(|url| {
            url == "https://maven.quiltmc.org/repository/release/com/google/guava/guava/21.0/guava-21.0.jar"
        }));
    }
}

fn rule_matches(rule: &Value, features: &HashMap<&str, bool>) -> bool {
    if let Some(os) = rule.get("os").and_then(|v| v.as_object()) {
        if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
            let cur = launcher_os_name();
            if name != cur {
                return false;
            }
        }
        if let Some(arch) = os.get("arch").and_then(|v| v.as_str()) {
            let cur = if cfg!(target_pointer_width = "64") {
                "x86_64"
            } else {
                "x86"
            };
            if arch != cur && arch != launcher_arch_token() {
                return false;
            }
        }
    }
    if let Some(feat_obj) = rule.get("features").and_then(|v| v.as_object()) {
        for (k, expected) in feat_obj {
            let expected = expected.as_bool().unwrap_or(false);
            let actual = features.get(k.as_str()).copied().unwrap_or(false);
            if actual != expected {
                return false;
            }
        }
    }
    true
}

fn rules_allow(node: &Value, features: &HashMap<&str, bool>) -> bool {
    let Some(rules) = node.get("rules").and_then(|v| v.as_array()) else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        if !rule_matches(rule, features) {
            continue;
        }
        let action = rule
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("allow");
        allowed = action != "disallow";
    }
    allowed
}

fn collect_argument_values(item: &Value, features: &HashMap<&str, bool>) -> Vec<String> {
    if let Some(s) = item.as_str() {
        return vec![s.to_string()];
    }
    let Some(obj) = item.as_object() else {
        return Vec::new();
    };
    if !rules_allow(item, features) {
        return Vec::new();
    }
    let Some(value) = obj.get("value") else {
        return Vec::new();
    };
    if let Some(s) = value.as_str() {
        return vec![s.to_string()];
    }
    value
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}

fn merge_library_key(lib: &Value) -> String {
    if let Some(name) = lib.get("name").and_then(|v| v.as_str()) {
        return format!("name:{name}");
    }
    if let Some(path) = lib
        .get("downloads")
        .and_then(|v| v.get("artifact"))
        .and_then(|v| v.get("path"))
        .and_then(|v| v.as_str())
    {
        return format!("path:{path}");
    }
    lib.to_string()
}

fn merge_profiles(parent: &Value, child: &Value) -> Value {
    let mut out = parent.clone();
    if !out.is_object() {
        out = json!({});
    }
    let Some(child_obj) = child.as_object() else {
        return out;
    };

    for (k, v) in child_obj {
        if k == "libraries" {
            // Preserve deterministic classpath order: parent first, child overrides in place.
            let mut ordered: Vec<Value> = Vec::new();
            let mut index_by_key: HashMap<String, usize> = HashMap::new();
            if let Some(arr) = out.get("libraries").and_then(|x| x.as_array()) {
                for lib in arr {
                    let key = merge_library_key(lib);
                    let idx = ordered.len();
                    ordered.push(lib.clone());
                    index_by_key.insert(key, idx);
                }
            }
            if let Some(arr) = v.as_array() {
                for lib in arr {
                    let key = merge_library_key(lib);
                    if let Some(idx) = index_by_key.get(&key).copied() {
                        ordered[idx] = lib.clone();
                    } else {
                        let idx = ordered.len();
                        ordered.push(lib.clone());
                        index_by_key.insert(key, idx);
                    }
                }
            }
            out["libraries"] = Value::Array(ordered);
            continue;
        }
        if k == "arguments" {
            let mut merged = out.get("arguments").cloned().unwrap_or_else(|| json!({}));
            if !merged.is_object() {
                merged = json!({});
            }
            for scope in ["jvm", "game"] {
                let mut vals: Vec<Value> = Vec::new();
                if let Some(arr) = out
                    .get("arguments")
                    .and_then(|x| x.get(scope))
                    .and_then(|x| x.as_array())
                {
                    vals.extend(arr.iter().cloned());
                }
                if let Some(arr) = v.get(scope).and_then(|x| x.as_array()) {
                    vals.extend(arr.iter().cloned());
                }
                if !vals.is_empty() {
                    merged[scope] = Value::Array(vals);
                }
            }
            out["arguments"] = merged;
            continue;
        }
        out[k] = v.clone();
    }
    out
}

fn version_json_path(versions_root: &Path, version_id: &str) -> PathBuf {
    versions_root
        .join(version_id)
        .join(format!("{version_id}.json"))
}

fn profile_id_matches_loader_version(
    id: &str,
    mc_version: &str,
    loader: &str,
    loader_version: &str,
) -> bool {
    let id_lower = id.to_ascii_lowercase();
    let mc_lower = mc_version.trim().to_ascii_lowercase();
    let loader_lower = loader.trim().to_ascii_lowercase();
    let lv_lower = loader_version.trim().to_ascii_lowercase();
    if id_lower.is_empty() {
        return false;
    }
    let id_mentions_mc = !mc_lower.is_empty() && id_lower.contains(&mc_lower);
    if !id_mentions_mc && loader_lower != "neoforge" {
        return false;
    }
    if lv_lower.is_empty() {
        return id_mentions_mc || loader_lower == "neoforge";
    }
    let mut candidates: Vec<String> = vec![lv_lower.clone()];
    if let Some(stripped) = lv_lower.strip_prefix(&(mc_lower.clone() + "-")) {
        if !stripped.is_empty() {
            candidates.push(stripped.to_string());
        }
    }
    if let Some(stripped) = lv_lower.strip_prefix(&(mc_lower.clone() + "_")) {
        if !stripped.is_empty() {
            candidates.push(stripped.to_string());
        }
    }
    if let Some(stripped) = lv_lower.strip_suffix(&("-".to_string() + &mc_lower)) {
        if !stripped.is_empty() {
            candidates.push(stripped.to_string());
        }
    }
    if let Some(stripped) = lv_lower.strip_suffix(&("_".to_string() + &mc_lower)) {
        if !stripped.is_empty() {
            candidates.push(stripped.to_string());
        }
    }
    // Legacy Forge can encode as mc-forgeBuild-mc; include middle forge build token.
    let dash_parts: Vec<&str> = lv_lower.split('-').collect();
    if dash_parts.len() >= 3 {
        let middle = dash_parts[1..dash_parts.len() - 1].join("-");
        if !middle.is_empty() {
            candidates.push(middle);
        }
    }
    for token in candidates {
        if !token.is_empty() && id_lower.contains(&token) {
            return id_mentions_mc || loader_lower == "neoforge";
        }
    }
    false
}

fn find_forge_like_profile_id(
    versions_root: &Path,
    mc_version: &str,
    loader: &str,
    loader_version: &str,
) -> Option<String> {
    let rd = fs::read_dir(versions_root).ok()?;
    let mut candidates: Vec<(std::time::SystemTime, String)> = Vec::new();
    let mut loose_candidates: Vec<(std::time::SystemTime, String)> = Vec::new();
    for entry in rd.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = path
            .file_name()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        let id_lower = id.to_ascii_lowercase();
        if loader == "forge" && !id_lower.contains("forge") {
            continue;
        }
        if loader == "neoforge" && !id_lower.contains("neoforge") {
            continue;
        }
        if !profile_id_matches_loader_version(&id, mc_version, loader, loader_version) {
            continue;
        }
        let json_path = path.join(format!("{id}.json"));
        if !json_path.exists() {
            continue;
        }
        let raw = match fs::read_to_string(&json_path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let json: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let modified = fs::metadata(&json_path)
            .ok()
            .and_then(|m| m.modified().ok())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        // Legacy Forge installers occasionally emit sparse profile JSONs.
        loose_candidates.push((modified, id.clone()));
        let inherits = json
            .get("inheritsFrom")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if inherits != mc_version {
            continue;
        }
        candidates.push((modified, id));
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    if let Some((_, id)) = candidates.first() {
        return Some(id.clone());
    }
    loose_candidates.sort_by(|a, b| b.0.cmp(&a.0));
    loose_candidates.first().map(|(_, id)| id.clone())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> AppResult<()> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(into_error)?;
    let rd = fs::read_dir(src).map_err(into_error)?;
    for ent in rd.flatten() {
        let src_path = ent.path();
        let dst_path = dst.join(ent.file_name());
        let meta = match ent.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if meta.is_file() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent).map_err(into_error)?;
            }
            let _ = fs::copy(&src_path, &dst_path).map_err(into_error)?;
        }
    }
    Ok(())
}

fn default_minecraft_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            roots.push(PathBuf::from(appdata).join(".minecraft"));
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            roots.push(
                PathBuf::from(home)
                    .join("AppData")
                    .join("Roaming")
                    .join(".minecraft"),
            );
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            roots.push(
                PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("minecraft"),
            );
        }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        if let Ok(home) = std::env::var("HOME") {
            roots.push(PathBuf::from(home).join(".minecraft"));
        }
    }
    roots.sort();
    roots.dedup();
    roots
}

fn import_forge_profile_from_default_minecraft(
    versions_root: &Path,
    mc_version: &str,
    loader: &str,
    loader_version: &str,
) -> Option<String> {
    for root in default_minecraft_roots() {
        let src_versions = root.join("versions");
        if !src_versions.exists() {
            continue;
        }
        let Some(profile_id) =
            find_forge_like_profile_id(&src_versions, mc_version, loader, loader_version)
        else {
            continue;
        };
        let src_profile_dir = src_versions.join(&profile_id);
        if !src_profile_dir.exists() {
            continue;
        }
        let dst_profile_dir = versions_root.join(&profile_id);
        if copy_dir_recursive(&src_profile_dir, &dst_profile_dir).is_ok() {
            return Some(profile_id);
        }
    }
    None
}

fn install_forge_like_profile_from_installer(
    app: &tauri::AppHandle,
    installer_path: &Path,
    versions_root: &Path,
) -> AppResult<Option<String>> {
    if !installer_path.exists() {
        return Ok(None);
    }
    let file = fs::File::open(installer_path).map_err(into_error)?;
    let mut zip = ZipArchive::new(file).map_err(into_error)?;
    let mut profile_raw = String::new();
    {
        let mut entry = match zip.by_name("install_profile.json") {
            Ok(v) => v,
            Err(_) => return Ok(None),
        };
        entry.read_to_string(&mut profile_raw).map_err(into_error)?;
    }
    let profile: Value = serde_json::from_str(&profile_raw).map_err(into_error)?;
    let install = profile
        .get("install")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut embedded_version = if let Some(json_path) = profile
        .get("json")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let normalized = json_path.trim_start_matches('/').to_string();
        let mut version_raw = String::new();
        let mut entry = zip.by_name(&normalized).map_err(into_error)?;
        entry.read_to_string(&mut version_raw).map_err(into_error)?;
        serde_json::from_str::<Value>(&version_raw).map_err(into_error)?
    } else if let Some(version_info) = profile.get("versionInfo").cloned() {
        version_info
    } else {
        return Ok(None);
    };

    let target_id = embedded_version
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .or_else(|| {
            profile
                .get("version")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            install
                .get("target")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        })
        .ok_or_else(|| "forge-like installer missing version id".to_string())?;
    embedded_version["id"] = json!(target_id.clone());
    if embedded_version
        .get("type")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .is_none()
    {
        embedded_version["type"] = json!("release");
    }

    let vdir = versions_root.join(&target_id);
    fs::create_dir_all(&vdir).map_err(into_error)?;
    let out_json = vdir.join(format!("{target_id}.json"));
    fs::write(
        out_json,
        serde_json::to_string_pretty(&embedded_version).map_err(into_error)?,
    )
    .map_err(into_error)?;

    let maybe_file_path = install
        .get("filePath")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let maybe_maven_name = install
        .get("path")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if let (Some(file_path), Some(maven_name)) = (maybe_file_path, maybe_maven_name) {
        if let Some((rel_path, _, _)) = parse_maven_name(maven_name) {
            if let Ok(mut entry) = zip.by_name(file_path) {
                let mut bytes: Vec<u8> = Vec::new();
                entry.read_to_end(&mut bytes).map_err(into_error)?;
                if !bytes.is_empty() {
                    let lib_target = libraries_root(app)?.join(rel_path);
                    if let Some(parent) = lib_target.parent() {
                        fs::create_dir_all(parent).map_err(into_error)?;
                    }
                    fs::write(lib_target, bytes).map_err(into_error)?;
                }
            }
        }
    }

    Ok(Some(target_id))
}

fn load_profile_recursive(
    versions_root: &Path,
    version_id: &str,
    depth: usize,
) -> AppResult<Value> {
    if depth > 8 {
        return Err("launch: profile inheritance depth exceeded".to_string());
    }
    let path = version_json_path(versions_root, version_id);
    if !path.exists() {
        return Err(format!(
            "launch: profile json missing for {version_id} at {}",
            path.to_string_lossy()
        ));
    }
    let raw = fs::read_to_string(&path).map_err(into_error)?;
    let profile: Value = serde_json::from_str(&raw).map_err(into_error)?;
    if let Some(parent_id) = profile.get("inheritsFrom").and_then(|v| v.as_str()) {
        let parent = load_profile_recursive(versions_root, parent_id, depth + 1)?;
        Ok(merge_profiles(&parent, &profile))
    } else {
        Ok(profile)
    }
}

async fn download_file_if_missing(
    client: &reqwest::Client,
    url: &str,
    target: &Path,
) -> AppResult<()> {
    let skip = target.exists() && fs::metadata(target).map_err(into_error)?.len() > 0;
    if skip {
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(into_error)?;
    }
    let candidates = download_candidates(url);

    let mut last_err: Option<String> = None;
    for candidate in candidates {
        match client
            .get(&candidate)
            .header("user-agent", "FishbatteryLauncher/0.2.1")
            .send()
            .await
        {
            Ok(resp) => match resp.error_for_status() {
                Ok(ok) => {
                    let bytes = ok.bytes().await.map_err(into_error)?;
                    fs::write(target, &bytes).map_err(into_error)?;
                    return Ok(());
                }
                Err(err) => {
                    last_err = Some(into_error(err));
                }
            },
            Err(err) => {
                last_err = Some(into_error(err));
            }
        }
    }

    Err(last_err.unwrap_or_else(|| "download failed".to_string()))
}

fn classifier_key_for_os(lib: &Value) -> Option<String> {
    let os_name = launcher_os_name();
    let key = lib
        .get("natives")
        .and_then(|v| v.get(os_name))
        .and_then(|v| v.as_str())?
        .to_string();
    Some(key.replace("${arch}", launcher_arch_token()))
}

fn extract_native_jar(jar_path: &Path, natives_dir: &Path) -> AppResult<()> {
    let file = fs::File::open(jar_path).map_err(into_error)?;
    let mut archive = ZipArchive::new(file).map_err(into_error)?;
    for idx in 0..archive.len() {
        let mut entry = archive.by_index(idx).map_err(into_error)?;
        let name = entry.name().replace('\\', "/");
        if name.ends_with('/') {
            continue;
        }
        if name.starts_with("META-INF/") || name.eq_ignore_ascii_case("META-INF") {
            continue;
        }
        let out = natives_dir.join(name);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(into_error)?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(into_error)?;
        fs::write(out, buf).map_err(into_error)?;
    }
    Ok(())
}

fn parse_server_address(raw: &str) -> Option<(String, Option<u16>)> {
    let value = raw.trim();
    if value.is_empty() {
        return None;
    }
    if let Some(idx) = value.rfind(':') {
        if idx > 0 && idx < value.len() - 1 && !value.contains(']') {
            let host = value[..idx].trim().to_string();
            let port = value[idx + 1..].trim().parse::<u16>().ok();
            if !host.is_empty() {
                return Some((host, port));
            }
        }
    }
    Some((value.to_string(), None))
}

fn replace_tokens(input: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = input.to_string();
    for (k, v) in vars {
        out = out.replace(k, v);
    }
    if let Some(v) = out.strip_prefix("-DFabricMcEmu=") {
        return format!("-DFabricMcEmu={}", v.trim());
    }
    out
}

fn contains_unresolved_placeholder(input: &str) -> bool {
    input.contains("${") && input.contains('}')
}

fn sanitize_launch_args_for_log(args: &[String]) -> Vec<String> {
    let mut out = Vec::with_capacity(args.len());
    let mut redact_next = false;
    for arg in args {
        if redact_next {
            out.push("<redacted>".to_string());
            redact_next = false;
            continue;
        }
        if arg == "--accessToken" {
            out.push(arg.clone());
            redact_next = true;
            continue;
        }
        out.push(arg.clone());
    }
    out
}

fn trim_dangling_value_flags(args: Vec<String>) -> Vec<String> {
    const VALUE_FLAGS: &[&str] = &[
        "-cp",
        "-classpath",
        "--class-path",
        "-p",
        "--module-path",
        "--add-modules",
        "--add-opens",
        "--add-exports",
        "--add-reads",
        "--patch-module",
        "--limit-modules",
        "--upgrade-module-path",
    ];
    let mut out: Vec<String> = Vec::with_capacity(args.len());
    let mut i = 0usize;
    while i < args.len() {
        let cur = &args[i];
        let expects_value = VALUE_FLAGS.iter().any(|f| cur == f);
        if expects_value {
            let next = args.get(i + 1).cloned().unwrap_or_default();
            if next.is_empty() || next.starts_with('-') {
                i += 1;
                continue;
            }
        }
        out.push(cur.clone());
        i += 1;
    }
    out
}

fn sanitize_legacy_jvm_flags_for_java(
    args: Vec<String>,
    java_major: Option<u32>,
) -> (Vec<String>, Vec<String>) {
    let Some(major) = java_major else {
        return (args, Vec::new());
    };
    let mut removed: Vec<String> = Vec::new();
    let mut out: Vec<String> = Vec::with_capacity(args.len());
    for arg in args {
        let drop = (major >= 14
            && (arg == "-XX:+UseConcMarkSweepGC" || arg == "-XX:+CMSIncrementalMode"))
            || (major >= 9 && arg == "-Xverify:none")
            || (major < 23 && arg == "--sun-misc-unsafe-memory-access=allow");
        if drop {
            removed.push(arg);
            continue;
        }
        out.push(arg);
    }
    (out, removed)
}

fn update_instance_loader_field(
    app: &tauri::AppHandle,
    instance_id: &str,
    field: &str,
    value: &str,
) -> AppResult<()> {
    let mut db = read_instances_db(app)?;
    if let Some(inst) = find_instance_mut(&mut db, instance_id) {
        inst[field] = json!(value);
        db["updatedAt"] = json!(now_ms());
        write_instances_db(app, &db)?;
    }
    Ok(())
}

fn resolve_selected_local_cape_path(app: &tauri::AppHandle, account_id: &str) -> Option<PathBuf> {
    let selection_path = app_data_root(app)
        .ok()?
        .join("capes")
        .join("selection.json");
    let raw = fs::read_to_string(selection_path).ok()?;
    let json: Value = serde_json::from_str(&raw).ok()?;
    let selected = json
        .get("byAccountId")
        .and_then(|v| v.get(account_id))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    let catalog_path = app_data_root(app).ok()?.join("capes").join("catalog.json");
    let catalog_raw = fs::read_to_string(catalog_path).ok()?;
    let catalog: Value = serde_json::from_str(&catalog_raw).ok()?;
    let items = catalog.get("items").and_then(|v| v.as_array())?;
    let item = items
        .iter()
        .find(|entry| entry.get("id").and_then(|v| v.as_str()) == Some(selected.as_str()))?;
    let full_path = item.get("fullPath").and_then(|v| v.as_str())?.trim();
    if full_path.is_empty() {
        return None;
    }
    let path = PathBuf::from(full_path);
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

async fn install_quilt_profile(
    app: tauri::AppHandle,
    mc_version: &str,
    loader_version: &str,
) -> AppResult<String> {
    let _ = runtime_ops::vanilla_install(app.clone(), mc_version.to_string()).await?;
    let quilt_id = format!("quilt-loader-{loader_version}-{mc_version}");
    let profile_url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
        urlencoding::encode(mc_version),
        urlencoding::encode(loader_version)
    );
    let profile = reqwest::Client::new()
        .get(profile_url)
        .header("user-agent", "FishbatteryLauncher/0.2.1")
        .send()
        .await
        .map_err(into_error)?
        .error_for_status()
        .map_err(into_error)?
        .json::<Value>()
        .await
        .map_err(into_error)?;

    let vdir = versions_root(&app)?.join(&quilt_id);
    fs::create_dir_all(&vdir).map_err(into_error)?;
    let mut final_profile = profile;
    final_profile["id"] = json!(quilt_id.clone());
    final_profile["inheritsFrom"] = json!(mc_version);
    final_profile["jar"] = json!(mc_version);
    final_profile["type"] = json!("release");
    let out_json = vdir.join(format!("{quilt_id}.json"));
    fs::write(
        out_json,
        serde_json::to_string_pretty(&final_profile).map_err(into_error)?,
    )
    .map_err(into_error)?;

    let vanilla_jar = versions_root(&app)?
        .join(mc_version)
        .join(format!("{mc_version}.jar"));
    let out_jar = vdir.join(format!("{quilt_id}.jar"));
    if vanilla_jar.exists()
        && (!out_jar.exists() || fs::metadata(&out_jar).map_err(into_error)?.len() == 0)
    {
        fs::copy(vanilla_jar, out_jar).map_err(into_error)?;
    }

    Ok(quilt_id)
}

async fn resolve_launch_profile_id(
    app: tauri::AppHandle,
    java_exe: &str,
    instance_id: &str,
    instance: &Value,
) -> AppResult<(String, String)> {
    let mc_version = instance
        .get("mcVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "launch: instance mcVersion missing".to_string())?;
    let loader = instance
        .get("loader")
        .and_then(|v| v.as_str())
        .unwrap_or("vanilla")
        .trim()
        .to_ascii_lowercase();

    let _ = runtime_ops::vanilla_install(app.clone(), mc_version.clone()).await?;

    if loader == "fabric" {
        let loader_version = if let Some(v) = instance
            .get("fabricLoaderVersion")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            let normalized = runtime_ops::normalize_fabric_loader_version(&v);
            if normalized != v {
                update_instance_loader_field(&app, instance_id, "fabricLoaderVersion", &normalized)?;
            }
            normalized
        } else {
            let resolved =
                runtime_ops::loader_pick_version("fabric".to_string(), mc_version.clone())
                    .await?
                    .ok_or_else(|| "launch: failed to resolve Fabric loader version".to_string())?;
            update_instance_loader_field(&app, instance_id, "fabricLoaderVersion", &resolved)?;
            resolved
        };
        let _ = runtime_ops::fabric_install(
            app.clone(),
            instance_id.to_string(),
            mc_version.clone(),
            loader_version.clone(),
        )
        .await?;
        return Ok((
            format!("fabric-loader-{loader_version}-{mc_version}"),
            loader,
        ));
    }

    if loader == "quilt" {
        let loader_version = if let Some(v) = instance
            .get("quiltLoaderVersion")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            v
        } else {
            let resolved =
                runtime_ops::loader_pick_version("quilt".to_string(), mc_version.clone())
                    .await?
                    .ok_or_else(|| "launch: failed to resolve Quilt loader version".to_string())?;
            update_instance_loader_field(&app, instance_id, "quiltLoaderVersion", &resolved)?;
            resolved
        };
        let quilt_id = install_quilt_profile(app.clone(), &mc_version, &loader_version).await?;
        return Ok((quilt_id, loader));
    }

    if loader == "forge" || loader == "neoforge" {
        let field = if loader == "forge" {
            "forgeVersion"
        } else {
            "neoforgeVersion"
        };
        let loader_version = if let Some(v) = instance
            .get(field)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            v
        } else {
            let resolved = runtime_ops::loader_pick_version(loader.clone(), mc_version.clone())
                .await?
                .ok_or_else(|| format!("launch: failed to resolve {loader} version"))?;
            update_instance_loader_field(&app, instance_id, field, &resolved)?;
            resolved
        };

        let versions = versions_root(&app)?;
        let _ = emit_launch_log_app(
      &app,
      format!("[launcher] Resolving {loader} profile for mc={mc_version}, version={loader_version}"),
    );
        if let Some(found) =
            find_forge_like_profile_id(&versions, &mc_version, &loader, &loader_version)
        {
            let _ = emit_launch_log_app(
                &app,
                format!("[launcher] Reusing existing {loader} profile: {found}"),
            );
            return Ok((found, loader));
        }

        let install_res = runtime_ops::loader_install(
            app.clone(),
            instance_id.to_string(),
            mc_version.clone(),
            loader.clone(),
            Some(loader_version.clone()),
        )
        .await?;
        let installer_path = install_res
            .get("installerPath")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| format!("launch: {loader} installer path missing"))?;

        let minecraft_dir = runtime_data_root(&app)?;
        fs::create_dir_all(&minecraft_dir).map_err(into_error)?;
        ensure_launcher_profiles_stub(&minecraft_dir)?;
        let _ = emit_launch_log_app(
      &app,
      format!("[launcher] Running {loader} installer for mc={mc_version}, version={loader_version}"),
    );
        let mut installer_attempts: Vec<Vec<String>> = vec![vec![
            "-jar".to_string(),
            installer_path.clone(),
            "--installClient".to_string(),
            minecraft_dir.to_string_lossy().to_string(),
        ]];
        if loader == "forge" {
            if let Some((major, minor, _)) = parse_mc_semver_triplet(&mc_version) {
                if major == 1 && minor <= 12 {
                    installer_attempts.push(vec![
                        "-jar".to_string(),
                        installer_path.clone(),
                        "--installClient".to_string(),
                    ]);
                    installer_attempts.push(vec![
                        "-jar".to_string(),
                        installer_path.clone(),
                        "-installClient".to_string(),
                    ]);
                    installer_attempts.push(vec![
                        "-jar".to_string(),
                        installer_path.clone(),
                        "-installClient".to_string(),
                        minecraft_dir.to_string_lossy().to_string(),
                    ]);
                    installer_attempts.push(vec![
                        "-jar".to_string(),
                        installer_path.clone(),
                        "--install-client".to_string(),
                    ]);
                    installer_attempts.push(vec![
                        "-jar".to_string(),
                        installer_path.clone(),
                        "--install-client".to_string(),
                        minecraft_dir.to_string_lossy().to_string(),
                    ]);
                    installer_attempts.push(vec![
                        "-jar".to_string(),
                        installer_path.clone(),
                        "client".to_string(),
                    ]);
                }
            }
        }

        let mut install_ok = false;
        let mut last_error_msg = String::new();
        for args in installer_attempts {
            let mut installer_cmd = Command::new(java_exe);
            installer_cmd.args(&args).current_dir(&minecraft_dir);
            hide_console_window(&mut installer_cmd);
            let out = installer_cmd.output().map_err(into_error)?;
            if out.status.success() {
                if let Some(found) =
                    find_forge_like_profile_id(&versions, &mc_version, &loader, &loader_version)
                {
                    let _ = emit_launch_log_app(
                        &app,
                        format!("[launcher] Installed {loader} profile: {found}"),
                    );
                    install_ok = true;
                    break;
                }
                if let Some(imported) = import_forge_profile_from_default_minecraft(
                    &versions,
                    &mc_version,
                    &loader,
                    &loader_version,
                ) {
                    let _ = emit_launch_log_app(
                        &app,
                        format!(
              "[launcher] Imported {loader} profile from default .minecraft: {imported}"
            ),
                    );
                    install_ok = true;
                    break;
                }
                if let Ok(Some(generated)) = install_forge_like_profile_from_installer(
                    &app,
                    Path::new(&installer_path),
                    &versions,
                ) {
                    let _ = emit_launch_log_app(
            &app,
            format!("[launcher] Generated {loader} profile from installer metadata: {generated}"),
          );
                    install_ok = true;
                    break;
                }
                last_error_msg =
                    "installer completed but no launch profile was generated".to_string();
                let _ = emit_launch_log_app(
                    &app,
                    format!(
                        "[launcher] {loader} installer completed without profile: {}",
                        args.join(" ")
                    ),
                );
                continue;
            }
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let msg = if !stderr.is_empty() { stderr } else { stdout };
            last_error_msg = msg;
            let _ = emit_launch_log_app(
                &app,
                if last_error_msg.is_empty() {
                    format!(
                        "[launcher] {loader} installer attempt failed: {}",
                        args.join(" ")
                    )
                } else {
                    format!(
                        "[launcher] {loader} installer attempt failed: {} :: {}",
                        args.join(" "),
                        last_error_msg
                    )
                },
            );
        }
        if !install_ok {
            let msg = if last_error_msg.is_empty() {
                "installer failed with unknown error".to_string()
            } else {
                last_error_msg
            };
            let _ =
                emit_launch_log_app(&app, format!("[launcher] {loader} installer failed: {msg}"));
            return Err(format!("launch: {loader} installer failed: {msg}"));
        }

        if let Some(found) =
            find_forge_like_profile_id(&versions, &mc_version, &loader, &loader_version)
        {
            let _ = emit_launch_log_app(
                &app,
                format!("[launcher] Installed {loader} profile: {found}"),
            );
            return Ok((found, loader));
        }
        return Err(format!(
      "launch: {loader} profile generation failed for mc={mc_version}, version={loader_version}"
    ));
    }

    Ok((mc_version, loader))
}

#[command]
pub async fn launch(
    app: tauri::AppHandle,
    window: Window,
    instance_id: String,
    account_id: String,
    runtime_prefs: Option<Value>,
) -> AppResult<Value> {
    let safe_instance_id = validate_id(&instance_id, "launch")?;
    let safe_account_id = validate_id(&account_id, "launch")?;

    let db = read_instances_db(&app)?;
    let inst = find_instance(&db, &safe_instance_id)
        .ok_or_else(|| "launch: instance not found".to_string())?;
    if !account_exists(&app, &safe_account_id) {
        return Err("launch: account not found".to_string());
    }

    {
        let state = app.state::<AppState>();
        let launches = state
            .launch_processes
            .lock()
            .map_err(|_| "launch: process state lock poisoned".to_string())?;
        if launches.contains_key(&safe_instance_id) {
            return Ok(json!({ "ok": false, "error": "launch: instance already running" }));
        }
    }

    let mc_version_opt = inst
        .get("mcVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let _ = emit_launch_log(
        &window,
        format!(
            "[launcher] Starting launch for instance {}",
            safe_instance_id
        ),
    );
    if let Some(prefs) = runtime_prefs.as_ref() {
        if let Some(server) = prefs.get("serverAddress").and_then(|v| v.as_str()) {
            let server = server.trim();
            if !server.is_empty() {
                let _ = emit_launch_log(&window, format!("[launcher] Server target: {server}"));
            }
        }
    }

    let bridge = runtime_ops::mods_sync_bridge(
        app.clone(),
        safe_instance_id.clone(),
        mc_version_opt.clone(),
    )
    .await;
    match bridge {
        Ok(result) => {
            if result
                .get("installed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                let asset = result
                    .get("assetName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("bridge asset");
                let _ = emit_launch_log(&window, format!("[capes] Bridge sync installed: {asset}"));
            }
            if result
                .get("skipped")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                let reason = result
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let _ = emit_launch_log(&window, format!("[capes] Bridge sync skipped: {reason}"));
            }
        }
        Err(err) => {
            let supported = mc_version_opt
                .as_deref()
                .map(bridge_supported_mc_version)
                .unwrap_or(false);
            let loader = inst
                .get("loader")
                .and_then(|v| v.as_str())
                .unwrap_or("fabric")
                .trim()
                .to_ascii_lowercase();
            // Bridge is only required for modern Fabric launches.
            if supported && loader == "fabric" {
                let _ = emit_launch_log(
                    &window,
                    format!("[launcher] Bridge sync failed (required): {err}"),
                );
                return Ok(
                    json!({ "ok": false, "error": format!("launch: bridge sync failed: {err}") }),
                );
            }
            let _ = emit_launch_log(
                &window,
                format!("[capes] Bridge sync failed (non-fatal): {err}"),
            );
        }
    }

    if let Some(primary_major) = preferred_java_majors(mc_version_opt.as_deref())
        .first()
        .copied()
    {
        let bundled_has_primary = has_java_major_in_bundled_roots(&app, primary_major);
        let path_is_primary = probe_java_major("java") == Some(primary_major);
        if !bundled_has_primary && !path_is_primary {
            match ensure_java_major_runtime_available(&app, &window, primary_major).await {
                Ok(_) => {
                    let _ = emit_launch_log(
                        &window,
                        format!("[launcher] Prepared managed Java {} runtime", primary_major),
                    );
                }
                Err(err) => {
                    let _ = emit_launch_log(
                        &window,
                        format!(
                            "[launcher] Java {} managed runtime preparation failed (non-fatal): {}",
                            primary_major, err
                        ),
                    );
                }
            }
        }
    }

    let mut resolved = resolve_java_executable(&app, mc_version_opt.as_deref());
    let requested_memory_mb = inst
        .get("memoryMb")
        .and_then(|v| v.as_u64())
        .unwrap_or(4096);
    if let Some(mc) = mc_version_opt.as_deref() {
        if mc_requires_java8(mc) {
            let picked_major = probe_java_major(&resolved.0);
            if picked_major != Some(8) {
                match ensure_java8_runtime_available(&app, &window).await {
                    Ok(_) => {
                        resolved = resolve_java_executable(&app, mc_version_opt.as_deref());
                    }
                    Err(err) => {
                        let _ = emit_launch_log(
                            &window,
                            format!("[launcher] Java 8 auto-download failed: {err}"),
                        );
                    }
                }
            }
            // Legacy + high memory: require a 64-bit Java 8 runtime.
            if requested_memory_mb > 1024 && is_likely_32bit_java(&resolved.0) {
                let _ = emit_launch_log(
          &window,
          "[launcher] 32-bit Java detected for legacy instance with >1GB memory request; attempting 64-bit Java 8 runtime".to_string(),
        );
                let _ = ensure_java8_runtime_available(&app, &window).await;
                resolved = resolve_java_executable(&app, mc_version_opt.as_deref());
                if is_likely_32bit_java(&resolved.0) {
                    let msg = format!(
            "launch: 32-bit Java 8 runtime selected, but this instance requests {}M. Install 64-bit Java 8 (or keep launcher-managed Java 8 x64) to use >1024M.",
            requested_memory_mb
          );
                    let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
                    return Ok(json!({ "ok": false, "error": msg }));
                }
            }
        }
    }
    let (java_exe, bundled, java_label) = resolved;
    if bundled {
        let _ = emit_launch_log(
            &window,
            format!("[launcher] Using bundled Java {java_label}: {java_exe}"),
        );
    } else {
        let _ = emit_launch_log(
            &window,
            "[launcher] No bundled Java found; using PATH java".to_string(),
        );
    }
    let mut java_check_cmd = Command::new(&java_exe);
    java_check_cmd.arg("-version");
    hide_console_window(&mut java_check_cmd);
    match java_check_cmd.output() {
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !stderr.is_empty() {
                let first = stderr.lines().next().unwrap_or("");
                let _ = emit_launch_log(&window, format!("[launcher] Java runtime check: {first}"));
            } else if !stdout.is_empty() {
                let first = stdout.lines().next().unwrap_or("");
                let _ = emit_launch_log(&window, format!("[launcher] Java runtime check: {first}"));
            }
            if !out.status.success() {
                return Ok(json!({ "ok": false, "error": "launch: Java runtime check failed" }));
            }
        }
        Err(err) => {
            return Ok(
                json!({ "ok": false, "error": format!("launch: failed to run java ({err})") }),
            );
        }
    }

    let (profile_id, loader_kind) =
        match resolve_launch_profile_id(app.clone(), &java_exe, &safe_instance_id, inst).await {
            Ok(v) => v,
            Err(err) => {
                let _ = emit_launch_log(
                    &window,
                    format!("[launcher] Launch preparation failed: {err}"),
                );
                return Ok(json!({ "ok": false, "error": err }));
            }
        };
    let mc_version = inst
        .get("mcVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "launch: instance mcVersion missing".to_string())?;
    let _ = emit_launch_log(
        &window,
        format!(
            "[launcher] Resolved profile: {profile_id} (loader={loader_kind}, mc={mc_version})"
        ),
    );
    let java_major = probe_java_major(&java_exe);
    if let Some(v) = java_major {
        let _ = emit_launch_log(&window, format!("[launcher] Java major runtime: {v}"));
        if mc_requires_java8(&mc_version) && v != 8 {
            let msg = format!(
        "launch: Minecraft {} with legacy Forge requires Java 8, but resolved Java {}. Install Java 8 (x64 preferred; x86 supported) or set JAVA8_HOME.",
        mc_version, v
      );
            let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
            return Ok(json!({ "ok": false, "error": msg }));
        }
        if let Some((major, minor, _)) = parse_mc_semver_triplet(&mc_version) {
            if major == 1 && minor <= 16 && v >= 17 {
                let _ = emit_launch_log(
                    &window,
                    format!(
            "[launcher] Warning: Minecraft {} usually expects Java 8; current runtime is Java {}",
            mc_version, v
          ),
                );
            }
        }
    }

    let pre_launch = runtime_prefs
        .as_ref()
        .and_then(|p| p.get("preLaunch"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let post_exit = runtime_prefs
        .as_ref()
        .and_then(|p| p.get("postExit"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let jvm_args = runtime_prefs
        .as_ref()
        .and_then(|p| p.get("jvmArgs"))
        .and_then(|v| v.as_str())
        .map(split_shell_words)
        .unwrap_or_default();
    let mut runtime_jvm_args = jvm_args;

    if let Some(cmd) = pre_launch.as_deref() {
        if let Err(err) = run_hook_command("pre-launch", cmd, &app) {
            let _ = emit_launch_log(&window, format!("[hook] pre-launch hook failed: {err}"));
            return Ok(
                json!({ "ok": false, "error": format!("launch: pre-launch hook failed: {err}") }),
            );
        }
    }

    let versions_dir = versions_root(&app)?;
    let libraries_dir = libraries_root(&app)?;
    let assets_dir = assets_root(&app)?;
    let game_dir = instance_dir(&app, &safe_instance_id)?;
    ensure_instance_dirs(&game_dir)?;
    fs::create_dir_all(&versions_dir).map_err(into_error)?;
    fs::create_dir_all(&libraries_dir).map_err(into_error)?;
    fs::create_dir_all(assets_dir.join("indexes")).map_err(into_error)?;
    fs::create_dir_all(assets_dir.join("objects")).map_err(into_error)?;

    let mut profile = match load_profile_recursive(&versions_dir, &profile_id, 0) {
        Ok(p) => p,
        Err(err) => {
            let _ = emit_launch_log(
                &window,
                format!("[launcher] Failed to load merged profile: {err}"),
            );
            return Ok(json!({ "ok": false, "error": err }));
        }
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(into_error)?;
    let mut classpath_entries: Vec<String> = Vec::new();
    let natives_dir = game_dir.join(".natives");
    let mut launch_features: HashMap<&str, bool> = HashMap::new();
    launch_features.insert("is_demo_user", false);
    launch_features.insert("has_custom_resolution", false);
    launch_features.insert("has_quick_plays_support", false);
    launch_features.insert("is_quick_play_singleplayer", false);
    launch_features.insert("is_quick_play_multiplayer", false);
    launch_features.insert("is_quick_play_realms", false);
    if natives_dir.exists() {
        let _ = fs::remove_dir_all(&natives_dir);
    }
    fs::create_dir_all(&natives_dir).map_err(into_error)?;

    let _ = emit_launch_log(&window, "[launcher] Preparing libraries".to_string());
    if let Some(libs) = profile.get_mut("libraries").and_then(|v| v.as_array_mut()) {
        for lib in libs.iter_mut() {
            if !rules_allow(lib, &launch_features) {
                continue;
            }
            ensure_library_download_fields(lib);
            if let (Some(path), Some(url)) = (
                lib.get("downloads")
                    .and_then(|v| v.get("artifact"))
                    .and_then(|v| v.get("path"))
                    .and_then(|v| v.as_str()),
                lib.get("downloads")
                    .and_then(|v| v.get("artifact"))
                    .and_then(|v| v.get("url"))
                    .and_then(|v| v.as_str()),
            ) {
                let target = libraries_dir.join(path);
                if let Err(err) = download_file_if_missing(&client, url, &target).await {
                    let name = lib
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown-library");
                    let msg =
                        format!("launch: failed downloading library {name} from {url}: {err}");
                    let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
                    return Ok(json!({ "ok": false, "error": msg }));
                }
                classpath_entries.push(target.to_string_lossy().to_string());
            }
            if let Some(classifier_key) = classifier_key_for_os(lib) {
                if let (Some(path), Some(url)) = (
                    lib.get("downloads")
                        .and_then(|v| v.get("classifiers"))
                        .and_then(|v| v.get(&classifier_key))
                        .and_then(|v| v.get("path"))
                        .and_then(|v| v.as_str()),
                    lib.get("downloads")
                        .and_then(|v| v.get("classifiers"))
                        .and_then(|v| v.get(&classifier_key))
                        .and_then(|v| v.get("url"))
                        .and_then(|v| v.as_str()),
                ) {
                    let native_jar = libraries_dir.join(path);
                    if let Err(err) = download_file_if_missing(&client, url, &native_jar).await {
                        let msg =
                            format!("launch: failed downloading native library from {url}: {err}");
                        let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
                        return Ok(json!({ "ok": false, "error": msg }));
                    }
                    if let Err(err) = extract_native_jar(&native_jar, &natives_dir) {
                        let msg = format!(
                            "launch: failed extracting native jar {}: {}",
                            native_jar.to_string_lossy(),
                            err
                        );
                        let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
                        return Ok(json!({ "ok": false, "error": msg }));
                    }
                }
            }
        }
    }
    let _ = emit_launch_log(&window, "[launcher] Libraries ready".to_string());

    let jar_id = profile
        .get("jar")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| profile_id.clone());
    let client_jar = versions_dir.join(&jar_id).join(format!("{jar_id}.jar"));
    let _ = emit_launch_log(&window, "[launcher] Preparing client jar".to_string());
    if !client_jar.exists() || fs::metadata(&client_jar).map_err(into_error)?.len() == 0 {
        let client_url = profile
            .get("downloads")
            .and_then(|v| v.get("client"))
            .and_then(|v| v.get("url"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "launch: merged profile missing downloads.client.url".to_string())?;
        if let Err(err) = download_file_if_missing(&client, client_url, &client_jar).await {
            let _ = emit_launch_log(
                &window,
                format!("[launcher] Failed downloading client jar: {err}"),
            );
            return Ok(
                json!({ "ok": false, "error": format!("launch: failed downloading client jar ({err})") }),
            );
        }
    }
    classpath_entries.push(client_jar.to_string_lossy().to_string());
    let _ = emit_launch_log(&window, "[launcher] Client jar ready".to_string());

    let asset_index_id = profile
        .get("assetIndex")
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_str())
        .or_else(|| profile.get("assets").and_then(|v| v.as_str()))
        .unwrap_or("legacy")
        .to_string();
    let asset_index_path = assets_dir
        .join("indexes")
        .join(format!("{asset_index_id}.json"));
    let _ = emit_launch_log(&window, "[launcher] Preparing assets".to_string());
    if !asset_index_path.exists() || fs::metadata(&asset_index_path).map_err(into_error)?.len() == 0
    {
        if let Some(url) = profile
            .get("assetIndex")
            .and_then(|v| v.get("url"))
            .and_then(|v| v.as_str())
        {
            if let Err(err) = download_file_if_missing(&client, url, &asset_index_path).await {
                let msg = format!(
                    "launch: failed downloading asset index {asset_index_id} from {url}: {err}"
                );
                let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
                return Ok(json!({ "ok": false, "error": msg }));
            }
        }
    }
    if asset_index_path.exists() {
        let raw = fs::read_to_string(&asset_index_path).map_err(into_error)?;
        if let Ok(idx_json) = serde_json::from_str::<Value>(&raw) {
            if let Some(objects) = idx_json.get("objects").and_then(|v| v.as_object()) {
                for (_, obj) in objects {
                    let hash = obj
                        .get("hash")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim();
                    if hash.len() < 2 {
                        continue;
                    }
                    let sub = &hash[..2];
                    let target = assets_dir.join("objects").join(sub).join(hash);
                    if target.exists() && fs::metadata(&target).map_err(into_error)?.len() > 0 {
                        continue;
                    }
                    let url = format!("https://resources.download.minecraft.net/{sub}/{hash}");
                    if let Err(err) = download_file_if_missing(&client, &url, &target).await {
                        let msg = format!("launch: failed downloading asset object {hash}: {err}");
                        let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
                        return Ok(json!({ "ok": false, "error": msg }));
                    }
                }
            }
        }
    }
    let _ = emit_launch_log(&window, "[launcher] Assets ready".to_string());

    let _ = emit_launch_log(&window, "[launcher] Refreshing account session".to_string());
    let refreshed_account = match accounts_capes::refresh_account_session(&app, &safe_account_id).await {
        Ok(account) => account,
        Err(err) => {
            let _ = emit_launch_log(
                &window,
                format!("[launcher] Account refresh failed: {err}"),
            );
            return Ok(json!({ "ok": false, "error": err }));
        }
    };
    let auth = refreshed_account.mclc_auth;
    let _ = emit_launch_log(&window, "[launcher] Account auth ready".to_string());
    let access_token = auth
        .get("access_token")
        .and_then(|v| v.as_str())
        .or_else(|| auth.get("accessToken").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| "launch: auth missing access_token".to_string())?;
    let auth_uuid = auth
        .get("uuid")
        .and_then(|v| v.as_str())
        .or_else(|| auth.get("id").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| "launch: auth missing uuid".to_string())?;
    let auth_name = auth
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| auth.get("username").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| "launch: auth missing name".to_string())?;
    let auth_xuid = auth
        .get("meta")
        .and_then(|v| v.get("xuid"))
        .and_then(|v| v.as_str())
        .or_else(|| auth.get("xuid").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();
    let user_properties = auth
        .get("user_properties")
        .cloned()
        .unwrap_or_else(|| json!({}))
        .to_string();

    let cp_sep = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let classpath = classpath_entries.join(cp_sep);
    let memory_mb = inst
        .get("memoryMb")
        .and_then(|v| v.as_u64())
        .unwrap_or(4096);
    let java_is_32bit = is_likely_32bit_java(&java_exe);
    let effective_memory_mb = if java_is_32bit {
        memory_mb.min(1024)
    } else {
        memory_mb
    };

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("${auth_player_name}", auth_name.clone());
    vars.insert("${version_name}", profile_id.clone());
    vars.insert("${game_directory}", game_dir.to_string_lossy().to_string());
    vars.insert("${assets_root}", assets_dir.to_string_lossy().to_string());
    vars.insert(
        "${library_directory}",
        libraries_dir.to_string_lossy().to_string(),
    );
    vars.insert("${assets_index_name}", asset_index_id.clone());
    vars.insert("${auth_uuid}", auth_uuid.clone());
    vars.insert("${auth_access_token}", access_token.clone());
    vars.insert("${auth_session}", access_token.clone());
    vars.insert("${user_type}", "msa".to_string());
    vars.insert("${user_properties}", user_properties);
    vars.insert("${version_type}", "release".to_string());
    vars.insert(
        "${natives_directory}",
        natives_dir.to_string_lossy().to_string(),
    );
    vars.insert("${launcher_name}", "Fishbattery".to_string());
    vars.insert("${launcher_version}", "0.2.1".to_string());
    vars.insert("${classpath_separator}", cp_sep.to_string());
    vars.insert("${classpath}", classpath.clone());
    vars.insert("${auth_xuid}", auth_xuid);
    vars.insert("${clientid}", "".to_string());

    if let Some(selected_cape) = resolve_selected_local_cape_path(&app, &safe_account_id) {
        let cape_dir = game_dir.join(".fishbattery");
        fs::create_dir_all(&cape_dir).map_err(into_error)?;
        let file_name = selected_cape
            .file_name()
            .and_then(|x| x.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "selected-cape.png".to_string());
        let dest = cape_dir.join(file_name);
        fs::copy(&selected_cape, &dest).map_err(into_error)?;
        let dest_text = dest.to_string_lossy().to_string();
        runtime_jvm_args.push(format!("-Dfishbattery.cape.path={dest_text}"));
        runtime_jvm_args.push(format!("-Dfishbattery.launcherPlayer.uuid={auth_uuid}"));
        let _ = emit_launch_log(
            &window,
            format!("[capes] Injected launcher cape: {dest_text}"),
        );
        let _ = emit_launch_log(
            &window,
            format!("[capes] Bound launcher cape to local player UUID: {auth_uuid}"),
        );
        let sig_path = selected_cape.with_extension(format!(
            "{}.sig",
            selected_cape
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
        ));
        if sig_path.exists() {
            if let Ok(sig_raw) = fs::read_to_string(&sig_path) {
                let sig = sig_raw.trim().to_string();
                if !sig.is_empty() {
                    runtime_jvm_args.push(format!("-Dfishbattery.cape.sig={sig}"));
                    let _ = emit_launch_log(
                        &window,
                        "[capes] Attached launcher cape signature".to_string(),
                    );
                }
            }
        }
    } else {
        let _ = emit_launch_log(
            &window,
            "[capes] No local launcher cape selected for this account".to_string(),
        );
    }

    let mut resolved_jvm_args: Vec<String> = Vec::new();
    if let Some(arr) = profile
        .get("arguments")
        .and_then(|v| v.get("jvm"))
        .and_then(|v| v.as_array())
    {
        for item in arr {
            let replaced = collect_argument_values(item, &launch_features)
                .into_iter()
                .map(|v| replace_tokens(&v, &vars))
                .collect::<Vec<String>>();
            if replaced.iter().any(|v| contains_unresolved_placeholder(v)) {
                continue;
            }
            resolved_jvm_args.extend(replaced);
        }
    }
    if !resolved_jvm_args.iter().any(|x| x.starts_with("-Xmx")) {
        resolved_jvm_args.push(format!("-Xmx{}M", effective_memory_mb.max(512)));
    }
    if !resolved_jvm_args.iter().any(|x| x.starts_with("-Xms")) {
        let min_heap = if java_is_32bit { 512 } else { 1024 };
        resolved_jvm_args.push(format!("-Xms{}M", min_heap));
    }
    if java_is_32bit {
        let _ = emit_launch_log(
      &window,
      format!(
        "[launcher] Detected 32-bit Java runtime; requested memory={}M, applied memory={}M. Install 64-bit Java 8 to use higher memory for Minecraft {}.",
        memory_mb,
        effective_memory_mb.max(512),
        mc_version
      ),
    );
    }

    // Legacy profiles (e.g. 1.12.x) often have no arguments.jvm block.
    // Ensure classpath/native defaults are present so launchwrapper/mainClass can resolve.
    let has_classpath_flag = resolved_jvm_args
        .iter()
        .any(|x| x == "-cp" || x == "-classpath" || x == "--class-path");
    if !has_classpath_flag {
        resolved_jvm_args.push(format!(
            "-Djava.library.path={}",
            natives_dir.to_string_lossy()
        ));
        resolved_jvm_args.push("-cp".to_string());
        resolved_jvm_args.push(classpath.clone());
    }

    resolved_jvm_args.extend(runtime_jvm_args);
    resolved_jvm_args = trim_dangling_value_flags(resolved_jvm_args);
    let (sanitized_jvm_args, removed_flags) =
        sanitize_legacy_jvm_flags_for_java(resolved_jvm_args, java_major);
    resolved_jvm_args = sanitized_jvm_args;
    if !removed_flags.is_empty() {
        let _ = emit_launch_log(
            &window,
            format!(
                "[launcher] Removed incompatible JVM flags for Java {}: {}",
                java_major.unwrap_or_default(),
                removed_flags.join(" ")
            ),
        );
    }

    let mut game_args: Vec<String> = Vec::new();
    if let Some(arr) = profile
        .get("arguments")
        .and_then(|v| v.get("game"))
        .and_then(|v| v.as_array())
    {
        for item in arr {
            let replaced = collect_argument_values(item, &launch_features)
                .into_iter()
                .map(|v| replace_tokens(&v, &vars))
                .collect::<Vec<String>>();
            if replaced.iter().any(|v| contains_unresolved_placeholder(v)) {
                continue;
            }
            game_args.extend(replaced);
        }
    } else if let Some(legacy) = profile.get("minecraftArguments").and_then(|v| v.as_str()) {
        for token in split_shell_words(legacy) {
            let replaced = replace_tokens(&token, &vars);
            if contains_unresolved_placeholder(&replaced) {
                continue;
            }
            game_args.push(replaced);
        }
    }
    if let Some(server_raw) = runtime_prefs
        .as_ref()
        .and_then(|p| p.get("serverAddress"))
        .and_then(|v| v.as_str())
    {
        if let Some((host, port)) = parse_server_address(server_raw) {
            game_args.push("--server".to_string());
            game_args.push(host);
            if let Some(p) = port {
                game_args.push("--port".to_string());
                game_args.push(p.to_string());
            }
        }
    }

    let main_class = profile
        .get("mainClass")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "launch: merged profile missing mainClass".to_string())?
        .to_string();

    let mut args: Vec<String> = Vec::new();
    args.extend(resolved_jvm_args);
    args.push(main_class);
    args.extend(game_args);
    let safe_args = sanitize_launch_args_for_log(&args);
    let _ = emit_launch_log(
        &window,
        format!(
            "[launcher] Launch command: {} {}",
            java_exe,
            safe_args.join(" ")
        ),
    );

    let mut launch_cmd = Command::new(&java_exe);
    launch_cmd
        .args(&args)
        .current_dir(&game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut launch_cmd);

    let mut child = match launch_cmd.spawn() {
        Ok(c) => c,
        Err(err) => {
            let msg = format!("launch: failed to spawn java process ({err})");
            let _ = emit_launch_log(&window, format!("[launcher] {msg}"));
            return Ok(json!({ "ok": false, "error": msg }));
        }
    };
    let pid = child.id();

    {
        let state = app.state::<AppState>();
        let mut launches = state
            .launch_processes
            .lock()
            .map_err(|_| "launch: process state lock poisoned".to_string())?;
        launches.insert(safe_instance_id.clone(), pid);
    }

    let app_out = app.clone();
    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    let _ = emit_launch_log_app(&app_out, line);
                }
            }
        });
    }

    let app_err = app.clone();
    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    logs::append_stderr_line(&app_err, &line);
                    let _ = emit_launch_log_app(&app_err, line);
                }
            }
        });
    }

    let app_wait = app.clone();
    let instance_wait = safe_instance_id.clone();
    thread::spawn(move || {
        let status = child.wait().ok();
        let code = status.and_then(|s| s.code()).unwrap_or(-1);
        let _ = emit_launch_log_app(&app_wait, format!("[launcher] Game exited (code {code})"));

        if let Some(cmd) = post_exit.as_deref() {
            if let Err(err) = run_hook_command("post-exit", cmd, &app_wait) {
                let _ =
                    emit_launch_log_app(&app_wait, format!("[hook] post-exit hook failed: {err}"));
            }
        }

        if let Ok(mut launches) = app_wait.state::<AppState>().launch_processes.lock() {
            launches.remove(&instance_wait);
        }
    });

    Ok(json!({ "ok": true, "pid": pid }))
}

#[command]
pub fn launch_is_running(app: tauri::AppHandle, instance_id: String) -> AppResult<bool> {
    let safe_instance_id = validate_id(&instance_id, "launch:isRunning")?;
    let state = app.state::<AppState>();
    let launches = state
        .launch_processes
        .lock()
        .map_err(|_| "launch:isRunning: process state lock poisoned".to_string())?;
    Ok(launches.contains_key(&safe_instance_id))
}

#[command]
pub fn launch_stop(app: tauri::AppHandle, instance_id: String) -> AppResult<bool> {
    let safe_instance_id = validate_id(&instance_id, "launch:stop")?;
    let state = app.state::<AppState>();
    let mut launches = state
        .launch_processes
        .lock()
        .map_err(|_| "launch:stop: process state lock poisoned".to_string())?;
    let pid = launches.remove(&safe_instance_id);
    if let Some(pid) = pid {
        return Ok(kill_pid(pid));
    }
    Ok(false)
}

#[command]
pub fn launch_diagnose(instance_id: String, lines: Vec<String>) -> AppResult<Value> {
    let _ = validate_id(&instance_id, "launch:diagnose")?;
    let recent = tail(&lines, 180);
    let full = recent.join("\n").to_ascii_lowercase();

    if has_any(
        &full,
        &[
            "fabric install incomplete",
            "no such file or directory",
            "fabric-loader",
            "failed to find fabric",
            "missing fabric",
        ],
    ) {
        return Ok(json!({
          "code": "missing-fabric-loader",
          "severity": "critical",
          "summary": "Fabric loader files are missing or incomplete.",
          "details": ["Launcher could not find required Fabric runtime files for this instance."],
          "recommendedActions": [
            "Run the automatic fix to reinstall Fabric for this Minecraft version.",
            "Then retry launch."
          ],
          "fixAction": "install-fabric-loader",
          "canAutoFix": true
        }));
    }

    if has_any(
        &full,
        &[
            "duplicate mods",
            "duplicate mod",
            "duplicate id",
            "duplicatemodsfoundexception",
        ],
    ) {
        return Ok(json!({
          "code": "duplicate-mods",
          "severity": "critical",
          "summary": "Duplicate mod jars were detected.",
          "details": ["Two or more files expose the same mod id and Fabric refuses to start."],
          "recommendedActions": [
            "Run automatic duplicate cleanup.",
            "Review local mod files and keep one version of each mod."
          ],
          "fixAction": "fix-duplicate-mods",
          "canAutoFix": true
        }));
    }

    if has_any(
        &full,
        &[
            "installer completed but no launch profile was generated",
            "installer completed without profile",
            "profile generation failed",
            "neoforge installer failed",
            "forge installer failed",
        ],
    ) {
        return Ok(json!({
          "code": "loader-profile-missing",
          "severity": "critical",
          "summary": "The loader installer finished, but no launch profile was created.",
          "details": [
            "Forge or NeoForge installer output did not produce a usable version profile for Minecraft.",
            "This can happen when the installer writes incomplete metadata or generates the profile in a different Minecraft directory."
          ],
          "recommendedActions": [
            "Retry the launch once to confirm the failure is reproducible.",
            "If vanilla Minecraft is installed separately, launch it once and retry so any default .minecraft metadata exists.",
            "Export diagnostics if the issue persists so the installer output can be inspected."
          ],
          "fixAction": "none",
          "canAutoFix": false
        }));
    }

    if has_any(
        &full,
        &[
            "unsupportedclassversionerror",
            "class file version",
            "java runtime only recognizes class file versions up to",
            "requires java",
        ],
    ) {
        return Ok(json!({
          "code": "wrong-java-version",
          "severity": "critical",
          "summary": "Installed Java version is not compatible with this instance.",
          "details": ["Minecraft/Fabric requested a newer Java runtime than the one currently used."],
          "recommendedActions": [
            "Use bundled Java 21 (default in Fishbattery releases).",
            "If needed, reinstall launcher runtime or remove incompatible custom JVM setup."
          ],
          "fixAction": "none",
          "canAutoFix": false
        }));
    }

    if has_any(
        &full,
        &[
            "noclassdeffounderror",
            "classnotfoundexception",
            "could not execute entrypoint stage",
            "recommends any version of cloth-config, which is missing",
            "requires any version of cloth-config, which is missing",
            "incompatible",
            "depends on",
            "requires minecraft",
            "could not resolve mod",
            "modresolutionexception",
        ],
    ) {
        return Ok(json!({
          "code": "mod-mismatch",
          "severity": "critical",
          "summary": "One or more mods are missing required dependencies or are incompatible.",
          "details": ["At least one enabled mod could not load due to missing classes/dependencies or version mismatch."],
          "recommendedActions": [
            "Install the missing dependency for the failing mod (example: Cloth Config for mods that require AutoConfig).",
            "Disable or replace incompatible mods if needed.",
            "Use automatic mod refresh for catalog-managed mods."
          ],
          "fixAction": "none",
          "canAutoFix": false
        }));
    }

    Ok(json!({
      "code": "unknown",
      "severity": "warning",
      "summary": "No known failure signature detected.",
      "details": ["Keep raw logs for manual debugging. Use Diagnostics export if you need support."],
      "recommendedActions": ["Review recent logs and try re-running with updated mods."],
      "fixAction": "none",
      "canAutoFix": false
    }))
}

#[command]
pub async fn launch_apply_fix(
    app: tauri::AppHandle,
    instance_id: String,
    action: String,
) -> AppResult<Value> {
    let safe_instance_id = validate_id(&instance_id, "launch:applyFix")?;
    let action_norm = action.trim().to_ascii_lowercase();
    if action_norm.is_empty() || action_norm == "none" {
        return Ok(json!({
          "ok": true,
          "action": "none",
          "message": "No automatic fix available."
        }));
    }

    let db = read_instances_db(&app)?;
    let inst =
        find_instance(&db, &safe_instance_id).ok_or_else(|| "Instance not found".to_string())?;
    let mc_version = inst
        .get("mcVersion")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Instance mcVersion missing".to_string())?
        .to_string();
    let loader = inst
        .get("loader")
        .and_then(|v| v.as_str())
        .unwrap_or("fabric")
        .to_ascii_lowercase();

    if action_norm == "fix-duplicate-mods" {
        let result = runtime_ops::mods_fix_duplicates(app.clone(), safe_instance_id.clone())?;
        return Ok(json!({
          "ok": true,
          "action": action_norm,
          "removed": result.get("removed").cloned().unwrap_or_else(|| Value::Array(vec![])),
          "message": result.get("message").and_then(|v| v.as_str()).unwrap_or("Duplicate mod cleanup completed.")
        }));
    }

    if action_norm == "install-fabric-loader" {
        if loader != "fabric" {
            return Err("Fabric reinstall is only valid for Fabric instances".to_string());
        }
        let loader_version = inst
            .get("fabricLoaderVersion")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Instance has no Fabric loader version configured".to_string())?;

        let _ = runtime_ops::loader_install(
            app.clone(),
            safe_instance_id.clone(),
            mc_version.clone(),
            "fabric".to_string(),
            Some(loader_version.clone()),
        )
        .await?;

        return Ok(json!({
          "ok": true,
          "action": action_norm,
          "message": format!("Reinstalled Fabric loader {loader_version} for {mc_version}.")
        }));
    }

    if action_norm == "refresh-mods" {
        if loader != "fabric" {
            return Err(
                "Mod refresh is currently implemented for Fabric instances only".to_string(),
            );
        }
        let _ = runtime_ops::mods_refresh(
            app.clone(),
            safe_instance_id.clone(),
            Some(mc_version.clone()),
        )
        .await?;
        return Ok(json!({
          "ok": true,
          "action": action_norm,
          "message": format!("Refreshed mods for {mc_version}.")
        }));
    }

    Ok(json!({
      "ok": false,
      "action": action_norm,
      "message": "Unknown fix action."
    }))
}

#[command]
pub fn rollback_create_snapshot(
    app: tauri::AppHandle,
    instance_id: String,
    reason: String,
    note: Option<String>,
) -> AppResult<Value> {
    let safe_instance_id = validate_id(&instance_id, "rollback:createSnapshot")?;
    let db = read_instances_db(&app)?;
    let inst =
        find_instance(&db, &safe_instance_id).ok_or_else(|| "Instance not found".to_string())?;

    let reason_norm = match reason.trim() {
        "instance-preset" => "instance-preset",
        "mods-refresh" => "mods-refresh",
        "packs-refresh" => "packs-refresh",
        _ => "manual",
    };

    let mods_state: Value = read_json_file(
        &mods_state_path(&app, &safe_instance_id)?,
        json!({ "enabled": {} }),
    );
    let packs_state: Value = read_json_file(
        &packs_state_path(&app, &safe_instance_id)?,
        json!({ "enabled": {} }),
    );

    let snapshot = json!({
      "id": uuid_like(),
      "createdAt": now_ms(),
      "reason": reason_norm,
      "note": note.and_then(|n| {
        let t = n.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
      }),
      "instance": {
        "mcVersion": inst.get("mcVersion").cloned().unwrap_or(Value::Null),
        "loader": inst.get("loader").cloned().unwrap_or(json!("vanilla")),
        "fabricLoaderVersion": inst.get("fabricLoaderVersion").cloned().unwrap_or(Value::Null),
        "quiltLoaderVersion": inst.get("quiltLoaderVersion").cloned().unwrap_or(Value::Null),
        "forgeVersion": inst.get("forgeVersion").cloned().unwrap_or(Value::Null),
        "neoforgeVersion": inst.get("neoforgeVersion").cloned().unwrap_or(Value::Null),
        "memoryMb": inst.get("memoryMb").cloned().unwrap_or(json!(4096)),
        "jvmArgsOverride": inst.get("jvmArgsOverride").cloned().unwrap_or(Value::Null),
        "instancePreset": inst.get("instancePreset").cloned().unwrap_or(Value::Null)
      },
      "modsEnabled": mods_state.get("enabled").cloned().unwrap_or_else(|| json!({})),
      "packsEnabled": packs_state.get("enabled").cloned().unwrap_or_else(|| json!({}))
    });

    let rollback_path = rollback_db_path(&app, &safe_instance_id)?;
    let mut rollback: Value = read_json_file(&rollback_path, json!({ "snapshots": [] }));
    if !rollback.is_object() {
        rollback = json!({});
    }
    if !rollback
        .get("snapshots")
        .map(|v| v.is_array())
        .unwrap_or(false)
    {
        rollback["snapshots"] = json!([]);
    }

    if let Some(items) = rollback.get_mut("snapshots").and_then(|v| v.as_array_mut()) {
        items.insert(0, snapshot.clone());
        if items.len() > MAX_ROLLBACK_SNAPSHOTS {
            items.truncate(MAX_ROLLBACK_SNAPSHOTS);
        }
    }
    write_json_file(&rollback_path, &rollback)?;
    Ok(snapshot)
}

#[command]
pub fn rollback_get_latest(app: tauri::AppHandle, instance_id: String) -> AppResult<Value> {
    let safe_instance_id = validate_id(&instance_id, "rollback:getLatest")?;
    let rollback_path = rollback_db_path(&app, &safe_instance_id)?;
    let rollback: Value = read_json_file(&rollback_path, json!({ "snapshots": [] }));
    let latest = rollback
        .get("snapshots")
        .and_then(|v| v.as_array())
        .and_then(|items| items.first())
        .cloned()
        .unwrap_or(Value::Null);
    Ok(latest)
}

#[command]
pub async fn rollback_restore_latest(
    app: tauri::AppHandle,
    instance_id: String,
) -> AppResult<Value> {
    let safe_instance_id = validate_id(&instance_id, "rollback:restoreLatest")?;
    let rollback_path = rollback_db_path(&app, &safe_instance_id)?;
    let rollback: Value = read_json_file(&rollback_path, json!({ "snapshots": [] }));
    let latest = rollback
        .get("snapshots")
        .and_then(|v| v.as_array())
        .and_then(|items| items.first())
        .cloned()
        .ok_or_else(|| "No rollback snapshot found".to_string())?;

    let mut db = read_instances_db(&app)?;
    let inst = find_instance_mut(&mut db, &safe_instance_id)
        .ok_or_else(|| "Instance not found".to_string())?;
    if let Some(snapshot_instance) = latest.get("instance").and_then(|v| v.as_object()) {
        let assign = |dst: &mut Value, src: Option<&Value>| {
            if let Some(v) = src {
                *dst = v.clone();
            }
        };
        assign(&mut inst["mcVersion"], snapshot_instance.get("mcVersion"));
        assign(&mut inst["loader"], snapshot_instance.get("loader"));
        assign(
            &mut inst["fabricLoaderVersion"],
            snapshot_instance.get("fabricLoaderVersion"),
        );
        assign(
            &mut inst["quiltLoaderVersion"],
            snapshot_instance.get("quiltLoaderVersion"),
        );
        assign(
            &mut inst["forgeVersion"],
            snapshot_instance.get("forgeVersion"),
        );
        assign(
            &mut inst["neoforgeVersion"],
            snapshot_instance.get("neoforgeVersion"),
        );
        assign(&mut inst["memoryMb"], snapshot_instance.get("memoryMb"));
        assign(
            &mut inst["jvmArgsOverride"],
            snapshot_instance.get("jvmArgsOverride"),
        );
        assign(
            &mut inst["instancePreset"],
            snapshot_instance.get("instancePreset"),
        );
    }
    db["updatedAt"] = json!(now_ms());
    write_instances_db(&app, &db)?;

    let mut mods_state: Value = read_json_file(
        &mods_state_path(&app, &safe_instance_id)?,
        json!({ "enabled": {}, "resolved": {} }),
    );
    mods_state["enabled"] = latest
        .get("modsEnabled")
        .cloned()
        .unwrap_or_else(|| json!({}));
    write_json_file(&mods_state_path(&app, &safe_instance_id)?, &mods_state)?;

    let mut packs_state: Value = read_json_file(
        &packs_state_path(&app, &safe_instance_id)?,
        json!({ "enabled": {}, "resolved": {} }),
    );
    packs_state["enabled"] = latest
        .get("packsEnabled")
        .cloned()
        .unwrap_or_else(|| json!({}));
    write_json_file(&packs_state_path(&app, &safe_instance_id)?, &packs_state)?;

    let mc_version = latest
        .get("instance")
        .and_then(|v| v.get("mcVersion"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let loader = latest
        .get("instance")
        .and_then(|v| v.get("loader"))
        .and_then(|v| v.as_str())
        .unwrap_or("vanilla")
        .to_ascii_lowercase();

    if !mc_version.trim().is_empty() && loader == "fabric" {
        let _ = runtime_ops::mods_refresh(
            app.clone(),
            safe_instance_id.clone(),
            Some(mc_version.clone()),
        )
        .await?;
    }
    if !mc_version.trim().is_empty() {
        let _ = runtime_ops::packs_refresh(app.clone(), safe_instance_id.clone(), Some(mc_version))
            .await?;
    }

    Ok(latest)
}

fn uuid_like() -> String {
    let now = now_ms();
    let pid = std::process::id() as u64;
    let mix = now ^ (pid << 16);
    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        (mix & 0xffff_ffff) as u32,
        ((mix >> 32) & 0xffff) as u16,
        0x4000 | (((mix >> 48) & 0x0fff) as u16),
        0x8000 | ((pid as u16) & 0x3fff),
        (now & 0x000f_ffff_ffff_ffff)
    )
}
