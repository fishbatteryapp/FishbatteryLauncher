use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::Local;
use flate2::write::GzEncoder;
use flate2::Compression;
use tauri::Manager;

use crate::error::{into_error, AppResult};
use crate::state::AppState;

pub struct SessionLogger {
    latest: File,
    debug: File,
    stderr_stream: File,
    daily_gz: GzEncoder<File>,
}

fn logs_dir(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(into_error)?
        .join("data")
        .join("logs"))
}

fn next_daily_log_path(dir: &Path) -> AppResult<PathBuf> {
    let day = Local::now().format("%Y-%m-%d").to_string();
    let mut max_index = 0u32;
    if dir.exists() {
        for entry in fs::read_dir(dir).map_err(into_error)? {
            let entry = entry.map_err(into_error)?;
            let name = entry.file_name().to_string_lossy().to_string();
            if !(name.starts_with(&format!("{day}-")) && name.ends_with(".log.gz")) {
                continue;
            }
            let n = name
                .trim_start_matches(&format!("{day}-"))
                .trim_end_matches(".log.gz")
                .parse::<u32>()
                .ok();
            if let Some(v) = n {
                if v > max_index {
                    max_index = v;
                }
            }
        }
    }
    Ok(dir.join(format!("{day}-{}.log.gz", max_index + 1)))
}

impl SessionLogger {
    fn new(app: &tauri::AppHandle) -> AppResult<Self> {
        let dir = logs_dir(app)?;
        fs::create_dir_all(&dir).map_err(into_error)?;

        let latest = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(dir.join("latest.log"))
            .map_err(into_error)?;
        let debug = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("debug.log"))
            .map_err(into_error)?;
        let stderr_stream = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("stderr_stream.log"))
            .map_err(into_error)?;

        let daily = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(next_daily_log_path(&dir)?)
            .map_err(into_error)?;
        let daily_gz = GzEncoder::new(daily, Compression::default());

        Ok(Self {
            latest,
            debug,
            stderr_stream,
            daily_gz,
        })
    }

    fn write_line(&mut self, line: &str) -> AppResult<()> {
        let ts = Local::now().format("%Y-%m-%d %H:%M:%S");
        let formatted = format!("[{ts}] {line}\n");
        self.latest
            .write_all(formatted.as_bytes())
            .map_err(into_error)?;
        self.latest.flush().map_err(into_error)?;
        self.debug
            .write_all(formatted.as_bytes())
            .map_err(into_error)?;
        self.debug.flush().map_err(into_error)?;
        self.daily_gz
            .write_all(formatted.as_bytes())
            .map_err(into_error)?;
        self.daily_gz.flush().map_err(into_error)?;
        Ok(())
    }

    fn write_stderr_line(&mut self, line: &str) -> AppResult<()> {
        let ts = Local::now().format("%Y-%m-%d %H:%M:%S");
        let formatted = format!("[{ts}] {line}\n");
        self.stderr_stream
            .write_all(formatted.as_bytes())
            .map_err(into_error)?;
        self.stderr_stream.flush().map_err(into_error)?;
        Ok(())
    }
}

pub fn init(app: &tauri::AppHandle) -> AppResult<()> {
    let mut logger = SessionLogger::new(app)?;
    let _ = logger.write_line("[startup] Logger initialized");
    let state = app.state::<AppState>();
    let mut guard = state
        .session_logger
        .lock()
        .map_err(|_| "logs: state lock poisoned".to_string())?;
    *guard = Some(logger);
    Ok(())
}

pub fn append_line(app: &tauri::AppHandle, line: &str) {
    let state = app.state::<AppState>();
    let lock = state.session_logger.lock();
    if let Ok(mut guard) = lock {
        if let Some(logger) = guard.as_mut() {
            let _ = logger.write_line(line);
        }
    }
}

pub fn append_stderr_line(app: &tauri::AppHandle, line: &str) {
    let state = app.state::<AppState>();
    let lock = state.session_logger.lock();
    if let Ok(mut guard) = lock {
        if let Some(logger) = guard.as_mut() {
            let _ = logger.write_stderr_line(line);
        }
    }
}
