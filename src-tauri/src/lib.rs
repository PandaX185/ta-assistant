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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
