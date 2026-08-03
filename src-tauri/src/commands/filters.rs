use rusqlite::Connection;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, PartialEq, Debug)]
pub struct SemesterYear {
    pub id: String,
    pub year: i64,
    pub semester: String,
}

#[derive(Serialize, PartialEq, Debug)]
pub struct Subject {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub fn get_semester_years(app: AppHandle) -> Result<Vec<SemesterYear>, String> {
    let conn = crate::db::open_db(&app)?;
    get_semester_years_impl(&conn)
}

fn get_semester_years_impl(conn: &Connection) -> Result<Vec<SemesterYear>, String> {
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
    get_subjects_impl(&conn)
}

fn get_subjects_impl(conn: &Connection) -> Result<Vec<Subject>, String> {
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
    let conn = crate::db::open_db(&app)?;
    create_semester_year_impl(&conn, year, semester)
}

fn create_semester_year_impl(conn: &Connection, year: i64, semester: String) -> Result<(), String> {
    use rusqlite::params;
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
    delete_semester_year_impl(&conn, id)
}

fn delete_semester_year_impl(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute(
        "DELETE FROM semester_years WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Delete failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn create_subject(
    app: AppHandle,
    name: String,
    code: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    create_subject_impl(&conn, name, code, color)
}

fn create_subject_impl(
    conn: &Connection,
    name: String,
    code: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO subjects (id, name, code, color) VALUES (?, ?, ?, ?)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), name, code, color],
    )
    .map_err(|e| format!("Create subject failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_subject(
    app: AppHandle,
    id: String,
    name: String,
    code: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    update_subject_impl(&conn, id, name, code, color)
}

fn update_subject_impl(
    conn: &Connection,
    id: String,
    name: String,
    code: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
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
    delete_subject_impl(&conn, id)
}

fn delete_subject_impl(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM subjects WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete subject failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_utils;

    fn seeded_conn() -> Connection {
        let conn = test_utils::test_conn();
        create_semester_year_impl(&conn, 2025, "Spring".into()).unwrap();
        create_semester_year_impl(&conn, 2026, "Fall".into()).unwrap();
        create_semester_year_impl(&conn, 2026, "Summer".into()).unwrap();
        create_subject_impl(
            &conn,
            "Zebra".into(),
            Some("ZEB".into()),
            Some("#fff".into()),
        )
        .unwrap();
        create_subject_impl(&conn, "Alpha".into(), None, None).unwrap();
        conn
    }

    #[test]
    fn semester_years_empty_by_default() {
        let conn = test_utils::test_conn();
        assert!(get_semester_years_impl(&conn).unwrap().is_empty());
    }

    #[test]
    fn semester_years_ordered_year_desc_then_semester() {
        let conn = seeded_conn();
        let years = get_semester_years_impl(&conn).unwrap();
        let labels: Vec<(i64, &str)> = years
            .iter()
            .map(|s| (s.year, s.semester.as_str()))
            .collect();
        assert_eq!(
            labels,
            vec![(2026, "Fall"), (2026, "Summer"), (2025, "Spring")]
        );
    }

    #[test]
    fn create_semester_year_rejects_duplicate() {
        let conn = seeded_conn();
        let err = create_semester_year_impl(&conn, 2026, "Fall".into()).unwrap_err();
        assert!(err.contains("Create semester/year failed"), "{err}");
    }

    #[test]
    fn create_semester_year_rejects_invalid_semester() {
        let conn = test_utils::test_conn();
        let err = create_semester_year_impl(&conn, 2026, "Winter".into()).unwrap_err();
        assert!(err.contains("Create semester/year failed"), "{err}");
    }

    #[test]
    fn delete_semester_year_removes_row() {
        let conn = seeded_conn();
        let id = get_semester_years_impl(&conn).unwrap()[0].id.clone();
        delete_semester_year_impl(&conn, id).unwrap();
        assert_eq!(get_semester_years_impl(&conn).unwrap().len(), 2);
    }

    #[test]
    fn subjects_empty_by_default() {
        let conn = test_utils::test_conn();
        assert!(get_subjects_impl(&conn).unwrap().is_empty());
    }

    #[test]
    fn subjects_ordered_by_name_with_optional_fields() {
        let conn = seeded_conn();
        let subs = get_subjects_impl(&conn).unwrap();
        let names: Vec<&str> = subs.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "Zebra"]);
        assert_eq!(subs[1].code.as_deref(), Some("ZEB"));
        assert_eq!(subs[1].color.as_deref(), Some("#fff"));
        assert_eq!(subs[0].code, None);
    }

    #[test]
    fn update_subject_changes_fields() {
        let conn = seeded_conn();
        let subs = get_subjects_impl(&conn).unwrap();
        let id = subs[0].id.clone();
        update_subject_impl(&conn, id.clone(), "Beta".into(), Some("BET".into()), None).unwrap();
        let updated = get_subjects_impl(&conn)
            .unwrap()
            .into_iter()
            .find(|s| s.id == id)
            .unwrap();
        assert_eq!(updated.name, "Beta");
        assert_eq!(updated.code.as_deref(), Some("BET"));
        assert_eq!(updated.color, None);
    }

    #[test]
    fn delete_subject_removes_row() {
        let conn = seeded_conn();
        let id = get_subjects_impl(&conn).unwrap()[0].id.clone();
        delete_subject_impl(&conn, id).unwrap();
        assert_eq!(get_subjects_impl(&conn).unwrap().len(), 1);
    }
}
