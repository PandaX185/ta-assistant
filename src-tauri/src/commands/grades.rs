use rusqlite::Connection;
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
    let conn = crate::db::open_db(&app)?;
    get_grades_impl(&conn, semester_year_id, subject_id)
}

fn get_grades_impl(
    conn: &Connection,
    semester_year_id: String,
    subject_id: String,
) -> Result<GradeSheet, String> {
    use rusqlite::params;

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
                let found = qrows
                    .iter()
                    .find(|(_, rn, rd, _)| rn == &col.name && rd == &col.date);
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
                let found = arows
                    .iter()
                    .find(|(_, rn, rd, _)| rn == &col.name && rd == &col.date);
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
    create_quiz_bulk_impl(&conn, semester_year_id, subject_id, name, max_score, date)
}

fn create_quiz_bulk_impl(
    conn: &Connection,
    semester_year_id: String,
    subject_id: String,
    name: String,
    max_score: f64,
    date: String,
) -> Result<(), String> {
    // Get all enrollment IDs for this subject+semester
    let mut stmt = conn
        .prepare("SELECT id FROM enrollments WHERE semester_year_id = ?1 AND subject_id = ?2")
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
    create_assignment_bulk_impl(&conn, semester_year_id, subject_id, name, max_score, date)
}

fn create_assignment_bulk_impl(
    conn: &Connection,
    semester_year_id: String,
    subject_id: String,
    name: String,
    max_score: f64,
    date: String,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id FROM enrollments WHERE semester_year_id = ?1 AND subject_id = ?2")
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
    update_quiz_score_impl(&conn, id, score)
}

fn update_quiz_score_impl(conn: &Connection, id: String, score: Option<f64>) -> Result<(), String> {
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
    update_assignment_score_impl(&conn, id, score)
}

fn update_assignment_score_impl(
    conn: &Connection,
    id: String,
    score: Option<f64>,
) -> Result<(), String> {
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
    delete_quiz_impl(&conn, id)
}

