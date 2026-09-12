pub mod attendance_cmd;
pub mod filters;
pub mod grades;
pub mod materials;
pub mod preferences;
pub mod search;
pub mod sections;
pub mod students;
pub mod updates;

/// Open `path` with the system default app.
///
/// On Android the `opener` plugin's mobile `open_path` is broken upstream (it
/// sends a bare String where the Kotlin side expects an `OpenArgs { url, with }`
/// object, and its `open` never grants URI read permission), so we route through
/// the local `file-open` plugin, which serves the file with our own FileProvider
/// (correct MIME + `FLAG_GRANT_READ_URI_PERMISSION`). Everywhere else the plain
/// opener is enough.
pub(crate) fn open_with_default(
    app: &tauri::AppHandle,
    path: &std::path::Path,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_file_open::FileOpenExt;
        app.file_open()
            .open(
                path.display().to_string(),
                tauri_plugin_file_open::mime_for_file_name(
                    path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or_default(),
                ),
            )
            .map_err(|e| format!("Failed to open file: {e}"))
    }
    #[cfg(not(target_os = "android"))]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_path(path.display().to_string(), None::<&str>)
            .map_err(|e| format!("Failed to open file: {e}"))
    }
}

#[cfg(test)]
pub mod test_utils;
