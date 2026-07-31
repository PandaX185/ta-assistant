mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ta-assistant.db", db::migrations::get_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::preferences::get_preferences,
            commands::preferences::save_preferences,
            commands::preferences::update_theme,
            commands::preferences::update_locale,
            commands::filters::get_semester_years,
            commands::filters::get_subjects,
            commands::filters::create_semester_year,
            commands::filters::delete_semester_year,
            commands::filters::create_subject,
            commands::filters::update_subject,
            commands::filters::delete_subject,
            commands::students::get_students,
            commands::students::create_student,
            commands::students::update_student,
            commands::students::delete_student,
            commands::students::get_enrollments,
            commands::students::create_enrollment,
            commands::students::delete_enrollment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
