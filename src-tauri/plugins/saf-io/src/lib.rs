//! Android SAF bridge. The dialog plugin's `save()` returns a `content://`
//! URI on Android; the fs plugin cannot correctly write those (upstream bug
//! tauri-apps/plugins-workspace#3356 leaves the document's size metadata at
//! 0), and std::fs cannot touch them at all. This plugin reads and writes
//! them through ContentResolver streams instead, mirroring the local
//! `file-open` plugin's structure.

#[cfg(target_os = "android")]
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, Manager, Runtime};
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.pandax185.taassistant.safio";

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Serialize)]
struct ReadArg {
    uri: String,
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteArg {
    uri: String,
    /// Base64-encoded bytes; the Kotlin side decodes before writing.
    data_b64: String,
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadResponse {
    data_b64: String,
}

/// Access to the SAF I/O native APIs (Android only).
pub struct SafIo<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> SafIo<R> {
    /// Read the whole document behind a `content://` URI.
    pub fn read(&self, uri: String) -> Result<Vec<u8>, String> {
        #[cfg(target_os = "android")]
        {
            let res: ReadResponse = self
                .handle
                .run_mobile_plugin("read", ReadArg { uri })
                .map_err(|e| e.to_string())?;
            base64::engine::general_purpose::STANDARD
                .decode(res.data_b64.as_bytes())
                .map_err(|e| format!("Invalid SAF response payload: {e}"))
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = uri;
            Err("SAF I/O is only available on Android".to_string())
        }
    }

    /// Write (truncate-then-write) the document behind a `content://` URI.
    pub fn write(&self, uri: String, bytes: &[u8]) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            let arg = WriteArg {
                uri,
                data_b64: base64::engine::general_purpose::STANDARD.encode(bytes),
            };
            self.handle
                .run_mobile_plugin::<serde_json::Value>("write", arg)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (uri, bytes);
            Err("SAF I/O is only available on Android".to_string())
        }
    }
}

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to
/// access the SAF I/O APIs.
pub trait SafIoExt<R: Runtime> {
    fn saf_io(&self) -> &SafIo<R>;
}

impl<R: Runtime, T: Manager<R>> SafIoExt<R> for T {
    fn saf_io(&self) -> &SafIo<R> {
        self.state::<SafIo<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("saf-io")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "SafIoPlugin")?;

            app.manage(SafIo {
                #[cfg(target_os = "android")]
                handle,
                #[cfg(not(target_os = "android"))]
                _marker: std::marker::PhantomData::<fn() -> R>,
            });
            Ok(())
        })
        .build()
}
