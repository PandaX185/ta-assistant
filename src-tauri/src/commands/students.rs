use rusqlite::Connection;
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
    pub id: Option<String>,
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
    get_students_impl(&conn)
}

fn get_students_impl(conn: &Connection) -> Result<Vec<Student>, String> {
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
pub fn create_student(
    app: AppHandle,
    name: String,
    email: Option<String>,
    student_id: Option<String>,
) -> Result<String, String> {
    let conn = crate::db::open_db(&app)?;
    create_student_impl(&conn, name, email, student_id)
}

fn create_student_impl(
    conn: &Connection,
    name: String,
    email: Option<String>,
    student_id: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO students (id, name, email, student_id) VALUES (?, ?, ?, ?)",
        rusqlite::params![id, name, email, student_id],
    )
    .map_err(|e| format!("Create student failed: {e}"))?;
    Ok(id)
}

#[tauri::command]
pub fn update_student(
    app: AppHandle,
    id: String,
    name: String,
    email: Option<String>,
    student_id: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    update_student_impl(&conn, id, name, email, student_id)
}

fn update_student_impl(
    conn: &Connection,
    id: String,
    name: String,
    email: Option<String>,
    student_id: Option<String>,
) -> Result<(), String> {
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
    delete_student_impl(&conn, id)
}

