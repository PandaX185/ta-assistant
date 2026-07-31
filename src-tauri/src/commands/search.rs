use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct SearchResult {
    pub kind: String,
    pub id: String,
    pub label: String,
    pub subtitle: String,
    pub enrollment_id: Option<String>,
    pub semester_year_id: Option<String>,
    pub subject_id: Option<String>,
}

#[tauri::command]
pub fn global_search(app: AppHandle, query: String) -> Result<Vec<SearchResult>, String> {
    let conn = crate::db::open_db(&app)?;
    let mut results = Vec::new();
    let pattern = format!("%{}%", query);

    // Search students across enrollments
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT s.id, s.name, s.student_id, sy.year, sy.semester, sub.name,
                    e.id, e.semester_year_id, e.subject_id
             FROM students s
             JOIN enrollments e ON e.student_id = s.id
             JOIN semester_years sy ON sy.id = e.semester_year_id
             JOIN subjects sub ON sub.id = e.subject_id
             WHERE s.name LIKE ?1 OR s.student_id LIKE ?1
             ORDER BY s.name
             LIMIT 20",
        )
        .map_err(|e| format!("Search query failed: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![pattern], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(|e| format!("Search query failed: {e}"))?;

    for row in rows {
        let (id, name, code, year, semester, subject_name, enrollment_id, semester_year_id, subject_id) =
            row.map_err(|e| format!("Row failed: {e}"))?;
        let code_str = code.map(|c| format!(" · {}", c)).unwrap_or_default();
        results.push(SearchResult {
            kind: "student".into(),
            id,
            label: name,
            subtitle: format!("{} · {} {} · {}", subject_name, semester, year, code_str),
            enrollment_id: Some(enrollment_id),
            semester_year_id: Some(semester_year_id),
            subject_id: Some(subject_id),
        });
    }

    Ok(results)
}
