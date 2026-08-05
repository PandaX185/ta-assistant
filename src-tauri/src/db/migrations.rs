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
        Migration {
            version: 12,
            description: "add student_id to students",
            sql: include_str!("../../migrations/012_add_student_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "create sections table",
            sql: include_str!("../../migrations/013_create_sections.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add section_id to enrollments and lectures",
            sql: include_str!("../../migrations/014_add_section_to_enrollments_lectures.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "rebuild lectures/enrollments with per-section uniqueness",
            sql: include_str!("../../migrations/015_rebuild_lectures_enrollments_uniques.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "semester-scope subjects with backfill",
            sql: include_str!("../../migrations/016_subjects_semester_scoped.sql"),
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

    // One-time adoption of tauri-plugin-sql's tracking table.
    // Older builds also registered these migrations with the sql plugin
    // (sqlx Migrator), which tracks them in `_sqlx_migrations`. On installs
    // where the plugin's runner created the schema first (e.g. fresh Android),
    // `_schema_migrations` is empty while the tables already exist — re-running
    // migration 1 would fail with "table preferences already exists". Adopt
    // the successfully-applied plugin versions so we skip them. Fresh installs
    // and current desktop DBs have no `_sqlx_migrations` table, so this is a no-op.
    if applied.is_empty() {
        let plugin_tracking_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name = '_sqlx_migrations'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check _sqlx_migrations table: {e}"))?;

        if plugin_tracking_exists > 0 {
            let mut stmt = conn
                .prepare(
                    "SELECT version FROM _sqlx_migrations
                     WHERE success = 1 ORDER BY version",
                )
                .map_err(|e| format!("Failed to query plugin-applied migrations: {e}"))?;
            let rows = stmt
                .query_map([], |row| row.get::<_, i64>(0))
                .map_err(|e| format!("Failed to read plugin-applied migrations: {e}"))?;
            for row in rows {
                let version =
                    row.map_err(|e| format!("Failed to read plugin-applied migration row: {e}"))?;
                conn.execute(
                    "INSERT OR IGNORE INTO _schema_migrations (version) VALUES (?1)",
                    rusqlite::params![version],
                )
                .map_err(|e| format!("Failed to adopt plugin-applied migration {version}: {e}"))?;
                applied.push(version);
            }
        }
    }

    let all = get_migrations();

    // Some migrations rebuild tables (DROP TABLE + RENAME). With foreign keys
    // enabled, dropping a parent table implicitly DELETEs its rows, which fires
    // ON DELETE CASCADE on children (e.g. DROP TABLE lectures wipes attendance).
    // Toggle FK enforcement off for the duration of each migration batch and
    // restore the prior state afterwards (data is copied 1:1, so integrity holds).
    let fk_was_on: bool = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .map_err(|e| format!("Failed to read foreign_keys pragma: {e}"))?;
    let restore = if fk_was_on { "ON" } else { "OFF" };

    for migration in &all {
        if applied.contains(&migration.version) {
            continue; // already applied
        }

        // Run the migration in its own transaction.
        // PRAGMA foreign_keys is a no-op inside a transaction, so it must sit
        // outside the BEGIN/COMMIT pair.
        conn.execute_batch(&format!(
            "PRAGMA foreign_keys = OFF; BEGIN TRANSACTION; {}; INSERT INTO _schema_migrations (version) VALUES ({}); COMMIT; PRAGMA foreign_keys = {restore};",
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

#[cfg(test)]
mod tests {
    use super::{get_migrations, run_pending};
    use crate::commands::test_utils;
    use rusqlite::Connection;

    #[test]
    fn adopts_plugin_tracking_when_schema_already_exists() {
        // Simulates a fresh install where tauri-plugin-sql (sqlx Migrator)
        // created the schema first: its `_sqlx_migrations` table exists and
        // the preferences table is already there, but `_schema_migrations`
        // does not. run_pending must adopt the plugin's versions instead of
        // re-running migration 1 ("table preferences already exists").
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE _sqlx_migrations (
                version         BIGINT PRIMARY KEY NOT NULL,
                description     TEXT NOT NULL,
                installed_on    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                success         BOOLEAN NOT NULL,
                checksum        BLOB NOT NULL,
                execution_time  BIGINT NOT NULL
            );
            INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
            VALUES (1, 'create preferences table', 1, x'00', 0);
            -- a failed plugin migration: must NOT be adopted, run_pending re-runs it
            INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
            VALUES (2, 'create semester_years table', 0, x'00', 0);",
        )
        .expect("create fake plugin tracking");
        conn.execute_batch(include_str!("../../migrations/001_create_preferences.sql"))
            .expect("create preferences like the plugin did");

        run_pending(&conn).expect("run_pending should not conflict with plugin-created schema");

        let applied: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT version FROM _schema_migrations ORDER BY version")
                .expect("prepare");
            let rows = stmt
                .query_map([], |row| row.get::<_, i64>(0))
                .expect("query");
            rows.map(|r| r.expect("row")).collect()
        };
        assert_eq!(applied.len(), get_migrations().len());
        assert!(applied.contains(&1), "adopted plugin-applied version 1");
        assert!(
            applied.contains(&2),
            "failed plugin row not adopted; migration 2 re-run"
        );
        let semester_years_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'semester_years'",
                [],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(
            semester_years_count, 1,
            "migration 2 took effect after re-run"
        );
    }

    /// Migration 015 rebuilds lectures/enrollments with per-section uniqueness:
    /// - one student row can enroll in two sections of the same subject
    /// - two sections can hold lectures on the same date
    /// - duplicates within a section are still rejected
    #[test]
    fn per_section_uniqueness_after_migrations() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);

        // second section (seed_section hardcodes the name "Group A", so insert directly)
        conn.execute(
            "INSERT INTO sections (id, subject_id, semester_year_id, name, color)
             VALUES ('sec-2', ?1, ?2, 'Group B', NULL)",
            rusqlite::params![sub, sy],
        )
        .unwrap();

        // same student may enroll in a second section of the same subject+semester
        conn.execute(
            "INSERT INTO enrollments (id, student_id, semester_year_id, subject_id, section_id)
             VALUES ('enr-a2', 'stu-a', ?1, ?2, 'sec-2')",
            rusqlite::params![sy, sub],
        )
        .unwrap();
        // ...but duplicating within the same section still fails
        assert!(conn
            .execute(
                "INSERT INTO enrollments (id, student_id, semester_year_id, subject_id, section_id)
                 VALUES ('enr-a3', 'stu-a', ?1, ?2, 'sec-1')",
                rusqlite::params![sy, sub],
            )
            .is_err());

        // two sections may hold lectures on the same date
        conn.execute(
            "INSERT INTO lectures (id, subject_id, semester_year_id, section_id, title, date)
             VALUES ('lec-1', ?1, ?2, 'sec-1', NULL, '2026-09-01')",
            rusqlite::params![sub, sy],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO lectures (id, subject_id, semester_year_id, section_id, title, date)
             VALUES ('lec-2', ?1, ?2, 'sec-2', NULL, '2026-09-01')",
            rusqlite::params![sub, sy],
        )
        .unwrap();
        // ...but the same section cannot double-book a date
        assert!(conn
            .execute(
                "INSERT INTO lectures (id, subject_id, semester_year_id, section_id, title, date)
                 VALUES ('lec-3', ?1, ?2, 'sec-1', NULL, '2026-09-01')",
                rusqlite::params![sub, sy],
            )
            .is_err());
    }
}