fn delete_student_impl(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM students WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete student failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_enrollments(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    section_id: String,
) -> Result<Vec<Enrollment>, String> {
    let conn = crate::db::open_db(&app)?;
    get_enrollments_impl(&conn, semester_year_id, subject_id, section_id)
}

fn get_enrollments_impl(
    conn: &Connection,
    semester_year_id: String,
    subject_id: String,
    section_id: String,
) -> Result<Vec<Enrollment>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.student_id, e.semester_year_id, e.subject_id, s.name, s.student_id
             FROM enrollments e
             JOIN students s ON s.id = e.student_id
             WHERE e.semester_year_id = ?1 AND e.subject_id = ?2 AND e.section_id = ?3
             ORDER BY s.name",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let rows = stmt
        .query_map(
            rusqlite::params![semester_year_id, subject_id, section_id],
            |row| {
                Ok(Enrollment {
                    id: row.get(0)?,
                    student_id: row.get(1)?,
                    semester_year_id: row.get(2)?,
                    subject_id: row.get(3)?,
                    student_name: row.get(4)?,
                    student_code: row.get(5)?,
                })
            },
        )
        .map_err(|e| format!("Query failed: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row failed: {e}"))?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_enrollment(
    app: AppHandle,
    student_id: String,
    semester_year_id: String,
    subject_id: String,
    section_id: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    create_enrollment_impl(&conn, student_id, semester_year_id, subject_id, section_id)
}

fn create_enrollment_impl(
    conn: &Connection,
    student_id: String,
    semester_year_id: String,
    subject_id: String,
    section_id: String,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO enrollments (id, student_id, semester_year_id, subject_id, section_id) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            student_id,
            semester_year_id,
            subject_id,
            section_id
        ],
    )
    .map_err(|e| format!("Create enrollment failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_enrollment(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    delete_enrollment_impl(&conn, id)
}

fn delete_enrollment_impl(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute(
        "DELETE FROM enrollments WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete enrollment failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_student_detail(app: AppHandle, enrollment_id: String) -> Result<StudentDetail, String> {
    let conn = crate::db::open_db(&app)?;
    get_student_detail_impl(&conn, enrollment_id)
}

fn get_student_detail_impl(
    conn: &Connection,
    enrollment_id: String,
) -> Result<StudentDetail, String> {
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

    // Get attendance: one row per lecture in the student's section, so the
    // denominator is the real lecture count (unmarked lectures show as absent).
    let mut attstmt = conn
        .prepare(
            "SELECT a.id, l.id, l.date, l.title, COALESCE(a.status, 'absent')
             FROM lectures l
             JOIN enrollments e ON e.id = ?1 AND e.section_id = l.section_id
             LEFT JOIN attendance a ON a.lecture_id = l.id AND a.enrollment_id = e.id
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

/// Fuzzy-match existing students by name or student_id (case-insensitive partial).
/// Used by the find-or-create picker to reuse existing students instead of duplicating.
#[tauri::command]
pub fn find_students(app: AppHandle, query: String) -> Result<Vec<Student>, String> {
    let conn = crate::db::open_db(&app)?;
    find_students_impl(&conn, &query)
}

fn find_students_impl(conn: &Connection, query: &str) -> Result<Vec<Student>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let like = format!("%{}%", q.to_lowercase());
    let mut stmt = conn
        .prepare(
            "SELECT id, name, email, student_id FROM students
             WHERE lower(name) LIKE ?1 OR lower(coalesce(student_id, '')) LIKE ?1
             ORDER BY name LIMIT 20",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![like], |row| {
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
        result.push(row.map_err(|e| format!("Row failed: {e}"))?);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_utils;

    #[test]
    fn create_student_returns_id_and_appears_in_list() {
        let conn = test_utils::test_conn();
        let id = create_student_impl(
            &conn,
            "Alice".into(),
            Some("a@x.com".into()),
            Some("123".into()),
        )
        .unwrap();
        let students = get_students_impl(&conn).unwrap();
        assert_eq!(students.len(), 1);
        assert_eq!(students[0].id, id);
        assert_eq!(students[0].name, "Alice");
        assert_eq!(students[0].email.as_deref(), Some("a@x.com"));
        assert_eq!(students[0].student_id.as_deref(), Some("123"));
    }

    #[test]
    fn students_ordered_by_name() {
        let conn = test_utils::test_conn();
        create_student_impl(&conn, "Zoe".into(), None, None).unwrap();
        create_student_impl(&conn, "Anna".into(), None, None).unwrap();
        let students = get_students_impl(&conn).unwrap();
        let names: Vec<&str> = students.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["Anna", "Zoe"]);
    }

    #[test]
    fn update_student_changes_fields() {
        let conn = test_utils::test_conn();
        let id = create_student_impl(&conn, "Bob".into(), None, None).unwrap();
        update_student_impl(
            &conn,
            id.clone(),
            "Robert".into(),
            Some("b@x.com".into()),
            Some("9".into()),
        )
        .unwrap();
        let s = get_students_impl(&conn)
            .unwrap()
            .into_iter()
            .find(|s| s.id == id)
            .unwrap();
        assert_eq!(s.name, "Robert");
        assert_eq!(s.email.as_deref(), Some("b@x.com"));
        assert_eq!(s.student_id.as_deref(), Some("9"));
    }

    #[test]
    fn delete_student_cascades_enrollments() {
        let conn = test_utils::test_conn();
        let (sy, sub, a, _b) = test_utils::seed_basic_scenario(&conn);
        test_utils::seed_section(&conn, "sec-1", &sy, &sub);
        delete_student_impl(&conn, a).unwrap();
        let enr = get_enrollments_impl(&conn, sy, sub, "sec-1".into()).unwrap();
        // Alice's enrollment cascaded away; Bob's remains
        assert_eq!(enr.len(), 1);
        assert_eq!(enr[0].student_name, "Bob");
    }

    #[test]
    fn get_enrollments_joins_student_and_filters() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        test_utils::seed_student(&conn, "stu-c", "Charlie");
        test_utils::seed_enrollment(&conn, "enr-c", "stu-c", &sy, &sub);
        // enrollment in another semester should be excluded
        test_utils::seed_semester(&conn, "sy-2", 2025, "Spring");
        test_utils::seed_enrollment(&conn, "enr-d", "stu-c", "sy-2", &sub);
        // assign every NULL-section enrollment to the default section
        test_utils::seed_section(&conn, "sec-1", &sy, &sub);

        let enr = get_enrollments_impl(&conn, sy.clone(), sub.clone(), "sec-1".into()).unwrap();
        assert_eq!(enr.len(), 3);
        assert!(enr
            .iter()
            .all(|e| e.semester_year_id == sy && e.subject_id == sub));
        let names: Vec<&str> = enr.iter().map(|e| e.student_name.as_str()).collect();
        assert_eq!(names, vec!["Alice", "Bob", "Charlie"]);
    }

    #[test]
    fn create_enrollment_rejects_duplicate() {
        let conn = test_utils::test_conn();
        let (sy, sub, a, _b) = test_utils::seed_basic_scenario(&conn);
        let err = create_enrollment_impl(&conn, a, sy, sub, "sec-1".into()).unwrap_err();
        assert!(err.contains("Create enrollment failed"), "{err}");
    }

    #[test]
    fn delete_enrollment_removes_row() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        test_utils::seed_section(&conn, "sec-1", &sy, &sub);
        delete_enrollment_impl(&conn, "enr-a".into()).unwrap();
        assert_eq!(
            get_enrollments_impl(&conn, sy, sub, "sec-1".into())
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn get_student_detail_aggregates_all_data() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        conn.execute(
            "INSERT INTO quizzes (id, enrollment_id, name, max_score, score, date) VALUES ('q1', 'enr-a', 'Quiz 1', 10, 8.5, '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO assignments (id, enrollment_id, name, max_score, score, due_date) VALUES ('a1', 'enr-a', 'HW 1', 5, 4.0, '2026-01-05')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO lectures (id, subject_id, semester_year_id, section_id, title, date) VALUES ('l1', ?1, ?2, 'sec-1', 'Intro', '2026-02-01')",
            rusqlite::params![sub, sy],
        )
        .unwrap();
        // Second lecture with no attendance row: must show as absent, not be dropped
        conn.execute(
            "INSERT INTO lectures (id, subject_id, semester_year_id, section_id, title, date) VALUES ('l2', ?1, ?2, 'sec-1', 'No Show', '2026-02-08')",
            rusqlite::params![sub, sy],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO attendance (id, lecture_id, enrollment_id, status) VALUES ('att1', 'l1', 'enr-a', 'present')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bonuses (id, enrollment_id, value, reason, date) VALUES ('b1', 'enr-a', 1.0, 'Participation', '2026-02-02')",
            [],
        )
        .unwrap();

        let d = get_student_detail_impl(&conn, "enr-a".into()).unwrap();
        assert_eq!(d.student_name, "Alice");
        assert_eq!(d.student_id, "stu-a");
        assert_eq!(d.quizzes.len(), 1);
        assert_eq!(d.quizzes[0].name, "Quiz 1");
        assert_eq!(d.quizzes[0].max_score, 10.0);
        assert_eq!(d.quizzes[0].score, Some(8.5));
        assert_eq!(d.assignments.len(), 1);
        assert_eq!(d.assignments[0].score, Some(4.0));
        assert_eq!(d.attendance.len(), 2);
        assert_eq!(d.attendance[0].status, "present");
        assert_eq!(d.attendance[0].lecture_title.as_deref(), Some("Intro"));
        assert_eq!(d.attendance[1].status, "absent");
        assert_eq!(d.attendance[1].id, None);
        assert_eq!(d.attendance[1].lecture_title.as_deref(), Some("No Show"));
        assert_eq!(d.bonuses.len(), 1);
        assert_eq!(d.bonuses[0].value, 1.0);
        assert_eq!(d.bonuses[0].reason, "Participation");
    }

    #[test]
    fn get_student_detail_empty_when_no_data() {
        let conn = test_utils::test_conn();
        let (_sy, _sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        let d = get_student_detail_impl(&conn, "enr-a".into()).unwrap();
        assert!(d.quizzes.is_empty());
        assert!(d.assignments.is_empty());
        assert!(d.attendance.is_empty());
        assert!(d.bonuses.is_empty());
        assert_eq!(d.student_name, "Alice");
    }

    #[test]
    fn find_students_matches_name_partial_and_case_insensitive() {
        let conn = test_utils::test_conn();
        create_student_impl(&conn, "Ahmed Khalil".into(), None, Some("2026-0042".into())).unwrap();
        create_student_impl(&conn, "Sara Omar".into(), None, Some("2026-0099".into())).unwrap();

        let hits = find_students_impl(&conn, "ahmed").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "Ahmed Khalil");
        assert_eq!(hits[0].student_id.as_deref(), Some("2026-0042"));

        // partial middle-of-name match
        let hits = find_students_impl(&conn, "omar").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "Sara Omar");
    }

    #[test]
    fn find_students_matches_student_id_partial() {
        let conn = test_utils::test_conn();
        create_student_impl(&conn, "Ahmed Khalil".into(), None, Some("2026-0042".into())).unwrap();
        create_student_impl(&conn, "Sara Omar".into(), None, Some("2026-0099".into())).unwrap();

        let hits = find_students_impl(&conn, "0042").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "Ahmed Khalil");
    }

    #[test]
    fn find_students_empty_query_returns_nothing() {
        let conn = test_utils::test_conn();
        create_student_impl(&conn, "Alice".into(), None, None).unwrap();
        assert!(find_students_impl(&conn, "").unwrap().is_empty());
        assert!(find_students_impl(&conn, "   ").unwrap().is_empty());
    }
}
