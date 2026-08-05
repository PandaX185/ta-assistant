mod commands;
mod db;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // NOTE: migrations are NOT registered with the sql plugin anymore. They
    // run exclusively through db::migrations::run_pending() on the Rust side
    // (open_db), so there is a single migration runner. Previously both this
    // plugin and run_pending executed the same migrations against the same
    // file but tracked them in separate tables (_sqlx_migrations vs
    // _schema_migrations), which made the second runner fail with
    // "table preferences already exists" on fresh installs (e.g. Android).
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build());

    // Desktop-only: the global-shortcut plugin (global-hotkey) has no
    // Android/iOS support. Registered under #[cfg(desktop)] so mobile builds
    // compile without it; the frontend toggle-search listener is a harmless
    // no-op on mobile.
    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    let _ = app.emit("toggle-search", ());
                }
            })
            .build(),
    );

    builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                app.global_shortcut().register("Ctrl+Shift+P")?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::preferences::get_preferences,
            commands::preferences::save_preferences,
            commands::preferences::verify_password,
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
            commands::students::get_student_detail,
            commands::students::find_students,
            commands::sections::get_sections,
            commands::sections::create_section,
            commands::sections::rename_section,
            commands::sections::delete_section,
            commands::grades::get_grades,
            commands::grades::create_quiz_bulk,
            commands::grades::create_assignment_bulk,
            commands::grades::update_quiz_score,
            commands::grades::update_assignment_score,
            commands::grades::delete_quiz,
            commands::grades::delete_assignment,
            commands::grades::delete_quiz_column,
            commands::grades::delete_assignment_column,
            commands::attendance_cmd::get_lectures,
            commands::attendance_cmd::create_lecture,
            commands::attendance_cmd::delete_lecture,
            commands::attendance_cmd::get_attendance,
            commands::attendance_cmd::mark_attendance,
            commands::attendance_cmd::seed_attendance,
            commands::search::global_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
