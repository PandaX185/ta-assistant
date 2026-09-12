// Tauri plugin that opens a local file with the system default app.
//
// Why this plugin exists: the `opener` plugin's mobile `open_path` is broken
// upstream (it sends a bare String where the Kotlin side expects an
// `OpenArgs { url, with }` object, throwing
// "cannot construct instance of app.tauri.opener.OpenArgs"), and its native
// `open` never sets FLAG_GRANT_READ_URI_PERMISSION, so even a FileProvider
// `content://` URI is not readable by the target app. This plugin mirrors the
// android-installer plugin's proven pattern: its own FileProvider subclass
// covering the application data directory plus an ACTION_VIEW intent carrying
// the correct MIME type and the URI read grant.

use serde::Serialize;
use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.pandax185.taassistant.fileopen";

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Serialize)]
struct OpenArg {
    path: String,
    mime: &'static str,
}

/// Access to the file-open native APIs (Android only).
pub struct FileOpen<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> FileOpen<R> {
    /// Launch the system default viewer for the file at `path`.
    ///
    /// On desktop/iOS this is a no-op; callers should use
    /// [`crate::open_with_default`](opener) there instead.
    pub fn open(&self, path: String, mime: &'static str) -> tauri::Result<()> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("open", OpenArg { path, mime })
                .map_err(Into::into)
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (path, mime);
            Ok(())
        }
    }
}

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to
/// access the file-open APIs.
pub trait FileOpenExt<R: Runtime> {
    fn file_open(&self) -> &FileOpen<R>;
}

impl<R: Runtime, T: Manager<R>> FileOpenExt<R> for T {
    fn file_open(&self) -> &FileOpen<R> {
        self.state::<FileOpen<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("file-open")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "OpenFilePlugin")?;

            app.manage(FileOpen {
                #[cfg(target_os = "android")]
                handle,
                #[cfg(not(target_os = "android"))]
                _marker: std::marker::PhantomData::<fn() -> R>,
            });
            Ok(())
        })
        .build()
}

/// Best-effort MIME type for a file name based on its extension, used to launch
/// the right viewer on Android. Falls back to `application/octet-stream`.
pub fn mime_for_file_name(name: &str) -> &'static str {
    let ext = name
        .rsplit_once('.')
        .map(|(_, ext)| ext)
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv" => "text/csv",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "html" | "htm" => "text/html",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "zip" => "application/zip",
        "rar" => "application/vnd.rar",
        "7z" => "application/x-7z-compressed",
        "apk" => "application/vnd.android.package-archive",
        "sqlite" | "db" => "application/vnd.sqlite3",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::mime_for_file_name;

    #[test]
    fn picks_common_document_and_media_types() {
        assert_eq!(mime_for_file_name("slides.PDF"), "application/pdf");
        assert_eq!(
            mime_for_file_name("notes.docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(mime_for_file_name("deck.pptx"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        assert_eq!(mime_for_file_name("screenshot.png"), "image/png");
        assert_eq!(mime_for_file_name("video.MP4"), "video/mp4");
        assert_eq!(mime_for_file_name("app.apk"), "application/vnd.android.package-archive");
    }

    #[test]
    fn falls_back_to_octet_stream_for_unknown_or_missing_extension() {
        assert_eq!(mime_for_file_name("archive.xyz"), "application/octet-stream");
        assert_eq!(mime_for_file_name("README"), "application/octet-stream");
        assert_eq!(mime_for_file_name(""), "application/octet-stream");
    }
}