use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct LectureWithAttendance {
    pub id: String,
    pub subject_id: String,
    pub semester_year_id: Option<String>,
    pub date: String,
    pub description: Option<String>,
}

#[derive(Serialize)]
pub struct AttendanceRecord {
    pub id: String,
    pub lecture_id: String,
    pub enrollment_id: String,
    pub student_name: String,
    pub status: String,
}

#[tauri::command]
pub fn get_lectures(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
) -> Result<Vec<LectureWithAttendance>, String> {
    let conn = crate::db::open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, subject_id, semester_year_id, date, description
             FROM lectures
             WHERE subject_id = ?1 AND (semester_year_id IS NULL OR semester_year_id = ?2)
             ORDER BY date DESC",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![subject_id, semester_year_id], |row| {
            Ok(LectureWithAttendance {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                semester_year_id: row.get(2)?,
                date: row.get(3)?,
                description: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row failed: {e}"))?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_lecture(
    app: AppHandle,
    subject_id: String,
    semester_year_id: String,
    date: String,
    description: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "INSERT INTO lectures (id, subject_id, semester_year_id, date, description)
         VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            subject_id,
            semester_year_id,
            date,
            description,
        ],
    )
    .map_err(|e| format!("Create lecture failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_lecture(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute("DELETE FROM lectures WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete lecture failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_attendance(app: AppHandle, lecture_id: String) -> Result<Vec<AttendanceRecord>, String> {
    let conn = crate::db::open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.lecture_id, a.enrollment_id, s.name, a.status
             FROM attendance a
             JOIN enrollments e ON e.id = a.enrollment_id
             JOIN students s ON s.id = e.student_id
             WHERE a.lecture_id = ?1
             ORDER BY s.name",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![lecture_id], |row| {
            Ok(AttendanceRecord {
                id: row.get(0)?,
                lecture_id: row.get(1)?,
                enrollment_id: row.get(2)?,
                student_name: row.get(3)?,
                status: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row failed: {e}"))?);
    }
    Ok(result)
}

#[tauri::command]
pub fn mark_attendance(
    app: AppHandle,
    lecture_id: String,
    enrollment_id: String,
    status: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;

    // Upsert: insert or update
    conn.execute(
        "INSERT INTO attendance (id, lecture_id, enrollment_id, status)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(lecture_id, enrollment_id) DO UPDATE SET status = ?4",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            lecture_id,
            enrollment_id,
            status,
        ],
    )
    .map_err(|e| format!("Mark attendance failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn seed_attendance(
    app: AppHandle,
    lecture_id: String,
    semester_year_id: String,
    subject_id: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;

    // Insert absent records for all enrolled students who don't have one
    let mut stmt = conn
        .prepare(
            "SELECT e.id FROM enrollments e
             WHERE e.semester_year_id = ?1 AND e.subject_id = ?2
             AND e.id NOT IN (
                 SELECT enrollment_id FROM attendance WHERE lecture_id = ?3
             )",
        )
        .map_err(|e| format!("Query failed: {e}"))?;

    let ids: Vec<String> = stmt
        .query_map(
            rusqlite::params![semester_year_id, subject_id, lecture_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    for enr_id in &ids {
        conn.execute(
            "INSERT INTO attendance (id, lecture_id, enrollment_id, status)
             VALUES (?, ?, ?, 'Absent')",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), lecture_id, enr_id],
        )
        .map_err(|e| format!("Insert attendance failed: {e}"))?;
    }

    Ok(())
}
