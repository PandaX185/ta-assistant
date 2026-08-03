//! Shared helpers for unit tests: in-memory DB + seed fixtures.
//!
//! The command modules are structured as thin `#[tauri::command]` wrappers
//! around `*_impl(&Connection)` functions so the real logic can be tested
//! against a fresh in-memory SQLite database with all migrations applied.

use rusqlite::Connection;

/// Opens an in-memory SQLite connection with all migrations applied.
pub fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    // The production DB doesn't enable FK enforcement (flagged separately),
    // but tests validate the schema's declared cascade behavior.
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .expect("enable foreign keys");
    crate::db::migrations::run_pending(&conn).expect("run migrations");
    conn
}

pub fn seed_semester(conn: &Connection, id: &str, year: i64, semester: &str) {
    conn.execute(
        "INSERT INTO semester_years (id, year, semester) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, year, semester],
    )
    .expect("seed semester_year");
}

pub fn seed_subject(conn: &Connection, id: &str, name: &str) {
    conn.execute(
        "INSERT INTO subjects (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )
    .expect("seed subject");
}

pub fn seed_student(conn: &Connection, id: &str, name: &str) {
    conn.execute(
        "INSERT INTO students (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )
    .expect("seed student");
}

pub fn seed_enrollment(
    conn: &Connection,
    id: &str,
    student_id: &str,
    semester_year_id: &str,
    subject_id: &str,
) {
    conn.execute(
        "INSERT INTO enrollments (id, student_id, semester_year_id, subject_id)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, student_id, semester_year_id, subject_id],
    )
    .expect("seed enrollment");
}

/// Standard fixture: one semester (Fall 2026), one subject, two students enrolled.
/// Returns the four IDs in order: (semester_year_id, subject_id, student_a, student_b).
pub fn seed_basic_scenario(conn: &Connection) -> (String, String, String, String) {
    let sy = "sy-1";
    let sub = "sub-1";
    let a = "stu-a";
    let b = "stu-b";
    seed_semester(conn, sy, 2026, "Fall");
    seed_subject(conn, sub, "Databases");
    seed_student(conn, a, "Alice");
    seed_student(conn, b, "Bob");
    seed_enrollment(conn, "enr-a", a, sy, sub);
    seed_enrollment(conn, "enr-b", b, sy, sub);
    (
        sy.to_string(),
        sub.to_string(),
        a.to_string(),
        b.to_string(),
    )
}
