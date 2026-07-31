use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct SearchResult {
    pub kind: String,       // "student" | "subject"
    pub id: String,
    pub label: String,
    pub subtitle: String,
}

#[tauri::command]
pub fn global_search(app: AppHandle, query: String) -> Result<Vec<SearchResult>, String> {
    let conn = crate::db::open_db(&app)?;
    let mut results = Vec::new();
    let pattern = format!("%{}%", query);

    // Search students across enrollments
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT s.id, s.name, s.student_id, sy.year, sy.semester, sub.name
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
            ))
        })
        .map_err(|e| format!("Search query failed: {e}"))?;

    for row in rows {
        let (id, name, code, year, semester, subject_name) =
            row.map_err(|e| format!("Row failed: {e}"))?;
        let code_str = code.map(|c| format!(" · {}", c)).unwrap_or_default();
        results.push(SearchResult {
            kind: "student".into(),
            id,
            label: format!("👤 {}", name),
            subtitle: format!("{} · {} {} · {}", subject_name, semester, year, code_str),
        });
    }

    // Search subjects
    let mut sstmt = conn
        .prepare(
            "SELECT id, name, code
             FROM subjects
             WHERE name LIKE ?1 OR code LIKE ?1
             ORDER BY name
             LIMIT 10",
        )
        .map_err(|e| format!("Subject search query failed: {e}"))?;

    let srows = sstmt
        .query_map(rusqlite::params![pattern], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| format!("Subject search query failed: {e}"))?
        .filter_map(|r| r.ok());

    for (id, name, code) in srows {
        let code_str = code.map(|c| format!(" ({})", c)).unwrap_or_default();
        results.push(SearchResult {
            kind: "subject".into(),
            id,
            label: format!("📚 {}", name),
            subtitle: format!("Subject{}", code_str),
        });
    }

    Ok(results)
}
