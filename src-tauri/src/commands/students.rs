use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Student {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub student_id: Option<String>,
}

#[derive(Serialize)]
pub struct Enrollment {
    pub id: String,
    pub student_id: String,
    pub semester_year_id: String,
    pub subject_id: String,
    pub student_name: String,
    pub student_code: Option<String>,
}

#[tauri::command]
pub fn get_students(app: AppHandle) -> Result<Vec<Student>, String> {
    let conn = crate::db::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, name, email, student_id FROM students ORDER BY name")
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Student {
                id: row.get(0)?,
                name: row.get(1)?,
                email: row.get(2)?,
                student_id: row.get(3)?,
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
pub fn create_student(app: AppHandle, name: String, email: Option<String>, student_id: Option<String>) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "INSERT INTO students (id, name, email, student_id) VALUES (?, ?, ?, ?)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), name, email, student_id],
    )
    .map_err(|e| format!("Create student failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_student(app: AppHandle, id: String, name: String, email: Option<String>, student_id: Option<String>) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "UPDATE students SET name = ?1, email = ?2, student_id = ?3 WHERE id = ?4",
        rusqlite::params![name, email, student_id, id],
    )
    .map_err(|e| format!("Update student failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_student(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute("DELETE FROM students WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete student failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_enrollments(app: AppHandle, semester_year_id: String, subject_id: String) -> Result<Vec<Enrollment>, String> {
    let conn = crate::db::open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.student_id, e.semester_year_id, e.subject_id, s.name, s.student_id
             FROM enrollments e
             JOIN students s ON s.id = e.student_id
             WHERE e.semester_year_id = ?1 AND e.subject_id = ?2
             ORDER BY s.name",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![semester_year_id, subject_id], |row| {
            Ok(Enrollment {
                id: row.get(0)?,
                student_id: row.get(1)?,
                semester_year_id: row.get(2)?,
                subject_id: row.get(3)?,
                student_name: row.get(4)?,
                student_code: row.get(5)?,
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
pub fn create_enrollment(app: AppHandle, student_id: String, semester_year_id: String, subject_id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "INSERT INTO enrollments (id, student_id, semester_year_id, subject_id) VALUES (?, ?, ?, ?)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), student_id, semester_year_id, subject_id],
    )
    .map_err(|e| format!("Create enrollment failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_enrollment(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute("DELETE FROM enrollments WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete enrollment failed: {e}"))?;
    Ok(())
}
