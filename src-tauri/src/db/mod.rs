pub mod migrations;

use rusqlite::Connection;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    dir.push("ta-assistant.db");
    Ok(dir)
}

pub fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| format!("Failed to open database: {e}"))?;
    // Enable foreign keys so ON DELETE CASCADE actually works in the app
    // (SQLite defaults this to OFF per connection).
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;
    migrations::run_pending(&conn)?;
    Ok(conn)
}
