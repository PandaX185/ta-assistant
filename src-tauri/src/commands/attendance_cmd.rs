use rusqlite::Connection;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct LectureWithAttendance {
    pub id: String,
    pub subject_id: String,
    pub semester_year_id: Option<String>,
    pub date: String,
    pub title: Option<String>,
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
    get_lectures_impl(&conn, semester_year_id, subject_id)
}

fn get_lectures_impl(
    conn: &Connection,
    semester_year_id: String,
    subject_id: String,
) -> Result<Vec<LectureWithAttendance>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, subject_id, semester_year_id, date, title
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
                title: row.get(4)?,
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
    title: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    create_lecture_impl(&conn, subject_id, semester_year_id, date, title)
}

fn create_lecture_impl(
    conn: &Connection,
    subject_id: String,
    semester_year_id: String,
    date: String,
    title: Option<String>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO lectures (id, subject_id, semester_year_id, date, title)
         VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            subject_id,
            semester_year_id,
            date,
            title,
        ],
    )
    .map_err(|e| format!("Create lecture failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_lecture(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    delete_lecture_impl(&conn, id)
}

fn delete_lecture_impl(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM lectures WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete lecture failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_attendance(app: AppHandle, lecture_id: String) -> Result<Vec<AttendanceRecord>, String> {
    let conn = crate::db::open_db(&app)?;
    get_attendance_impl(&conn, lecture_id)
}

fn get_attendance_impl(
    conn: &Connection,
    lecture_id: String,
) -> Result<Vec<AttendanceRecord>, String> {
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
    mark_attendance_impl(&conn, lecture_id, enrollment_id, status)
}

fn mark_attendance_impl(
    conn: &Connection,
    lecture_id: String,
    enrollment_id: String,
    status: String,
) -> Result<(), String> {
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
    seed_attendance_impl(&conn, lecture_id, semester_year_id, subject_id)
}

fn seed_attendance_impl(
    conn: &Connection,
    lecture_id: String,
    semester_year_id: String,
    subject_id: String,
) -> Result<(), String> {
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
             VALUES (?, ?, ?, 'absent')",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), lecture_id, enr_id],
        )
        .map_err(|e| format!("Insert attendance failed: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_utils;

    fn seeded_conn() -> (Connection, String, String) {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        create_lecture_impl(&conn, sub.clone(), sy.clone(), "2026-02-01".into(), Some("Intro".into())).unwrap();
        create_lecture_impl(&conn, sub.clone(), sy.clone(), "2026-02-08".into(), None).unwrap();
        (conn, sy, sub)
    }

    #[test]
    fn lectures_ordered_by_date_desc_scoped_to_subject() {
        let (conn, sy, sub) = seeded_conn();
        // lecture for another subject must not appear
        test_utils::seed_subject(&conn, "sub-2", "Networks");
        create_lecture_impl(&conn, "sub-2".into(), sy.clone(), "2026-02-15".into(), None).unwrap();

        let lectures = get_lectures_impl(&conn, sy, sub).unwrap();
        assert_eq!(lectures.len(), 2);
        assert_eq!(lectures[0].date, "2026-02-08");
        assert_eq!(lectures[1].date, "2026-02-01");
        assert_eq!(lectures[1].title.as_deref(), Some("Intro"));
    }

    #[test]
    fn create_lecture_rejects_duplicate_date() {
        let (conn, sy, sub) = seeded_conn();
        let err = create_lecture_impl(&conn, sub, sy, "2026-02-01".into(), None).unwrap_err();
        assert!(err.contains("Create lecture failed"), "{err}");
    }

    #[test]
    fn delete_lecture_removes_and_cascades_attendance() {
        let (conn, sy, sub) = seeded_conn();
        let lectures = get_lectures_impl(&conn, sy.clone(), sub.clone()).unwrap();
        let lid = lectures[0].id.clone();
        seed_attendance_impl(&conn, lid.clone(), sy.clone(), sub.clone()).unwrap();
        assert_eq!(get_attendance_impl(&conn, lid.clone()).unwrap().len(), 2);
        delete_lecture_impl(&conn, lid).unwrap();
        assert_eq!(get_lectures_impl(&conn, sy, sub).unwrap().len(), 1);
    }

    #[test]
    fn seed_attendance_fills_absent_and_is_idempotent() {
        let (conn, sy, sub) = seeded_conn();
        let lectures = get_lectures_impl(&conn, sy.clone(), sub.clone()).unwrap();
        let lid = lectures[0].id.clone();

        seed_attendance_impl(&conn, lid.clone(), sy.clone(), sub.clone()).unwrap();
        seed_attendance_impl(&conn, lid.clone(), sy.clone(), sub.clone()).unwrap(); // idempotent

        let recs = get_attendance_impl(&conn, lid.clone()).unwrap();
        assert_eq!(recs.len(), 2);
        assert!(recs.iter().all(|r| r.status == "absent"));
    }

    #[test]
    fn seed_attendance_does_not_overwrite_existing() {
        let (conn, sy, sub) = seeded_conn();
        let lectures = get_lectures_impl(&conn, sy.clone(), sub.clone()).unwrap();
        let lid = lectures[0].id.clone();
        mark_attendance_impl(&conn, lid.clone(), "enr-a".into(), "present".into()).unwrap();

        seed_attendance_impl(&conn, lid.clone(), sy.clone(), sub.clone()).unwrap();
        let recs = get_attendance_impl(&conn, lid).unwrap();
        assert_eq!(recs.len(), 2);
        let alice = recs.iter().find(|r| r.enrollment_id == "enr-a").unwrap();
        let bob = recs.iter().find(|r| r.enrollment_id == "enr-b").unwrap();
        assert_eq!(alice.status, "present");
        assert_eq!(bob.status, "absent");
    }

    #[test]
    fn mark_attendance_upserts() {
        let (conn, sy, sub) = seeded_conn();
        let lectures = get_lectures_impl(&conn, sy, sub).unwrap();
        let lid = lectures[0].id.clone();

        mark_attendance_impl(&conn, lid.clone(), "enr-a".into(), "present".into()).unwrap();
        mark_attendance_impl(&conn, lid.clone(), "enr-a".into(), "late".into()).unwrap();

        let recs = get_attendance_impl(&conn, lid).unwrap();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].status, "late");
        assert_eq!(recs[0].student_name, "Alice");
    }

    #[test]
    fn get_attendance_orders_by_student_name() {
        let (conn, sy, sub) = seeded_conn();
        let lectures = get_lectures_impl(&conn, sy, sub).unwrap();
        let lid = lectures[0].id.clone();
        mark_attendance_impl(&conn, lid.clone(), "enr-b".into(), "present".into()).unwrap();
        mark_attendance_impl(&conn, lid, "enr-a".into(), "present".into()).unwrap();
        let recs = get_attendance_impl(&conn, lectures[0].id.clone()).unwrap();
        assert_eq!(recs[0].student_name, "Alice");
        assert_eq!(recs[1].student_name, "Bob");
    }
}
