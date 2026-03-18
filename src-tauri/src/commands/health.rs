use tauri::command;

#[command]
pub fn ping() -> String {
    "pong".into()
}
