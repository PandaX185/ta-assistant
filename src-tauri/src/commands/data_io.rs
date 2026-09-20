//! Data import/export (CSV) and whole-app backup/restore.
//!
//! All file I/O lives in Rust commands — never in the webview — so the `fs`
//! plugin capability scope stays exactly as narrow as it is today (`content://**`
//! attachments only). The webview only picks a path through the `dialog`
//! plugin and hands it to these commands; the CSV logic is stdlib-only (no new
//! crates) and heavy work runs on a blocking worker so the webview stays
//! responsive while a big roster or a full backup loads.
//!
//! Backup/restore format: a JSON document containing (a) a manifest, (b) the
//! `_schema_migrations` versions recorded when the backup was taken, and
//! (c) every user-data table as columns + JSON rows. Restore replays those
//! rows as INSERT statements. It is a schema-aware dump, not a raw SQLite file
//! copy, so it survives SQLite version differences and can be inspected by
//! hand. Restore is all-or-nothing: the dump is first replayed on a scratch
//! in-memory database (schema + foreign-key consistency), then applied to the
//! real database inside a single transaction that rolls back on any failure.
//!
//! Note on paths: they may be real filesystem paths or Android SAF
//! `content://` URIs (what the dialog plugin returns on each platform); SAF
//! I/O routes through the local `saf-io` plugin because the fs plugin's
//! content-URI write path is broken upstream (0-byte metadata,
//! tauri-apps/plugins-workspace#3356).

use crate::commands::students::{create_enrollment_impl, create_student_impl, delete_student_impl};
use rusqlite::types::ValueRef;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

// ---------------------------------------------------------------------------
// CSV helpers (stdlib only)
// ---------------------------------------------------------------------------

struct CsvParser {
    rows: Vec<Vec<String>>,
    row: Vec<String>,
    field: String,
    in_quotes: bool,
}

fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let mut p = CsvParser {
        rows: Vec::new(),
        row: Vec::new(),
        field: String::new(),
        in_quotes: false,
    };
    p.read(text);
    p.finish();
    p.rows.retain(|r| r.iter().any(|f| !f.trim().is_empty()));
    p.rows
}

impl CsvParser {
    fn read(&mut self, text: &str) {
        let mut chars = text.chars().peekable();
        while let Some(c) = chars.next() {
            match (c, self.in_quotes) {
                ('"', true) => {
                    if let Some('"') = chars.peek() {
                        self.field.push('"');
                        chars.next();
                    } else {
                        self.in_quotes = false;
                    }
                }
                ('"', false) => self.in_quotes = true,
                (',', false) => self.end_field(),
                ('\r', false) => {}
                ('\n', false) => self.end_row(),
                _ => self.field.push(c),
            }
        }
    }

    fn end_field(&mut self) {
        self.row.push(std::mem::take(&mut self.field));
    }

    fn end_row(&mut self) {
        self.row.push(std::mem::take(&mut self.field));
        self.rows.push(std::mem::take(&mut self.row));
    }

    fn finish(&mut self) {
        if !self.field.is_empty() || !self.row.is_empty() {
            self.row.push(std::mem::take(&mut self.field));
            self.rows.push(std::mem::take(&mut self.row));
        }
    }
}

