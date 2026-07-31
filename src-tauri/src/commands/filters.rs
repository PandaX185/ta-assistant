use rusqlite::Connection;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    dir.push("ta-assistant.db");
    Ok(dir)
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| format!("Failed to open database: {e}"))?;
    crate::db::migrations::run_pending(&conn)?;
    Ok(conn)
}

#[derive(Serialize)]
pub struct SemesterYear {
    pub id: String,
    pub year: i64,
    pub semester: String,
}

#[derive(Serialize)]
pub struct Subject {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub fn get_semester_years(app: AppHandle) -> Result<Vec<SemesterYear>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, year, semester FROM semester_years ORDER BY year DESC, semester")
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SemesterYear {
                id: row.get(0)?,
                year: row.get(1)?,
                semester: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row read failed: {e}"))?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_subjects(app: AppHandle) -> Result<Vec<Subject>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, name, code, color FROM subjects ORDER BY name")
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Subject {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
                color: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query failed: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row read failed: {e}"))?);
    }
    Ok(result)
}
