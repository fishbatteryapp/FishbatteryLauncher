use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::Manager;

use crate::error::{into_error, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightCheck {
  pub id: String,
  pub title: String,
  pub severity: String,
  pub detail: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub remediation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightResult {
  #[serde(rename = "ranAt")]
  pub ran_at: u64,
  pub summary: String,
  pub checks: Vec<PreflightCheck>,
  pub platform: String,
  #[serde(rename = "appVersion")]
  pub app_version: String,
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn preflight_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
  Ok(app.path().app_data_dir().map_err(into_error)?.join("data").join("preflight-health.json"))
}

fn write_preflight(app: &tauri::AppHandle, value: &PreflightResult) -> AppResult<()> {
  let path = preflight_path(app)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(into_error)?;
  }
  let raw = serde_json::to_string_pretty(value).map_err(into_error)?;
  fs::write(path, raw).map_err(into_error)?;
  Ok(())
}

fn read_preflight(app: &tauri::AppHandle) -> AppResult<Option<PreflightResult>> {
  let path = preflight_path(app)?;
  let raw = match fs::read_to_string(path) {
    Ok(v) => v,
    Err(_) => return Ok(None),
  };
  let parsed = serde_json::from_str::<PreflightResult>(&raw).map_err(into_error)?;
  Ok(Some(parsed))
}

fn add_check(
  checks: &mut Vec<PreflightCheck>,
  id: &str,
  title: &str,
  severity: &str,
  detail: String,
  remediation: Option<&str>,
) {
  checks.push(PreflightCheck {
    id: id.to_string(),
    title: title.to_string(),
    severity: severity.to_string(),
    detail,
    remediation: remediation.map(|v| v.to_string()),
  });
}

fn java_bin_candidates_for_root(root: &std::path::Path) -> Vec<PathBuf> {
  let mut out = Vec::new();
  if cfg!(target_os = "windows") {
    out.push(root.join("runtime").join("java21").join("bin").join("javaw.exe"));
    out.push(root.join("runtime").join("java21").join("bin").join("java.exe"));
  } else {
    out.push(root.join("runtime").join("java21").join("bin").join("java"));
  }
  out
}

fn ordered_java_candidates(app: &tauri::AppHandle) -> Vec<(String, Option<PathBuf>)> {
  let mut out: Vec<(String, Option<PathBuf>)> = Vec::new();

  if let Ok(resource_dir) = app.path().resource_dir() {
    for c in java_bin_candidates_for_root(&resource_dir) {
      out.push(("bundled-resource".to_string(), Some(c)));
    }
  }

  if let Ok(cwd) = std::env::current_dir() {
    for c in java_bin_candidates_for_root(&cwd) {
      out.push(("bundled-cwd".to_string(), Some(c)));
    }
    if let Some(parent) = cwd.parent() {
      for c in java_bin_candidates_for_root(parent) {
        out.push(("bundled-cwd-parent".to_string(), Some(c)));
      }
    }
  }

  if let Ok(exe) = std::env::current_exe() {
    if let Some(exe_dir) = exe.parent() {
      for c in java_bin_candidates_for_root(exe_dir) {
        out.push(("bundled-exe-dir".to_string(), Some(c)));
      }
    }
  }

  // Final fallback: system java on PATH.
  out.push(("system-path".to_string(), None));
  out
}

fn parse_java_major(version_output: &str) -> Option<u32> {
  let marker = "version \"";
  let idx = version_output.find(marker)?;
  let after = &version_output[idx + marker.len()..];
  let end = after.find('"')?;
  let token = &after[..end];
  let mut parts = token.split('.');
  let first = parts.next()?.trim().parse::<u32>().ok()?;
  if first == 1 {
    return parts.next().and_then(|v| v.trim().parse::<u32>().ok());
  }
  Some(first)
}

fn probe_java(program: &str) -> (bool, String, Option<u32>) {
  let output = Command::new(program).arg("-version").output();
  let Ok(out) = output else {
    return (false, String::new(), None);
  };

  let mut text = String::new();
  text.push_str(&String::from_utf8_lossy(&out.stdout));
  if !text.is_empty() {
    text.push('\n');
  }
  text.push_str(&String::from_utf8_lossy(&out.stderr));
  let major = parse_java_major(&text);
  (out.status.success(), text, major)
}

fn detect_java_runtime(app: &tauri::AppHandle, checks: &mut Vec<PreflightCheck>) {
  let mut checked = 0usize;
  let mut last_probe_note = String::new();

  for (source, path_opt) in ordered_java_candidates(app) {
    let program = match path_opt {
      Some(path) => {
        if !path.exists() {
          continue;
        }
        path.to_string_lossy().to_string()
      }
      None => "java".to_string(),
    };

    checked += 1;
    let (ok, _output, major) = probe_java(&program);
    if !ok {
      if source == "system-path" {
        last_probe_note = "system java not callable".to_string();
      }
      continue;
    }

    if let Some(v) = major {
      if v < 17 {
        add_check(
          checks,
          "java-runtime",
          "Java Runtime",
          "critical",
          format!("Resolved {source}: {program} (Java {v}). Java 17+ required."),
          Some("Use launcher bundled Java 21 in runtime/java21, or install Java 21+ on PATH."),
        );
        return;
      }
      add_check(
        checks,
        "java-runtime",
        "Java Runtime",
        "ok",
        format!("Resolved {source}: {program} (Java {v})."),
        None,
      );
      return;
    }

    add_check(
      checks,
      "java-runtime",
      "Java Runtime",
      "warning",
      format!("Resolved {source}: {program} (version could not be parsed)."),
      Some("Confirm this runtime is Java 21 to match launcher target."),
    );
    return;
  }

  let note = if last_probe_note.is_empty() {
    format!("Checked {checked} candidate(s).")
  } else {
    format!("Checked {checked} candidate(s); {last_probe_note}.")
  };
  add_check(
    checks,
    "java-runtime",
    "Java Runtime",
    "critical",
    format!("No usable Java runtime found. {note}"),
    Some("Place Java 21 in runtime/java21/bin or install Java 21+ on PATH."),
  );
}

#[command]
pub fn preflight_run(app: tauri::AppHandle) -> AppResult<PreflightResult> {
  let app_data = app.path().app_data_dir().map_err(into_error)?;
  let mut checks = Vec::new();

  match fs::create_dir_all(&app_data) {
    Ok(_) => checks.push(PreflightCheck {
      id: "write-app-data".to_string(),
      title: "App Data Write Access".to_string(),
      severity: "ok".to_string(),
      detail: format!("Writable: {}", app_data.to_string_lossy()),
      remediation: None,
    }),
    Err(err) => checks.push(PreflightCheck {
      id: "write-app-data".to_string(),
      title: "App Data Write Access".to_string(),
      severity: "critical".to_string(),
      detail: format!("Path is not writable: {} ({})", app_data.to_string_lossy(), err),
      remediation: Some("Check folder permissions and disk protection software.".to_string()),
    }),
  }

  detect_java_runtime(&app, &mut checks);

  let summary = if checks.iter().any(|c| c.severity == "critical") {
    "critical"
  } else if checks.iter().any(|c| c.severity == "warning") {
    "warnings"
  } else {
    "healthy"
  };

  let result = PreflightResult {
    ran_at: now_ms(),
    summary: summary.to_string(),
    checks,
    platform: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
    app_version: env!("CARGO_PKG_VERSION").to_string(),
  };
  write_preflight(&app, &result)?;
  Ok(result)
}

#[command]
pub fn preflight_get_last(app: tauri::AppHandle) -> AppResult<Option<PreflightResult>> {
  read_preflight(&app)
}
