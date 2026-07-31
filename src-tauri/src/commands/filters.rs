use serde::Serialize;
use tauri::AppHandle;

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
    let conn = crate::db::open_db(&app)?;
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
    let conn = crate::db::open_db(&app)?;
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

#[tauri::command]
pub fn create_semester_year(app: AppHandle, year: i64, semester: String) -> Result<(), String> {
    use rusqlite::params;
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "INSERT INTO semester_years (id, year, semester) VALUES (?, ?, ?)",
        params![uuid::Uuid::new_v4().to_string(), year, semester],
    )
    .map_err(|e| format!("Create semester/year failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_semester_year(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute("DELETE FROM semester_years WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn create_subject(app: AppHandle, name: String, code: Option<String>, color: Option<String>) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "INSERT INTO subjects (id, name, code, color) VALUES (?, ?, ?, ?)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), name, code, color],
    )
    .map_err(|e| format!("Create subject failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_subject(app: AppHandle, id: String, name: String, code: Option<String>, color: Option<String>) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "UPDATE subjects SET name = ?1, code = ?2, color = ?3 WHERE id = ?4",
        rusqlite::params![name, code, color, id],
    )
    .map_err(|e| format!("Update subject failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_subject(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute("DELETE FROM subjects WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete subject failed: {e}"))?;
    Ok(())
}
