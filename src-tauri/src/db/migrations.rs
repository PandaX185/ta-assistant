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
    ]
}
