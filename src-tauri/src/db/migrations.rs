use rusqlite::Connection;
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create preferences table",
            sql: include_str!("../../migrations/001_create_preferences.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create semester_years table",
            sql: include_str!("../../migrations/002_create_semester_years.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create subjects table",
            sql: include_str!("../../migrations/003_create_subjects.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create students table",
            sql: include_str!("../../migrations/004_create_students.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create enrollments table",
            sql: include_str!("../../migrations/005_create_enrollments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create quizzes table",
            sql: include_str!("../../migrations/006_create_quizzes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create assignments table",
            sql: include_str!("../../migrations/007_create_assignments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create lectures table",
            sql: include_str!("../../migrations/008_create_lectures.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create attendance table",
            sql: include_str!("../../migrations/009_create_attendance.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "create bonuses table",
            sql: include_str!("../../migrations/010_create_bonuses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add theme column to preferences",
            sql: include_str!("../../migrations/011_add_theme_to_preferences.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// Runs all pending migrations on a rusqlite connection.
/// Uses its own `_schema_migrations` tracking table (separate from tauri-plugin-sql).
pub fn run_pending(conn: &Connection) -> Result<(), String> {
    // Ensure our tracking table exists
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _schema_migrations (version INTEGER PRIMARY KEY);",
    )
    .map_err(|e| format!("Failed to create migration tracking table: {e}"))?;

    // Get already-applied versions
    let mut applied: Vec<i64> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT version FROM _schema_migrations ORDER BY version")
            .map_err(|e| format!("Failed to query applied migrations: {e}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(|e| format!("Failed to read migrations: {e}"))?;
        for row in rows {
            applied.push(row.map_err(|e| format!("Failed to read row: {e}"))?);
        }
    }

    let all = get_migrations();

    for migration in &all {
        if applied.contains(&(migration.version as i64)) {
            continue; // already applied
        }

        // Run the migration in its own transaction
        conn.execute_batch(&format!(
            "BEGIN TRANSACTION; {}; INSERT INTO _schema_migrations (version) VALUES ({}); COMMIT;",
            migration.sql, migration.version
        ))
        .map_err(|e| {
            format!(
                "Migration {} ({}) failed: {e}",
                migration.version, migration.description
            )
        })?;
    }

    Ok(())
}