fn csv_field(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn to_csv(rows: &[Vec<String>]) -> String {
    let mut out = String::new();
    for row in rows {
        out.push_str(
            &row.iter()
                .map(|f| csv_field(f))
                .collect::<Vec<_>>()
                .join(","),
        );
        out.push('\n');
    }
    out
}

fn fmt_score(v: f64) -> String {
    if v.fract() == 0.0 {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}

// ---------------------------------------------------------------------------
// Import: roster CSV -> students + enrollments
// ---------------------------------------------------------------------------

/// Aggregated result of one roster import, shown to the teacher so they know
/// exactly what happened per row (nothing is silently dropped).
#[derive(Serialize, Debug, Default)]
pub struct ImportReport {
    /// Brand-new students that were created *and* enrolled.
    pub created: usize,
    /// Existing students that were matched an (re-)enrolled.
    pub matched: usize,
    /// Rows intentionally left alone, with a human-readable reason.
    pub skipped: Vec<String>,
    /// Non-fatal per-row errors (row number + message).
    pub errors: Vec<String>,
}

/// How one roster row resolved against the students table.
enum Matched {
    /// Exactly one student with this key — safe to reuse.
    Student(String),
    /// More than one student shares this key — cannot decide, row is skipped.
    Ambiguous(String),
    /// No student has this key.
    NoMatch,
}

/// Trim a CSV cell, returning `None` for a blank value.
fn cell(row: &[String], i: usize) -> Option<String> {
    let raw = row.get(i).map(|s| s.trim()).unwrap_or("");
    if raw.is_empty() {
        None
    } else {
        Some(raw.to_string())
    }
}

/// Case-insensitive lookup of a single `students` column; `LIMIT 2` so we can
/// tell "exactly one" apart from "ambiguous". `column` comes only from the
/// hardcoded call sites below — never from user input.
fn find_by_key(conn: &Connection, column: &str, value: Option<&str>) -> Result<Matched, String> {
    let value = match value {
        Some(v) => v,
        None => return Ok(Matched::NoMatch),
    };
    let sql = format!(
        "SELECT id FROM students
         WHERE {column} = ?1 COLLATE NOCASE
         ORDER BY (student_id IS NULL), name COLLATE NOCASE
         LIMIT 2"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("match query prepare failed: {e}"))?;
    let mut rows = stmt
        .query_map(params![value], |row| row.get::<_, String>(0))
        .map_err(|e| format!("match query failed: {e}"))?;
    let first = rows
        .next()
        .transpose()
        .map_err(|e| format!("match row failed: {e}"))?;
    let second = rows
        .next()
        .transpose()
        .map_err(|e| format!("match row failed: {e}"))?;
    match (first, second) {
        (Some(id), None) => Ok(Matched::Student(id)),
        (Some(_), Some(_)) => Ok(Matched::Ambiguous(value.to_string())),
        _ => Ok(Matched::NoMatch),
    }
}

/// Resolve an import row to an existing student. Priority: exact `student_id`
/// -> `phone` -> unique `name`. Email is deliberately NOT a match key (many
/// students share a domain).
fn match_student(
    conn: &Connection,
    name: &str,
    student_id: Option<String>,
    phone: Option<String>,
) -> Result<Matched, String> {
    let by_id = find_by_key(conn, "student_id", student_id.as_deref())?;
    if !matches!(by_id, Matched::NoMatch) {
        return Ok(by_id);
    }
    let by_phone = find_by_key(conn, "phone", phone.as_deref())?;
    if !matches!(by_phone, Matched::NoMatch) {
        return Ok(by_phone);
    }
    find_by_key(conn, "name", Some(name))
}

/// Has this student already been enrolled in this semester/subject (any
/// section)? Enrollments are unique per (student, semester, subject), so
/// re-enrolling in a different section of the same subject is impossible by
/// design — the section is part of the same enrollment row. Such rows are
/// skipped and reported, never double-inserted.
fn already_enrolled(
    conn: &Connection,
    student_id: &str,
    semester_year_id: &str,
    subject_id: &str,
) -> Result<bool, String> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM enrollments
             WHERE student_id = ?1 AND semester_year_id = ?2 AND subject_id = ?3
             LIMIT 1",
            params![student_id, semester_year_id, subject_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("enrollment check failed: {e}"))?;
    Ok(exists.is_some())
}

/// Identity fields for one CSV row, grouped so `import_one` keeps a small
/// signature.
struct ImportRow {
    name: String,
    email: Option<String>,
    student_id: Option<String>,
    phone: Option<String>,
}

/// Import one CSV row: match or create the student, then enroll. Pushes the
/// outcome into `report` — nothing is silently dropped.
fn import_one(
    conn: &Connection,
    row: ImportRow,
    semester_year_id: &str,
    subject_id: &str,
    section_id: &str,
    row_no: usize,
    report: &mut ImportReport,
) {
    let ImportRow {
        name,
        email,
        student_id,
        phone,
    } = row;
    let matched = match match_student(conn, &name, student_id.clone(), phone.clone()) {
        Ok(m) => m,
        Err(e) => {
            report.errors.push(format!("Row {row_no}: {e}"));
            return;
        }
    };

    let (id, created) = match matched {
        Matched::Student(id) => (id, false),
        Matched::Ambiguous(key) => {
            report.skipped.push(format!(
                "Row {row_no}: {name} matches multiple students ({key})"
            ));
            return;
        }
        Matched::NoMatch => match create_student_impl(conn, name.clone(), email, student_id, phone)
        {
            Ok(id) => (id, true),
            Err(e) => {
                report.errors.push(format!("Row {row_no}: {e}"));
                return;
            }
        },
    };

    match already_enrolled(conn, &id, semester_year_id, subject_id) {
        Ok(true) => {
            report.skipped.push(format!(
                "Row {row_no}: {name} is already enrolled in this subject"
            ));
            return;
        }
        Ok(false) => {}
        Err(e) => {
            report.errors.push(format!("Row {row_no}: {e}"));
            return;
        }
    }

    if let Err(e) = create_enrollment_impl(
        conn,
        id.clone(),
        semester_year_id.to_string(),
        subject_id.to_string(),
        section_id.to_string(),
    ) {
        if created {
            let _ = delete_student_impl(conn, &id); // clean up our new student
        }
        report.errors.push(format!("Row {row_no}: {e}"));
        return;
    }

    if created {
        report.created += 1;
    } else {
        report.matched += 1;
    }
}

/// Parse a roster CSV and import every row into one section. Column order is
/// `name,id,email,phone` (matching the export); a leading header row is
/// detected by a first cell of `name`. Blank lines are ignored. Every row is
/// independent: one bad row never blocks the rest, and the report tells the
/// caller exactly what happened.
fn import_csv_impl(
    conn: &Connection,
    text: &str,
    semester_year_id: &str,
    subject_id: &str,
    section_id: &str,
) -> Result<ImportReport, String> {
    let rows = parse_csv(text);
    if rows.is_empty() {
        return Err("The file is empty — nothing to import".into());
    }

    let mut report = ImportReport::default();
    let start = if rows[0]
        .first()
        .map(|c| c.trim().eq_ignore_ascii_case("name"))
        .unwrap_or(false)
    {
        1
    } else {
        0
    };

    for (i, row) in rows.iter().enumerate().skip(start) {
        if row.iter().all(|f| f.trim().is_empty()) {
            continue;
        }
        let row_no = i + 1;
        match cell(row, 0) {
            Some(name) => import_one(
                conn,
                ImportRow {
                    name,
                    email: cell(row, 2),
                    student_id: cell(row, 1),
                    phone: cell(row, 3),
                },
                semester_year_id,
                subject_id,
                section_id,
                row_no,
                &mut report,
            ),
            None => report.errors.push(format!("Row {row_no}: missing name")),
        }
    }
    Ok(report)
}

// ---------------------------------------------------------------------------
// Shared section helpers
// ---------------------------------------------------------------------------

/// Sanity check used by every scoped command: is the section actually part of
/// this semester/subject? The frontend always sends matching IDs, but we
/// check rather than trust.
fn ensure_section_scoped(
    conn: &Connection,
    semester_year_id: &str,
    subject_id: &str,
    section_id: &str,
) -> Result<(), String> {
    let scoped: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM sections
             WHERE id = ?1 AND semester_year_id = ?2 AND subject_id = ?3",
            params![section_id, semester_year_id, subject_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("section scope check failed: {e}"))?;
    if scoped.is_none() {
        return Err(format!(
            "Section {section_id} is not part of that semester/subject"
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Export: roster CSV
// ---------------------------------------------------------------------------

/// Header row for a roster export — identical to what the import expects, so
/// a class you export once can be imported elsewhere without surprises.
fn roster_header() -> Vec<String> {
    vec!["name".into(), "id".into(), "email".into(), "phone".into()]
}

/// Enrolled rows for one section, ordered by name. Column order matches the
/// roster format used by the import, so an exported roster round-trips.
fn section_enrollments(conn: &Connection, section_id: &str) -> Result<Vec<Vec<String>>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.name, COALESCE(s.student_id, ''), COALESCE(s.email, ''),
                    COALESCE(s.phone, '')
             FROM enrollments e
             JOIN students s ON s.id = e.student_id
             WHERE e.section_id = ?1
             ORDER BY s.name COLLATE NOCASE, s.id",
        )
        .map_err(|e| format!("roster query prepare failed: {e}"))?;
    let rows = stmt
        .query_map(params![section_id], |row| {
            Ok(vec![
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ])
        })
        .map_err(|e| format!("roster query failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("roster row failed: {e}"))?;
    Ok(rows)
}

fn write_utf8(path: &Path, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents.as_bytes())
        .map_err(|e| format!("Write {} failed: {e}", path.display()))
}

// ---------------------------------------------------------------------------
// User-picked I/O (filesystem paths or Android SAF content:// URIs)
// ---------------------------------------------------------------------------

const CONTENT_SCHEME: &str = "content://";

fn is_content_uri(path: &str) -> bool {
    path.starts_with(CONTENT_SCHEME)
}

/// Read any user-picked input: Android SAF document or filesystem path.
fn read_input(app: &AppHandle, path: &str) -> Result<Vec<u8>, String> {
    if is_content_uri(path) {
        use tauri_plugin_saf_io::SafIoExt;
        app.saf_io()
            .read(path.to_string())
            .map_err(|e| format!("Read failed: {e}"))
    } else {
        std::fs::read(path).map_err(|e| format!("Read {path:?} failed: {e}"))
    }
}

/// Write to any user-picked destination. SAF documents must be written
/// through the saf-io plugin (fs-plugin writes leave 0-byte metadata);
/// filesystem paths keep create-parents + plain write.
fn write_output(app: &AppHandle, path: &str, bytes: &[u8]) -> Result<(), String> {
    if is_content_uri(path) {
        use tauri_plugin_saf_io::SafIoExt;
        app.saf_io()
            .write(path.to_string(), bytes)
            .map_err(|e| format!("Write failed: {e}"))
    } else {
        let p = Path::new(path);
        if let Some(parent) = p.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Create directory {} failed: {e}", parent.display()))?;
            }
        }
        std::fs::write(p, bytes).map_err(|e| format!("Write {path:?} failed: {e}"))
    }
}

fn read_input_string(app: &AppHandle, path: &str) -> Result<String, String> {
    let bytes = read_input(app, path)?;
    String::from_utf8(bytes).map_err(|_| "File is not valid UTF-8".to_string())
}

/// Export the student roster of one section as a CSV file the user picked.
/// Returns the path that was written so the webview can confirm.
#[tauri::command]
pub fn export_students_csv(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    section_id: String,
    file_path: String,
) -> Result<String, String> {
    let conn = crate::db::open_db(&app)?;
    ensure_section_scoped(&conn, &semester_year_id, &subject_id, &section_id)?;

    let mut out = vec![roster_header()];
    out.extend(section_enrollments(&conn, &section_id)?);
    let csv = to_csv(&out);
    write_output(&app, &file_path, csv.as_bytes())?;
    Ok(file_path)
}

/// Import a roster CSV into one section. Student matching priority is
/// student_id -> phone -> unique name; a row whose student can't be resolved
/// cleanly is SKIPPED (never silently dropped) and reported.
#[tauri::command]
pub fn import_students_csv(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    section_id: String,
    file_path: String,
) -> Result<ImportReport, String> {
    let conn = crate::db::open_db(&app)?;
    ensure_section_scoped(&conn, &semester_year_id, &subject_id, &section_id)?;

    let text = read_input_string(&app, &file_path)?;
    import_csv_impl(&conn, &text, &semester_year_id, &subject_id, &section_id)
}

// ---------------------------------------------------------------------------
// Export: grades report (wide format)
// ---------------------------------------------------------------------------

/// One enrolled student of a section, identified by enrollment id.
struct GradeRowStudent {
    enrollment_id: String,
    name: String,
    student_code: Option<String>,
    email: Option<String>,
    phone: Option<String>,
}

/// Enrolled students for one section (ordered by name) with contact columns
/// for the report header.
fn section_enrollment_students(
    conn: &Connection,
    section_id: &str,
) -> Result<Vec<GradeRowStudent>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, s.name, s.student_id, s.email, s.phone
             FROM enrollments e JOIN students s ON s.id = e.student_id
             WHERE e.section_id = ?1
             ORDER BY s.name COLLATE NOCASE, e.id",
        )
        .map_err(|e| format!("report query prepare failed: {e}"))?;
    let rows = stmt
        .query_map(params![section_id], |row| {
            Ok(GradeRowStudent {
                enrollment_id: row.get(0)?,
                name: row.get(1)?,
                student_code: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4)?,
            })
        })
        .map_err(|e| format!("report query failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("report row failed: {e}"))?;
    Ok(rows)
}

/// Value cell for a graded row (score), or empty when the row has no score yet.
fn score_cell(score: Option<f64>) -> String {
    score.map(fmt_score).unwrap_or_default()
}

/// One wide-report column: display name and its max score.
type GradedColumn = (String, f64);
/// Quiz columns then assignment columns — the "columns" of the wide report.
type GradedColumns = (Vec<GradedColumn>, Vec<GradedColumn>);

/// Distinct (name, max) pairs for quizzes then assignments across all
/// enrollments in the section — the "columns" of the wide report.
fn graded_columns(conn: &Connection, section_id: &str) -> Result<GradedColumns, String> {
    let quizzes = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT q.name, q.max_score
                 FROM quizzes q
                 JOIN enrollments e ON e.id = q.enrollment_id
                 WHERE e.section_id = ?1
                 ORDER BY q.name COLLATE NOCASE",
            )
            .map_err(|e| format!("quiz cols prepare failed: {e}"))?;
        let rows = stmt
            .query_map(params![section_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("quiz cols failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("quiz col row failed: {e}"))?;
        rows
    };
    let assignments = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT a.name, a.max_score
                 FROM assignments a
                 JOIN enrollments e ON e.id = a.enrollment_id
                 WHERE e.section_id = ?1
                 ORDER BY a.name COLLATE NOCASE",
            )
            .map_err(|e| format!("assignment cols prepare failed: {e}"))?;
        let rows = stmt
            .query_map(params![section_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("assignment cols failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("assignment col row failed: {e}"))?;
        rows
    };
    Ok((quizzes, assignments))
}

/// Look up one graded score: newest row with this exact name for the
/// enrollment, or None when it hasn't been graded yet.
fn graded_score(
    conn: &Connection,
    enrollment_id: &str,
    name: &str,
    table: &str,
) -> Result<Option<f64>, String> {
    let sql = format!(
        "SELECT score FROM {table}
         WHERE enrollment_id = ?1 AND name = ?2 COLLATE NOCASE
         ORDER BY max_score DESC LIMIT 1"
    );
    match conn.query_row(&sql, params![enrollment_id, name], |row| {
        row.get::<_, Option<f64>>(0)
    }) {
        Ok(score) => Ok(score),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("graded score {table} failed: {e}")),
    }
}

/// (present, absent, late, excused) counts for one enrollment.
struct AttendanceCounts {
    present: u32,
    absent: u32,
    late: u32,
    excused: u32,
}

fn attendance_counts(conn: &Connection, enrollment_id: &str) -> Result<AttendanceCounts, String> {
    let mut stmt = conn
        .prepare(
            "SELECT status, COUNT(*) FROM attendance
             WHERE enrollment_id = ?1 GROUP BY status",
        )
        .map_err(|e| format!("attendance count prepare failed: {e}"))?;
    let rows = stmt
        .query_map(params![enrollment_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("attendance count failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("attendance count row failed: {e}"))?;
    let mut a = AttendanceCounts {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
    };
    for (status, n) in rows {
        match status.as_str() {
            "present" => a.present = n as u32,
            "absent" => a.absent = n as u32,
            "late" => a.late = n as u32,
            "excused" => a.excused = n as u32,
            _ => {}
        }
    }
    Ok(a)
}

fn bonus_total(conn: &Connection, enrollment_id: &str) -> Result<f64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(value), 0) FROM bonuses WHERE enrollment_id = ?1",
        params![enrollment_id],
        |r| r.get(0),
    )
    .map_err(|e| format!("bonus total failed: {e}"))
}

/// Build the wide grades table (header + student rows) for a section.
fn grades_report(
    conn: &Connection,
    semester_year_id: &str,
    subject_id: &str,
    section_id: &str,
) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let _ = (semester_year_id, subject_id); // scope is checked by the caller
    let (quiz_cols, assign_cols) = graded_columns(conn, section_id)?;
    let mut header = vec![
        "name".to_string(),
        "id".to_string(),
        "email".to_string(),
        "phone".to_string(),
    ];
    for (name, max) in &quiz_cols {
        header.push(format!("Quiz: {name} (max {max})"));
    }
    for (name, max) in &assign_cols {
        header.push(format!("Assignment: {name} (max {max})"));
    }
    header.push("Present".into());
    header.push("Absent".into());
    header.push("Late".into());
    header.push("Excused".into());
    header.push("Bonus".into());

    let enrollments = section_enrollment_students(conn, section_id)?;
    let mut body = Vec::with_capacity(enrollments.len());
    for e in &enrollments {
        let mut row = vec![
            e.name.clone(),
            e.student_code.clone().unwrap_or_default(),
            e.email.clone().unwrap_or_default(),
            e.phone.clone().unwrap_or_default(),
        ];
        for (name, _) in &quiz_cols {
            row.push(score_cell(graded_score(
                conn,
                &e.enrollment_id,
                name,
                "quizzes",
            )?));
        }
        for (name, _) in &assign_cols {
            row.push(score_cell(graded_score(
                conn,
                &e.enrollment_id,
                name,
                "assignments",
            )?));
        }
        let att = attendance_counts(conn, &e.enrollment_id)?;
        row.push(att.present.to_string());
        row.push(att.absent.to_string());
        row.push(att.late.to_string());
        row.push(att.excused.to_string());
        row.push(fmt_score(bonus_total(conn, &e.enrollment_id)?));
        body.push(row);
    }
    Ok((header, body))
}

/// Student grade report for one section as a wide CSV: one row per student,
/// one column per graded activity (quiz/assignment), plus attendance counts
/// and the bonus total. Header stays stable so exported files diff cleanly
/// between runs.
#[tauri::command]
pub fn export_grades_report_csv(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    section_id: String,
    file_path: String,
) -> Result<String, String> {
    let conn = crate::db::open_db(&app)?;
    ensure_section_scoped(&conn, &semester_year_id, &subject_id, &section_id)?;

    let (head, body) = grades_report(&conn, &semester_year_id, &subject_id, &section_id)?;
    let mut out = vec![head];
    out.extend(body);
    let csv = to_csv(&out);
    write_output(&app, &file_path, csv.as_bytes())?;
    Ok(file_path)
}

// ---------------------------------------------------------------------------
// Generic text save (used for any user-picked plain-text export)
// ---------------------------------------------------------------------------

/// Write text to a user-picked path (from the dialog plugin's save dialog).
/// Returns the path that was written.
#[tauri::command]
pub fn save_text_file(
    app: AppHandle,
    file_path: String,
    contents: String,
) -> Result<String, String> {
    write_output(&app, &file_path, contents.as_bytes())?;
    Ok(file_path)
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

/// Every table holding user data, parents before children. Keep in sync with
/// the migrations — a new table with user data must be added here, otherwise
/// it is silently left out of backups. `_schema_migrations` is bookkeeping and
/// is handled separately.
const BACKUP_TABLES: &[&str] = &[
    "preferences",
    "semester_years",
    "subjects",
    "sections",
    "students",
    "enrollments",
    "quizzes",
    "assignments",
    "lectures",
    "attendance",
    "bonuses",
    "subject_lectures",
    "material_notes",
    "material_files",
    "material_links",
];

const BACKUP_APP: &str = "markbook";
const BACKUP_FORMAT: u32 = 1;

#[derive(Serialize, Deserialize, Debug)]
struct BackupManifest {
    app: String,
    format: u32,
    /// Number of migrations applied when the backup was taken.
    schema: u32,
    /// Unix epoch seconds.
    backed_up_at: i64,
}

/// One table's dump: column names + rows of JSON-encoded SQLite values.
#[derive(Serialize, Deserialize, Debug)]
struct TableDump {
    columns: Vec<String>,
    rows: Vec<Vec<JsonValue>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct BackupPayload {
    manifest: BackupManifest,
    /// `_schema_migrations` versions recorded when the backup was taken.
    applied_migrations: Vec<i64>,
    tables: BTreeMap<String, TableDump>,
}

#[derive(Serialize, Debug)]
pub struct RestoreSummary {
    pub tables_restored: usize,
    pub rows_restored: usize,
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Convert one SQLite value to JSON. BLOB columns would lose fidelity here and
/// no schema column stores one today — fail loudly instead of corrupting data.
fn cell_to_json(vr: ValueRef<'_>) -> Result<JsonValue, String> {
    Ok(match vr {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => JsonValue::from(i),
        ValueRef::Real(f) => JsonValue::from(f),
        ValueRef::Text(t) => JsonValue::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => {
            return Err(format!(
                "unsupported BLOB value ({} bytes); no schema column stores blobs",
                b.len()
            ))
        }
    })
}

/// Read the whole user-data schema into a backup payload.
fn backup_payload(conn: &Connection) -> Result<BackupPayload, String> {
    let mut tables = BTreeMap::new();
    for table in BACKUP_TABLES {
        let mut stmt = conn
            .prepare(&format!("SELECT * FROM {table}"))
            .map_err(|e| format!("Backup query {table} failed: {e}"))?;
        let count = stmt.column_count();
        let columns: Vec<String> = (0..count)
            .map(|i| stmt.column_name(i).map(|n| n.to_string()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Backup column read {table} failed: {e}"))?;
        let mut rows_iter = stmt
            .query([])
            .map_err(|e| format!("Backup query {table} failed: {e}"))?;
        let mut rows: Vec<Vec<JsonValue>> = Vec::new();
        while let Some(row) = rows_iter
            .next()
            .map_err(|e| format!("Backup read {table} failed: {e}"))?
        {
            let mut out_row = Vec::with_capacity(count);
            for i in 0..count {
                let vr = row
                    .get_ref(i)
                    .map_err(|e| format!("Backup read {table} failed: {e}"))?;
                out_row.push(cell_to_json(vr).map_err(|e| format!("Backup {table}: {e}"))?);
            }
            rows.push(out_row);
        }
        tables.insert(table.to_string(), TableDump { columns, rows });
    }

    let applied_migrations = read_migration_versions(conn)?;
    let schema = applied_migrations.len() as u32;
    Ok(BackupPayload {
        manifest: BackupManifest {
            app: BACKUP_APP.to_string(),
            format: BACKUP_FORMAT,
            schema,
            backed_up_at: now_epoch(),
        },
        applied_migrations,
        tables,
    })
}

fn read_migration_versions(conn: &Connection) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare("SELECT version FROM _schema_migrations ORDER BY version")
        .map_err(|e| format!("Failed to read applied migrations: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("Failed to read applied migrations: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read applied migrations: {e}"))
}

/// Serialize the whole user-data schema to a backup JSON document. The
/// caller verifies it parses back before writing anything anywhere.
fn backup_impl(conn: &Connection) -> Result<String, String> {
    let payload = backup_payload(conn)?;
    serde_json::to_string_pretty(&payload).map_err(|e| format!("Backup serialization failed: {e}"))
}

fn sql_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Render one JSON row as a SQL INSERT with an explicit column list, so the
/// statement is order-independent and extra future columns keep their defaults.
fn insert_sql(table: &str, columns: &[String], row: &[JsonValue]) -> Result<String, String> {
    if row.len() != columns.len() {
        return Err(format!(
            "Backup row width mismatch in {table:?} ({} values for {} columns)",
            row.len(),
            columns.len()
        ));
    }
    let mut vals = String::new();
    for v in row {
        if !vals.is_empty() {
            vals.push_str(", ");
        }
        match v {
            JsonValue::Null => vals.push_str("NULL"),
            JsonValue::Bool(b) => vals.push_str(if *b { "1" } else { "0" }),
            JsonValue::Number(n) => vals.push_str(&n.to_string()),
            JsonValue::String(s) => vals.push_str(&sql_quote(s)),
            _ => return Err(format!("Unsupported JSON value in {table:?}")),
        }
    }
    Ok(format!(
        "INSERT INTO {table} ({}) VALUES ({vals});",
        columns.join(", ")
    ))
}

/// Turn the payload into the ordered INSERT statements that rebuild every
/// backed-up row. Unknown tables are rejected rather than executed.
fn render_restore_sql(payload: &BackupPayload) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for (table, dump) in &payload.tables {
        if !BACKUP_TABLES.contains(&table.as_str()) {
            return Err(format!("Backup contains unknown table {table:?}"));
        }
        for row in &dump.rows {
            out.push(insert_sql(table, &dump.columns, row)?);
        }
    }
    Ok(out)
}

/// Parse backup file contents, with an error that names the likely cause.
fn parse_backup(text: &str) -> Result<BackupPayload, String> {
    serde_json::from_str::<BackupPayload>(text)
        .map_err(|_| "Not a Markbook backup file (invalid format)".to_string())
}

/// Restore a backup payload into `conn`. All-or-nothing:
///
/// 1. Validate the manifest and refuse schema downgrades.
/// 2. Replay the dump on a scratch in-memory database — proves the file
///    parses, matches the local schema, and is foreign-key consistent.
/// 3. Apply to the real database in one transaction (user tables dropped and
///    rebuilt, `_schema_migrations` merged to the higher of either side),
///    gated by a foreign-key consistency check before commit.
fn restore_impl(conn: &Connection, payload: &BackupPayload) -> Result<RestoreSummary, String> {
    if payload.manifest.app != BACKUP_APP {
        return Err("Not a Markbook backup file".into());
    }
    if payload.manifest.format > BACKUP_FORMAT {
        return Err(format!(
            "Backup format {} is newer than this app supports ({BACKUP_FORMAT})",
            payload.manifest.format
        ));
    }
    let local_applied = read_migration_versions(conn)?;
    if payload.applied_migrations.len() < local_applied.len() {
        return Err(
            "This backup is from an older app version; restoring it would \
             downgrade the database schema, which isn't supported"
                .into(),
        );
    }
    let restore_sql = render_restore_sql(payload)?;

    // 1. Prove the dump is coherent on a scratch database first.
    let probe = Connection::open_in_memory()
        .map_err(|e| format!("Failed to open validation database: {e}"))?;
    probe
        .execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| format!("Validation setup failed: {e}"))?;
    crate::db::migrations::run_pending(&probe)?;
    for stmt in &restore_sql {
        probe
            .execute_batch(stmt)
            .map_err(|e| format!("Backup data rejected: {e}"))?;
    }
    let violations: i64 = probe
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .map_err(|e| format!("Validation check failed: {e}"))?;
    if violations > 0 {
        return Err(format!(
            "Backup data is inconsistent ({violations} broken references)"
        ));
    }

    // 2. Apply inside one transaction. FK enforcement must be toggled outside
    //    the transaction (PRAGMA is a no-op inside one), and the connection is
    //    per-command so flipping it briefly is safe.
    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| format!("Failed to disable foreign keys: {e}"))?;
    let result = apply_restore(conn, payload, &restore_sql);

    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to re-enable foreign keys: {e}"))?;
    result
}

/// Transaction body of [`restore_impl`]. `tx` drops → rollback on error.
fn apply_restore(
    conn: &Connection,
    payload: &BackupPayload,
    restore_sql: &[String],
) -> Result<RestoreSummary, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Begin restore failed: {e}"))?;

    // Clear user data child-first, then rebuild from the dump. The schema
    // itself comes from the migrations (already applied by open_db) — only
    // rows are replaced, so tables absent from an old backup stay intact.
    for table in BACKUP_TABLES.iter().rev() {
        tx.execute_batch(&format!("DELETE FROM {table};"))
            .map_err(|e| format!("Restore clearing {table} failed: {e}"))?;
    }
    for stmt in restore_sql {
        tx.execute_batch(stmt)
            .map_err(|e| format!("Restore failed: {e}"))?;
    }

    // Migration bookkeeping: neither side may lose versions, or the next
    // open_db would re-run (or wrongly skip) a migration. Take the union.
    let mut merged = read_migration_versions(&tx)?;
    merged.extend(payload.applied_migrations.iter().copied());
    merged.sort_unstable();
    merged.dedup();
    for v in merged {
        tx.execute(
            "INSERT OR IGNORE INTO _schema_migrations (version) VALUES (?1)",
            params![v],
        )
        .map_err(|e| format!("Restore migration bookkeeping failed: {e}"))?;
    }

    // Last gate before anything is committed.
    let violations: i64 = tx
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .map_err(|e| format!("Restore check failed: {e}"))?;
    if violations > 0 {
        return Err(format!(
            "Restore aborted: {violations} broken references in backup data"
        ));
    }

    tx.commit()
        .map_err(|e| format!("Commit restore failed: {e}"))?;
    Ok(RestoreSummary {
        tables_restored: payload.tables.len(),
        rows_restored: restore_sql.len(),
    })
}

/// Create a full backup of all user data at `file_path` (JSON, or a SAF
/// document URI on Android). Returns the written path.
#[tauri::command]
pub fn backup_app_data(app: AppHandle, file_path: String) -> Result<String, String> {
    let conn = crate::db::open_db(&app)?;
    let json = backup_impl(&conn)?;
    // Cheap insurance that what we are about to write is a valid backup.
    parse_backup(&json)?;
    if is_content_uri(&file_path) {
        // SAF documents cannot be renamed into place — write directly.
        write_output(&app, &file_path, json.as_bytes())?;
    } else {
        // Desktop: atomic temp-file + rename so a crash mid-write can't
        // destroy an existing backup file.
        let path = PathBuf::from(&file_path);
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Create directory {} failed: {e}", parent.display()))?;
            }
        }
        let tmp = path.with_extension("json.tmp");
        write_utf8(&tmp, &json)?;
        std::fs::rename(&tmp, &path).map_err(|e| format!("Write {file_path:?} failed: {e}"))?;
    }
    Ok(file_path)
}

/// Restore all user data from a backup file. Replaces every user-data table
/// with the backup's contents — the webview must confirm before calling.
#[tauri::command]
pub fn restore_app_data(app: AppHandle, file_path: String) -> Result<RestoreSummary, String> {
    let conn = crate::db::open_db(&app)?;
    let text = read_input_string(&app, &file_path)?;
    let payload = parse_backup(&text)?;
    restore_impl(&conn, &payload)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_utils;

    /// Fresh temp path for a backup file; returns (file, dir-for-cleanup).
    fn temp_backup(tag: &str) -> (PathBuf, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("markbook-test-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        (dir.join("backup.json"), dir)
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).expect("count query")
    }

    // ----- CSV -----

    #[test]
    fn csv_roundtrip_handles_quoting_and_unicode() {
        let row = vec![
            "Ahmed, Ali".to_string(),
            "He said \"hi\"".to_string(),
            "سارة عمر\nsecond line".to_string(),
        ];
        let csv = to_csv(std::slice::from_ref(&row));
        let parsed = parse_csv(&csv);
        assert_eq!(parsed, vec![row]);
    }

    // ----- Import -----

    #[test]
    fn import_creates_and_enrolls_new_students() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        let csv = "name,id,email,phone\nOmar Ali,900,o@x.com,0100\nLina Hassan,,l@x.com,\n";
        let report = import_csv_impl(&conn, csv, &sy, &sub, "sec-1").unwrap();
        assert_eq!(report.created, 2);
        assert_eq!(report.matched, 0);
        assert!(report.skipped.is_empty());
        assert!(report.errors.is_empty());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM students"), 4);
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollments WHERE section_id = 'sec-1'"
            ),
            4
        );
    }

    #[test]
    fn import_matches_existing_student_by_id_without_duplicating() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        // An existing student who is NOT yet enrolled in this subject.
        crate::commands::students::create_student_impl(
            &conn,
            "Nadia Fawzy".into(),
            None,
            Some("42".into()),
            None,
        )
        .unwrap();
        // Different display name, same student id -> must reuse, not create.
        let csv = "name,id,email,phone\nNadia F.,42,,\n";
        let report = import_csv_impl(&conn, csv, &sy, &sub, "sec-1").unwrap();
        assert_eq!(report.created, 0);
        assert_eq!(report.matched, 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM students"), 3);
    }

    #[test]
    fn import_ambiguous_name_is_skipped_and_others_continue() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        crate::commands::students::create_student_impl(&conn, "Sara".into(), None, None, None)
            .unwrap();
        crate::commands::students::create_student_impl(&conn, "Sara".into(), None, None, None)
            .unwrap();
        let csv = "name,id,email,phone\nSara,,,\nUnique Person,77,,\n";
        let report = import_csv_impl(&conn, csv, &sy, &sub, "sec-1").unwrap();
        assert_eq!(report.created, 1);
        assert_eq!(report.skipped.len(), 1);
        assert!(
            report.skipped[0].contains("multiple students"),
            "{report:?}"
        );
    }

    #[test]
    fn import_skips_already_enrolled_student() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        let csv = "name,id,email,phone\nAlice,,,\n";
        let report = import_csv_impl(&conn, csv, &sy, &sub, "sec-1").unwrap();
        assert_eq!(report.created, 0);
        assert_eq!(report.matched, 0);
        assert_eq!(report.skipped.len(), 1);
        assert!(report.skipped[0].contains("already enrolled"), "{report:?}");
    }

    #[test]
    fn import_cleans_up_created_student_when_enrollment_fails() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        // Bogus section id -> enrollment insert violates its foreign key.
        let csv = "name,id,email,phone\nTemp Person,123,,\n";
        let report = import_csv_impl(&conn, csv, &sy, &sub, "sec-nope").unwrap();
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.created, 0);
        // The created student was rolled back — nothing left behind.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM students"), 2);
    }

    #[test]
    fn roster_export_import_roundtrips_between_databases() {
        let source = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&source);
        source
            .execute(
                "UPDATE students SET student_id = '42', phone = '0100' WHERE id = 'stu-a'",
                [],
            )
            .unwrap();

        let mut out = vec![roster_header()];
        out.extend(section_enrollments(&source, "sec-1").unwrap());
        let csv = to_csv(&out);

        let target = test_utils::test_conn();
        test_utils::seed_semester(&target, &sy, 2026, "Fall");
        test_utils::seed_subject(&target, &sub, "Databases");
        test_utils::seed_section(&target, "sec-1", &sy, &sub);

        let report = import_csv_impl(&target, &csv, &sy, &sub, "sec-1").unwrap();
        assert_eq!(report.created, 2, "{report:?}");
        assert_eq!(count(&target, "SELECT COUNT(*) FROM students"), 2);
        let alice_id: String = target
            .query_row(
                "SELECT student_id FROM students WHERE name = 'Alice'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(alice_id, "42");
    }

    // ----- Grades report -----

    #[test]
    fn grades_report_includes_scores_attendance_and_bonus() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        conn.execute(
            "INSERT INTO quizzes (id, enrollment_id, name, max_score, score, date)
             VALUES ('q1', 'enr-a', 'Quiz 1', 10, 8.5, '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO lectures (id, subject_id, semester_year_id, section_id, title, date)
             VALUES ('l1', ?1, ?2, 'sec-1', NULL, '2026-02-01')",
            params![sub, sy],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO attendance (id, lecture_id, enrollment_id, status)
             VALUES ('att1', 'l1', 'enr-a', 'present')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bonuses (id, enrollment_id, value, reason, date)
             VALUES ('b1', 'enr-a', 1.5, 'Participation', '2026-02-02')",
            [],
        )
        .unwrap();

        let (header, body) = grades_report(&conn, &sy, &sub, "sec-1").unwrap();
        assert_eq!(header[0], "name");
        assert!(header.contains(&"Quiz: Quiz 1 (max 10)".to_string()));
        assert!(header.contains(&"Present".to_string()));
        assert!(header.contains(&"Bonus".to_string()));
        assert_eq!(body.len(), 2);
        let alice = &body[0];
        assert_eq!(alice[0], "Alice");
        assert_eq!(alice[4], "8.5"); // quiz score
        assert_eq!(alice[5], "1"); // present
        assert_eq!(alice[9], "1.5"); // bonus
    }

    // ----- Backup / restore -----

    fn seed_rich_data(conn: &Connection) {
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(conn);
        conn.execute(
            "INSERT INTO quizzes (id, enrollment_id, name, max_score, score, date)
             VALUES ('q1', 'enr-a', 'Quiz 1', 10, 8.5, '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO lectures (id, subject_id, semester_year_id, section_id, title, date)
             VALUES ('l1', ?1, ?2, 'sec-1', 'Intro', '2026-02-01')",
            params![sub, sy],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO attendance (id, lecture_id, enrollment_id, status)
             VALUES ('att1', 'l1', 'enr-a', 'present')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bonuses (id, enrollment_id, value, reason, date)
             VALUES ('b1', 'enr-a', 1.0, 'Participation', '2026-02-02')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subject_lectures (id, subject_id, title, date, created_at)
             VALUES ('sl-1', ?1, 'Week 1', '2026-02-01', 100)",
            params![sub],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO material_notes (id, lecture_id, content_md, updated_at)
             VALUES ('mn-1', 'sl-1', '# Subject note', 200)",
            [],
        )
        .unwrap();
    }

    #[test]
    fn backup_restore_roundtrip_preserves_user_data() {
        let conn = test_utils::test_conn();
        seed_rich_data(&conn);
        let (file, dir) = temp_backup("roundtrip");

        let written = backup_impl(&conn).unwrap();
        parse_backup(&written).unwrap();
        std::fs::write(&file, &written).unwrap();

        // Simulate data loss.
        conn.execute("DELETE FROM students", []).unwrap();
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM students"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM quizzes"), 0);

        let text = std::fs::read_to_string(&file).unwrap();
        let payload = parse_backup(&text).unwrap();
        restore_impl(&conn, &payload).unwrap();

        assert_eq!(count(&conn, "SELECT COUNT(*) FROM students"), 2);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM enrollments"), 2);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM quizzes"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM lectures"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM attendance"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM bonuses"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM subject_lectures"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM material_notes"), 1);
        let score: f64 = conn
            .query_row("SELECT score FROM quizzes WHERE id = 'q1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(score, 8.5);
        // Connection state must be as it was before (FK back on).
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn restore_into_fresh_database_rebuilds_everything() {
        let source = test_utils::test_conn();
        seed_rich_data(&source);
        let (file, dir) = temp_backup("fresh");
        let json = backup_impl(&source).unwrap();
        std::fs::write(&file, &json).unwrap();
        let payload = parse_backup(&std::fs::read_to_string(&file).unwrap()).unwrap();

        let fresh = test_utils::test_conn();
        assert_eq!(count(&fresh, "SELECT COUNT(*) FROM students"), 0);
        restore_impl(&fresh, &payload).unwrap();

        assert_eq!(count(&fresh, "SELECT COUNT(*) FROM students"), 2);
        assert_eq!(count(&fresh, "SELECT COUNT(*) FROM enrollments"), 2);
        assert_eq!(count(&fresh, "SELECT COUNT(*) FROM quizzes"), 1);
        assert_eq!(count(&fresh, "SELECT COUNT(*) FROM subject_lectures"), 1);
        assert_eq!(count(&fresh, "SELECT COUNT(*) FROM material_notes"), 1);
        // Migration bookkeeping must survive the restore.
        assert_eq!(
            count(&fresh, "SELECT COUNT(*) FROM _schema_migrations"),
            crate::db::migrations::get_migrations().len() as i64
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parse_backup_rejects_non_markbook_files() {
        assert!(parse_backup("not json at all").is_err());
        assert!(parse_backup("{\"random\": true}").is_err());
        // Valid JSON with the wrong app marker is refused at restore time.
        let payload = BackupPayload {
            manifest: BackupManifest {
                app: "other-app".into(),
                format: 1,
                schema: 1,
                backed_up_at: 0,
            },
            applied_migrations: vec![],
            tables: BTreeMap::new(),
        };
        let err = restore_impl(&test_utils::test_conn(), &payload).unwrap_err();
        assert!(err.contains("Not a Markbook backup"), "{err}");
    }

    #[test]
    fn restore_rejects_schema_downgrade() {
        let conn = test_utils::test_conn();
        let payload = BackupPayload {
            manifest: BackupManifest {
                app: BACKUP_APP.into(),
                format: 1,
                schema: 0,
                backed_up_at: 0,
            },
            applied_migrations: vec![],
            tables: BTreeMap::new(),
        };
        let err = restore_impl(&conn, &payload).unwrap_err();
        assert!(err.contains("older app version"), "{err}");
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM students"), 0);
    }

    #[test]
    fn restore_rejects_inconsistent_data_before_touching_real_db() {
        let conn = test_utils::test_conn();
        seed_rich_data(&conn);
        let applied = read_migration_versions(&conn).unwrap();

        // An enrollment pointing at a student that the backup never contains.
        let mut tables = BTreeMap::new();
        tables.insert(
            "enrollments".to_string(),
            TableDump {
                columns: vec![
                    "id".into(),
                    "student_id".into(),
                    "semester_year_id".into(),
                    "subject_id".into(),
                    "section_id".into(),
                ],
                rows: vec![vec![
                    JsonValue::String("enr-x".into()),
                    JsonValue::String("stu-zzz".into()),
                    JsonValue::String("sy-1".into()),
                    JsonValue::String("sub-1".into()),
                    JsonValue::Null,
                ]],
            },
        );
        let payload = BackupPayload {
            manifest: BackupManifest {
                app: BACKUP_APP.into(),
                format: 1,
                schema: applied.len() as u32,
                backed_up_at: 0,
            },
            applied_migrations: applied,
            tables,
        };

        let err = restore_impl(&conn, &payload).unwrap_err();
        assert!(err.contains("inconsistent"), "{err}");
        // Real data untouched.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM students"), 2);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM quizzes"), 1);
    }

    #[test]
    fn insert_sql_quotes_and_renders_values() {
        let cols = vec!["id".to_string(), "name".to_string()];
        let row = vec![JsonValue::String("o'brien".into()), JsonValue::Null];
        let sql = insert_sql("students", &cols, &row).unwrap();
        assert_eq!(
            sql,
            "INSERT INTO students (id, name) VALUES ('o''brien', NULL);"
        );
    }
}
