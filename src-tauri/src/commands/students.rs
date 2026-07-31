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

#[derive(Serialize)]
pub struct QuizDetailItem {
    pub id: String,
    pub name: String,
    pub max_score: f64,
    pub score: Option<f64>,
}

#[derive(Serialize)]
pub struct AssignmentDetailItem {
    pub id: String,
    pub name: String,
    pub max_score: f64,
    pub score: Option<f64>,
}

#[derive(Serialize)]
pub struct AttendanceDetailItem {
    pub id: String,
    pub lecture_id: String,
    pub lecture_date: String,
    pub lecture_title: Option<String>,
    pub status: String,
}

#[derive(Serialize)]
pub struct BonusDetailItem {
    pub id: String,
    pub value: f64,
    pub reason: String,
    pub date: String,
}

#[derive(Serialize)]
pub struct StudentDetail {
    pub student_id: String,
    pub student_name: String,
    pub student_code: Option<String>,
    pub student_email: Option<String>,
    pub quizzes: Vec<QuizDetailItem>,
    pub assignments: Vec<AssignmentDetailItem>,
    pub attendance: Vec<AttendanceDetailItem>,
    pub bonuses: Vec<BonusDetailItem>,
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
pub fn create_student(app: AppHandle, name: String, email: Option<String>, student_id: Option<String>) -> Result<String, String> {
    let conn = crate::db::open_db(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO students (id, name, email, student_id) VALUES (?, ?, ?, ?)",
        rusqlite::params![id, name, email, student_id],
    )
    .map_err(|e| format!("Create student failed: {e}"))?;
    Ok(id)
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
        result.push(row.map_err(|e| format!("Row failed: {e}"))?);
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

#[tauri::command]
pub fn get_student_detail(app: AppHandle, enrollment_id: String) -> Result<StudentDetail, String> {
    let conn = crate::db::open_db(&app)?;

    // Get student info
    let (student_id, student_name, student_code, student_email) = conn
        .query_row(
            "SELECT s.id, s.name, s.student_id, s.email
             FROM enrollments e
             JOIN students s ON s.id = e.student_id
             WHERE e.id = ?1",
            rusqlite::params![enrollment_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Student query failed: {e}"))?;

    // Get quizzes
    let mut qstmt = conn
        .prepare(
            "SELECT id, name, max_score, score
             FROM quizzes
             WHERE enrollment_id = ?1
             ORDER BY date, name",
        )
        .map_err(|e| format!("Quiz query failed: {e}"))?;

    let quizzes = qstmt
        .query_map(rusqlite::params![enrollment_id], |row| {
            Ok(QuizDetailItem {
                id: row.get(0)?,
                name: row.get(1)?,
                max_score: row.get(2)?,
                score: row.get(3)?,
            })
        })
        .map_err(|e| format!("Quiz query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // Get assignments
    let mut astmt = conn
        .prepare(
            "SELECT id, name, max_score, score
             FROM assignments
             WHERE enrollment_id = ?1
             ORDER BY due_date, name",
        )
        .map_err(|e| format!("Assignment query failed: {e}"))?;

    let assignments = astmt
        .query_map(rusqlite::params![enrollment_id], |row| {
            Ok(AssignmentDetailItem {
                id: row.get(0)?,
                name: row.get(1)?,
                max_score: row.get(2)?,
                score: row.get(3)?,
            })
        })
        .map_err(|e| format!("Assignment query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // Get attendance
    let mut attstmt = conn
        .prepare(
            "SELECT a.id, l.id, l.date, l.title, a.status
             FROM attendance a
             JOIN lectures l ON l.id = a.lecture_id
             JOIN enrollments e ON e.id = a.enrollment_id
             WHERE a.enrollment_id = ?1
             ORDER BY l.date",
        )
        .map_err(|e| format!("Attendance query failed: {e}"))?;

    let attendance = attstmt
        .query_map(rusqlite::params![enrollment_id], |row| {
            Ok(AttendanceDetailItem {
                id: row.get(0)?,
                lecture_id: row.get(1)?,
                lecture_date: row.get(2)?,
                lecture_title: row.get(3)?,
                status: row.get(4)?,
            })
        })
        .map_err(|e| format!("Attendance query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // Get bonuses
    let mut bstmt = conn
        .prepare(
            "SELECT id, value, reason, date
             FROM bonuses
             WHERE enrollment_id = ?1
             ORDER BY date",
        )
        .map_err(|e| format!("Bonus query failed: {e}"))?;

    let bonuses = bstmt
        .query_map(rusqlite::params![enrollment_id], |row| {
            Ok(BonusDetailItem {
                id: row.get(0)?,
                value: row.get(1)?,
                reason: row.get(2)?,
                date: row.get(3)?,
            })
        })
        .map_err(|e| format!("Bonus query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(StudentDetail {
        student_id,
        student_name,
        student_code,
        student_email,
        quizzes,
        assignments,
        attendance,
        bonuses,
    })
}