fn delete_quiz_impl(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM quizzes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete quiz failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_assignment(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    delete_assignment_impl(&conn, id)
}

fn delete_assignment_impl(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute(
        "DELETE FROM assignments WHERE id = ?1",
        rusqlite::params![id],
    )
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
    delete_quiz_column_impl(&conn, semester_year_id, subject_id, name, date)
}

fn delete_quiz_column_impl(
    conn: &Connection,
    semester_year_id: String,
    subject_id: String,
    name: String,
    date: String,
) -> Result<(), String> {
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
    delete_assignment_column_impl(&conn, semester_year_id, subject_id, name, date)
}

fn delete_assignment_column_impl(
    conn: &Connection,
    semester_year_id: String,
    subject_id: String,
    name: String,
    date: String,
) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_utils;

    #[test]
    fn empty_sheet_when_no_grade_data() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        // enrolled students are listed, but no grade columns exist
        assert_eq!(sheet.students.len(), 2);
        assert!(sheet.quizzes.is_empty());
        assert!(sheet.assignments.is_empty());
    }

    #[test]
    fn bulk_quiz_creates_row_per_enrollment() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz 1".into(),
            10.0,
            "2026-01-01".into(),
        )
        .unwrap();

        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        assert_eq!(sheet.students.len(), 2);
        assert_eq!(sheet.quizzes.len(), 1);
        assert_eq!(sheet.quizzes[0].name, "Quiz 1");
        assert_eq!(sheet.quizzes[0].max_score, 10.0);
        assert_eq!(sheet.quizzes[0].date, "2026-01-01");
        // both students have the column, unscores
        for s in &sheet.students {
            assert_eq!(s.quiz_scores, vec![None]);
            assert!(s.quiz_ids[0].is_some());
        }
    }

    #[test]
    fn pivot_maps_scores_to_students() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz 1".into(),
            10.0,
            "2026-01-01".into(),
        )
        .unwrap();

        // grade only Alice's quiz
        let sheet = get_grades_impl(&conn, sy.clone(), sub.clone()).unwrap();
        let alice = sheet
            .students
            .iter()
            .find(|s| s.student_name == "Alice")
            .unwrap();
        let qid = alice.quiz_ids[0].clone().unwrap();
        update_quiz_score_impl(&conn, qid, Some(8.5)).unwrap();

        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        let alice = sheet
            .students
            .iter()
            .find(|s| s.student_name == "Alice")
            .unwrap();
        let bob = sheet
            .students
            .iter()
            .find(|s| s.student_name == "Bob")
            .unwrap();
        assert_eq!(alice.quiz_scores, vec![Some(8.5)]);
        assert_eq!(bob.quiz_scores, vec![None]);
        assert_eq!(sheet.students[0].student_name, "Alice"); // name ordering
    }

    #[test]
    fn same_name_different_dates_are_distinct_columns() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz".into(),
            10.0,
            "2026-01-01".into(),
        )
        .unwrap();
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz".into(),
            20.0,
            "2026-02-01".into(),
        )
        .unwrap();

        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        assert_eq!(sheet.quizzes.len(), 2);
        assert_eq!(sheet.quizzes[0].max_score, 10.0);
        assert_eq!(sheet.quizzes[1].max_score, 20.0);
        for s in &sheet.students {
            assert_eq!(s.quiz_scores.len(), 2);
        }
    }

    #[test]
    fn update_score_clears_when_none() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz 1".into(),
            10.0,
            "2026-01-01".into(),
        )
        .unwrap();
        let sheet = get_grades_impl(&conn, sy.clone(), sub.clone()).unwrap();
        let qid = sheet.students[0].quiz_ids[0].clone().unwrap();
        update_quiz_score_impl(&conn, qid.clone(), Some(3.0)).unwrap();
        update_quiz_score_impl(&conn, qid, None).unwrap();
        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        assert_eq!(sheet.students[0].quiz_scores[0], None);
    }

    #[test]
    fn delete_quiz_removes_single_row() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz 1".into(),
            10.0,
            "2026-01-01".into(),
        )
        .unwrap();
        let sheet = get_grades_impl(&conn, sy.clone(), sub.clone()).unwrap();
        let qid = sheet.students[0].quiz_ids[0].clone().unwrap();
        delete_quiz_impl(&conn, qid).unwrap();
        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        assert_eq!(sheet.students[0].quiz_ids[0], None); // still 1 column but Alice has no row
        assert!(sheet.students[1].quiz_ids[0].is_some());
    }

    #[test]
    fn delete_quiz_column_scoped_to_subject_and_semester() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        // second subject with same quiz name+date
        test_utils::seed_subject(&conn, "sub-2", "Networks");
        test_utils::seed_enrollment(&conn, "enr-a2", "stu-a", &sy, "sub-2");
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz 1".into(),
            10.0,
            "2026-01-01".into(),
        )
        .unwrap();
        create_quiz_bulk_impl(
            &conn,
            sy.clone(),
            "sub-2".into(),
            "Quiz 1".into(),
            10.0,
            "2026-01-01".into(),
        )
        .unwrap();

        delete_quiz_column_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "Quiz 1".into(),
            "2026-01-01".into(),
        )
        .unwrap();

        assert!(get_grades_impl(&conn, sy.clone(), sub.clone())
            .unwrap()
            .quizzes
            .is_empty());
        assert_eq!(
            get_grades_impl(&conn, sy, "sub-2".into())
                .unwrap()
                .quizzes
                .len(),
            1
        );
    }

    #[test]
    fn assignments_pivot_and_update() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_assignment_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "HW 1".into(),
            5.0,
            "2026-01-05".into(),
        )
        .unwrap();

        let sheet = get_grades_impl(&conn, sy.clone(), sub.clone()).unwrap();
        assert_eq!(sheet.assignments.len(), 1);
        assert_eq!(sheet.assignments[0].name, "HW 1");
        assert_eq!(sheet.assignments[0].date, "2026-01-05");

        let aid = sheet.students[0].assignment_ids[0].clone().unwrap();
        update_assignment_score_impl(&conn, aid, Some(4.0)).unwrap();
        let sheet = get_grades_impl(&conn, sy.clone(), sub.clone()).unwrap();
        assert_eq!(sheet.students[0].assignment_scores[0], Some(4.0));

        delete_assignment_impl(&conn, sheet.students[1].assignment_ids[0].clone().unwrap())
            .unwrap();
        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        assert_eq!(sheet.students[1].assignment_ids[0], None);
    }

    #[test]
    fn delete_assignment_column_removes_all_in_scope() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_assignment_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "HW".into(),
            5.0,
            "2026-01-05".into(),
        )
        .unwrap();
        create_assignment_bulk_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "HW".into(),
            5.0,
            "2026-01-05".into(),
        )
        .unwrap(); // second column same name+date -> duplicates rows (no UNIQUE)

        delete_assignment_column_impl(
            &conn,
            sy.clone(),
            sub.clone(),
            "HW".into(),
            "2026-01-05".into(),
        )
        .unwrap();
        let sheet = get_grades_impl(&conn, sy, sub).unwrap();
        assert!(sheet.assignments.is_empty());
        for s in &sheet.students {
            assert!(s.assignment_ids.iter().all(|i| i.is_none()));
        }
    }
}
