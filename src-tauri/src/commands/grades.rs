use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct GradeSheet {
    pub students: Vec<GradeStudent>,
    pub quizzes: Vec<GradeColumn>,
    pub assignments: Vec<GradeColumn>,
}

#[derive(Serialize)]
pub struct GradeStudent {
    pub enrollment_id: String,
    pub student_name: String,
    pub student_code: Option<String>,
    pub quiz_scores: Vec<Option<f64>>,
    pub quiz_ids: Vec<Option<String>>,
    pub assignment_scores: Vec<Option<f64>>,
    pub assignment_ids: Vec<Option<String>>,
}

#[derive(Serialize)]
pub struct GradeColumn {
    pub id: String,
    pub name: String,
    pub max_score: f64,
    pub date: String,
}

#[tauri::command]
pub fn get_grades(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
) -> Result<GradeSheet, String> {
    use rusqlite::params;
    let conn = crate::db::open_db(&app)?;

    // Get all quizzes (distinct names) for this subject+semester
    let mut qcol = conn
        .prepare(
            "SELECT DISTINCT q.name, q.max_score, q.date
             FROM quizzes q
             JOIN enrollments e ON e.id = q.enrollment_id
             WHERE e.semester_year_id = ?1 AND e.subject_id = ?2
             ORDER BY q.date, q.name",
        )
        .map_err(|e| format!("Quiz columns query failed: {e}"))?;

    let mut quiz_columns: Vec<GradeColumn> = Vec::new();
    let qrows = qcol
        .query_map(params![semester_year_id, subject_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("Query failed: {e}"))?;

    for row in qrows {
        let (name, max, date) = row.map_err(|e| format!("Row failed: {e}"))?;
        // Use name+date as unique key
        let id = format!("q:{}:{}", name, date);
        if !quiz_columns.iter().any(|c| c.id == id) {
            quiz_columns.push(GradeColumn {
                id,
                name,
                max_score: max,
                date,
            });
        }
    }

    // Same for assignments
    let mut acol = conn
        .prepare(
            "SELECT DISTINCT a.name, a.max_score, a.due_date
             FROM assignments a
             JOIN enrollments e ON e.id = a.enrollment_id
             WHERE e.semester_year_id = ?1 AND e.subject_id = ?2
             ORDER BY a.due_date, a.name",
        )
        .map_err(|e| format!("Assignment columns query failed: {e}"))?;

    let mut assignment_columns: Vec<GradeColumn> = Vec::new();
    let arows = acol
        .query_map(params![semester_year_id, subject_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("Query failed: {e}"))?;

    for row in arows {
        let (name, max, date) = row.map_err(|e| format!("Row failed: {e}"))?;
        let id = format!("a:{}:{}", name, date);
        if !assignment_columns.iter().any(|c| c.id == id) {
            assignment_columns.push(GradeColumn {
                id,
                name,
                max_score: max,
                date,
            });
        }
    }

    // Get enrollments for this subject+semester
    let mut estmt = conn
        .prepare(
            "SELECT e.id, s.name, s.student_id
             FROM enrollments e
             JOIN students s ON s.id = e.student_id
             WHERE e.semester_year_id = ?1 AND e.subject_id = ?2
             ORDER BY s.name",
        )
        .map_err(|e| format!("Enrollments query failed: {e}"))?;

    let enrollments: Vec<(String, String, Option<String>)> = estmt
        .query_map(params![semester_year_id, subject_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| format!("Query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // We'll create per-enrollment prepared statements inside the loop instead

    let mut students: Vec<GradeStudent> = Vec::new();

    for (enr_id, student_name, student_code) in &enrollments {
        let mut qmap = conn
            .prepare(
                "SELECT q.id, q.name, q.date, q.score
                 FROM quizzes q
                 WHERE q.enrollment_id = ?1
                 ORDER BY q.date, q.name",
            )
            .map_err(|e| format!("Query failed: {e}"))?;

        let qrows: Vec<(String, String, String, Option<f64>)> = qmap
            .query_map(params![enr_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<f64>>(3)?,
                ))
            })
            .map_err(|e| format!("Query failed: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let (quiz_ids, quiz_scores): (Vec<_>, Vec<_>) = quiz_columns
            .iter()
            .map(|col| {
                let found = qrows.iter().find(|(_, rn, rd, _)| {
                    rn == &col.name && rd == &col.date
                });
                match found {
                    Some((id, _, _, score)) => (Some(id.clone()), *score),
                    None => (None, None),
                }
            })
            .unzip();

        // Same for assignments
        let mut amap = conn
            .prepare(
                "SELECT a.id, a.name, a.due_date, a.score
                 FROM assignments a
                 WHERE a.enrollment_id = ?1
                 ORDER BY a.due_date, a.name",
            )
            .map_err(|e| format!("Query failed: {e}"))?;

        let arows: Vec<(String, String, String, Option<f64>)> = amap
            .query_map(params![enr_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<f64>>(3)?,
                ))
            })
            .map_err(|e| format!("Query failed: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let (assignment_ids, assignment_scores): (Vec<_>, Vec<_>) = assignment_columns
            .iter()
            .map(|col| {
                let found = arows.iter().find(|(_, rn, rd, _)| {
                    rn == &col.name && rd == &col.date
                });
                match found {
                    Some((id, _, _, score)) => (Some(id.clone()), *score),
                    None => (None, None),
                }
            })
            .unzip();

        students.push(GradeStudent {
            enrollment_id: enr_id.clone(),
            student_name: student_name.clone(),
            student_code: student_code.clone(),
            quiz_scores,
            quiz_ids,
            assignment_scores,
            assignment_ids,
        });
    }

    Ok(GradeSheet {
        students,
        quizzes: quiz_columns,
        assignments: assignment_columns,
    })
}

#[tauri::command]
pub fn create_quiz_bulk(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    name: String,
    max_score: f64,
    date: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;

    // Get all enrollment IDs for this subject+semester
    let mut stmt = conn
        .prepare(
            "SELECT id FROM enrollments WHERE semester_year_id = ?1 AND subject_id = ?2",
        )
        .map_err(|e| format!("Query failed: {e}"))?;

    let ids: Vec<String> = stmt
        .query_map(rusqlite::params![semester_year_id, subject_id], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    for enr_id in &ids {
        conn.execute(
            "INSERT INTO quizzes (id, enrollment_id, name, max_score, score, date)
             VALUES (?, ?, ?, ?, NULL, ?)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                enr_id,
                name,
                max_score,
                date,
            ],
        )
        .map_err(|e| format!("Insert quiz failed: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn create_assignment_bulk(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    name: String,
    max_score: f64,
    date: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;

    let mut stmt = conn
        .prepare(
            "SELECT id FROM enrollments WHERE semester_year_id = ?1 AND subject_id = ?2",
        )
        .map_err(|e| format!("Query failed: {e}"))?;

    let ids: Vec<String> = stmt
        .query_map(rusqlite::params![semester_year_id, subject_id], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    for enr_id in &ids {
        conn.execute(
            "INSERT INTO assignments (id, enrollment_id, name, max_score, score, due_date)
             VALUES (?, ?, ?, ?, NULL, ?)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                enr_id,
                name,
                max_score,
                date,
            ],
        )
        .map_err(|e| format!("Insert assignment failed: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn update_quiz_score(app: AppHandle, id: String, score: Option<f64>) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "UPDATE quizzes SET score = ?1 WHERE id = ?2",
        rusqlite::params![score, id],
    )
    .map_err(|e| format!("Update quiz score failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_assignment_score(
    app: AppHandle,
    id: String,
    score: Option<f64>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "UPDATE assignments SET score = ?1 WHERE id = ?2",
        rusqlite::params![score, id],
    )
    .map_err(|e| format!("Update assignment score failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_quiz(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute("DELETE FROM quizzes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete quiz failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_assignment(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute("DELETE FROM assignments WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete assignment failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_quiz_column(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    name: String,
    date: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "DELETE FROM quizzes WHERE id IN (
            SELECT q.id FROM quizzes q
            JOIN enrollments e ON e.id = q.enrollment_id
            WHERE e.semester_year_id = ?1 AND e.subject_id = ?2
              AND q.name = ?3 AND q.date = ?4
        )",
        rusqlite::params![semester_year_id, subject_id, name, date],
    )
    .map_err(|e| format!("Delete quiz column failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_assignment_column(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    name: String,
    date: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "DELETE FROM assignments WHERE id IN (
            SELECT a.id FROM assignments a
            JOIN enrollments e ON e.id = a.enrollment_id
            WHERE e.semester_year_id = ?1 AND e.subject_id = ?2
              AND a.name = ?3 AND a.due_date = ?4
        )",
        rusqlite::params![semester_year_id, subject_id, name, date],
    )
    .map_err(|e| format!("Delete assignment column failed: {e}"))?;
    Ok(())
}
