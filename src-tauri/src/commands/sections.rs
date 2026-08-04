use rusqlite::Connection;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct Section {
    pub id: String,
    pub subject_id: String,
    pub semester_year_id: String,
    pub name: String,
    pub color: Option<String>,
}

#[tauri::command]
pub fn get_sections(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
) -> Result<Vec<Section>, String> {
    let conn = crate::db::open_db(&app)?;
    get_sections_impl(&conn, &semester_year_id, &subject_id)
}

pub fn get_sections_impl(
    conn: &Connection,
    semester_year_id: &str,
    subject_id: &str,
) -> Result<Vec<Section>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, subject_id, semester_year_id, name, color FROM sections
             WHERE semester_year_id = ?1 AND subject_id = ?2
             ORDER BY name",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![semester_year_id, subject_id], |row| {
            Ok(Section {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                semester_year_id: row.get(2)?,
                name: row.get(3)?,
                color: row.get(4)?,
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
pub fn create_section(
    app: AppHandle,
    semester_year_id: String,
    subject_id: String,
    name: String,
    color: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    create_section_impl(
        &conn,
        &semester_year_id,
        &subject_id,
        &name,
        color.as_deref(),
    )
}

pub fn create_section_impl(
    conn: &Connection,
    semester_year_id: &str,
    subject_id: &str,
    name: &str,
    color: Option<&str>,
) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Section name cannot be empty".into());
    }
    conn.execute(
        "INSERT INTO sections (id, subject_id, semester_year_id, name, color) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            subject_id,
            semester_year_id,
            trimmed,
            color
        ],
    )
    .map_err(|e| format!("Create section failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn rename_section(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    rename_section_impl(&conn, &id, &name)
}

fn rename_section_impl(conn: &Connection, id: &str, name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Section name cannot be empty".into());
    }
    conn.execute(
        "UPDATE sections SET name = ?1 WHERE id = ?2",
        rusqlite::params![trimmed, id],
    )
    .map_err(|e| format!("Rename section failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_section(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    delete_section_impl(&conn, &id)
}

fn delete_section_impl(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM sections WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete section failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_utils;

    #[test]
    fn section_crud_and_cascade() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);

        // seed_basic_scenario already created the default "Group A" (sec-1)
        create_section_impl(&conn, &sy, &sub, "Group B", Some("#ff0000")).unwrap();
        create_section_impl(&conn, &sy, &sub, "Group C", None).unwrap();
        // Duplicate name in same subject+semester rejected by UNIQUE.
        assert!(create_section_impl(&conn, &sy, &sub, "Group B", None).is_err());

        let sections = get_sections_impl(&conn, &sy, &sub).unwrap();
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].name, "Group A");
        assert_eq!(sections[1].name, "Group B");
        assert_eq!(sections[1].color.as_deref(), Some("#ff0000"));

        let sec_a = &sections[0];
        rename_section_impl(&conn, &sec_a.id, "Group Alpha").unwrap();
        assert_eq!(
            get_sections_impl(&conn, &sy, &sub).unwrap()[0].name,
            "Group Alpha"
        );

        // Cascade: deleting the section removes its enrollments/lectures.
        test_utils::seed_student(&conn, "stu-c", "Charlie");
        conn.execute(
            "INSERT INTO enrollments (id, student_id, semester_year_id, subject_id, section_id)
             VALUES ('enr-sec', 'stu-c', ?1, ?2, ?3)",
            rusqlite::params![sy, sub, sec_a.id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO lectures (id, subject_id, semester_year_id, title, date, section_id)
             VALUES ('lec-sec', ?1, ?2, 'Intro', '2026-09-01', ?3)",
            rusqlite::params![sub, sy, sec_a.id],
        )
        .unwrap();

        delete_section_impl(&conn, &sec_a.id).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM enrollments WHERE id = 'enr-sec'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lectures WHERE id = 'lec-sec'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}
