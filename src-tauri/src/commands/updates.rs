//! Cross-platform self-update checks backed by GitHub Releases.
//!
//! Tauri's built-in updater is desktop-only, so mobile (Android) needs a
//! custom mechanism. This module checks the latest published release, picks the
//! artifact that installs on the current platform (NSIS installer on Windows,
//! APK on Android), downloads it into app data, and hands it off:
//! the frontend calls the `android-installer` plugin on Android and
//! `open_downloaded`, which launches the downloaded installer, elsewhere.
//!
//! Network calls are behind `ureq` and isolated in tiny wrappers; the
//! version/asset decision logic lives in pure functions so the tests never
//! touch the network.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::io::Write;
use tauri::{AppHandle, Emitter, Manager};

const RELEASES_URL: &str = "https://api.github.com/repos/PandaX185/ta-assistant/releases/latest";
const USER_AGENT: &str = "ta-assistant (local-first updates)";
/// Event emitted with `DownloadProgress` while `download_update` streams.
pub const DOWNLOAD_PROGRESS_EVENT: &str = "update-download-progress";

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    #[serde(default)]
    size: u64,
    browser_download_url: String,
}

#[derive(Debug, Serialize)]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub bytes_total: Option<u64>,
}

/// Tags look like `v0.3.0`; GitHub releases may carry any semver-ish tag.
fn parse_version(tag: &str) -> Result<semver::Version, String> {
    let cleaned = tag.trim().trim_start_matches('v');
    semver::Version::parse(cleaned).map_err(|e| format!("unparsable release tag '{tag}': {e}"))
}

/// Pick the release asset that installs on `platform` ("windows", "android",
/// "linux", ...). Unknown platforms have no installer artifact.
fn preferred_asset<'a>(assets: &'a [GitHubAsset], platform: &str) -> Option<&'a GitHubAsset> {
    match platform {
        "android" => assets.iter().find(|a| a.name.ends_with(".apk")),
        "windows" => assets
            .iter()
            .find(|a| a.name.ends_with("-setup.exe"))
            .or_else(|| assets.iter().find(|a| a.name.ends_with(".msi"))),
        _ => None,
    }
}

/// Pure decision logic: classify the REST response for `/releases/latest`.
fn parse_update_status(
    current_version: &str,
    platform: &str,
    release_json: &str,
) -> Result<UpdateStatus, String> {
    let current = parse_version(current_version)?;
    let release: GitHubRelease =
        serde_json::from_str(release_json).map_err(|e| format!("invalid release payload: {e}"))?;
    let latest = parse_version(&release.tag_name)?;
    let asset = preferred_asset(&release.assets, platform);

    Ok(UpdateStatus {
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        update_available: latest > current && asset.is_some(),
        release_notes: release.body.clone(),
        published_at: release.published_at.clone(),
        download_url: asset.map(|a| a.browser_download_url.clone()),
        asset_name: asset.map(|a| a.name.clone()),
        asset_size: asset.map(|a| a.size),
    })
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateStatus, String> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let body = fetch_release_json()?;
        parse_update_status(&current, std::env::consts::OS, &body)
    })
    .await
    .map_err(|e| format!("update check task failed: {e}"))?
}

fn fetch_release_json() -> Result<String, String> {
    let agent = ureq::AgentBuilder::new().redirects(5).build();
    let resp = agent
        .get(RELEASES_URL)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("network error: {e}"))?;
    if resp.status() != 200 {
        return Err(format!("GitHub returned HTTP {}", resp.status()));
    }
    let mut body = String::new();
    resp.into_reader()
        .read_to_string(&mut body)
        .map_err(|e| format!("failed to read response: {e}"))?;
    Ok(body)
}

/// Download `url` (a GitHub release asset URL) into
/// `app_data_dir()/updates/<asset_name>` and return the absolute path. Runs on
/// a blocking worker so the webview stays responsive. Progress is reported on
/// the `update-download-progress` event.
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    url: String,
    asset_name: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || download_update_impl(&app, &url, &asset_name))
        .await
        .map_err(|e| format!("download task failed: {e}"))?
}

fn download_update_impl(app: &AppHandle, url: &str, asset_name: &str) -> Result<String, String> {
    let target = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?
        .join("updates");
    fs::create_dir_all(&target).map_err(|e| format!("failed to create updates dir: {e}"))?;
    let dest = target.join(sanitize_file_name(asset_name));

    let agent = ureq::AgentBuilder::new().redirects(5).build();
    let resp = agent
        .get(url)
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    let total: Option<u64> = resp.header("Content-Length").and_then(|v| v.parse().ok());
    let mut reader = resp.into_reader();
    let mut file = fs::File::create(&dest).map_err(|e| format!("failed to create file: {e}"))?;

    let mut downloaded = 0u64;
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("read failed: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("write failed: {e}"))?;
        downloaded += n as u64;
        let _ = app.emit(
            DOWNLOAD_PROGRESS_EVENT,
            DownloadProgress {
                bytes_downloaded: downloaded,
                bytes_total: total,
            },
        );
    }
    if let Some(total) = total {
        if downloaded != total {
            return Err(format!("download incomplete: {downloaded}/{total} bytes"));
        }
    }
    Ok(dest.to_string_lossy().to_string())
}

/// Asset names come from release metadata we don't fully trust; keep only the
/// characters that can never escape the updates directory.
fn sanitize_file_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Launch the downloaded installer on desktop (Windows NSIS/MSI). Android uses
/// the `android-installer` plugin instead, so this is only ever invoked there.
#[tauri::command]
pub fn open_downloaded(app: AppHandle, path: String) -> Result<(), String> {
    crate::commands::open_with_default(&app, std::path::Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release_json(body: &str) -> String {
        format!(
            r#"{{
                "tag_name": "v0.4.0",
                "name": "v0.4.0",
                "body": {body},
                "published_at": "2026-09-01T00:00:00Z",
                "assets": [
                    {{
                        "name": "TA Assistant_0.4.0_x64-setup.exe",
                        "size": 12345678,
                        "browser_download_url": "https://github.com/PandaX185/ta-assistant/releases/download/v0.4.0/TA%20Assistant_0.4.0_x64-setup.exe"
                    }},
                    {{
                        "name": "TA Assistant_0.4.0_x64_en-US.msi",
                        "size": 999000,
                        "browser_download_url": "https://github.com/.../TA%20Assistant_0.4.0_x64_en-US.msi"
                    }},
                    {{
                        "name": "ta-assistant-arm64-v8a.apk",
                        "size": 5000000,
                        "browser_download_url": "https://github.com/.../ta-assistant-arm64-v8a.apk"
                    }}
                ]
            }}"#,
        )
    }

    #[test]
    fn update_available_on_windows_picks_the_nsis_installer() {
        let status =
            parse_update_status("0.3.0", "windows", &release_json("\"notes here\"")).unwrap();
        assert!(status.update_available);
        assert_eq!(status.latest_version, "0.4.0");
        assert_eq!(
            status.asset_name.as_deref(),
            Some("TA Assistant_0.4.0_x64-setup.exe")
        );
        assert!(status.download_url.unwrap().ends_with("-setup.exe"));
        assert_eq!(status.asset_size, Some(12345678));
        assert_eq!(status.release_notes.as_deref(), Some("notes here"));
        assert_eq!(status.published_at.as_deref(), Some("2026-09-01T00:00:00Z"));
    }

    #[test]
    fn update_available_on_android_picks_the_apk() {
        let status = parse_update_status("0.3.0", "android", &release_json("null")).unwrap();
        assert!(status.update_available);
        assert_eq!(
            status.asset_name.as_deref(),
            Some("ta-assistant-arm64-v8a.apk")
        );
        assert!(status.download_url.unwrap().ends_with(".apk"));
        assert_eq!(status.release_notes, None);
    }

    #[test]
    fn up_to_date_when_versions_match() {
        let status = parse_update_status("0.4.0", "windows", &release_json("null")).unwrap();
        assert!(!status.update_available);
        assert_eq!(status.latest_version, "0.4.0");
    }

    #[test]
    fn no_asset_on_unsupported_platform_means_no_update() {
        let status = parse_update_status("0.3.0", "linux", &release_json("null")).unwrap();
        assert!(!status.update_available);
        assert_eq!(status.download_url, None);
    }

    #[test]
    fn build_tag_tolerates_missing_v_prefix() {
        let json =
            release_json("null").replace("\"tag_name\": \"v0.4.0\"", "\"tag_name\": \"0.4.0\"");
        let status = parse_update_status("0.3.0", "windows", &json).unwrap();
        assert!(status.update_available);
    }

    #[test]
    fn invalid_release_payload_is_reported() {
        let err = parse_update_status("0.3.0", "windows", "not json").unwrap_err();
        assert!(err.contains("invalid release payload"), "{err}");
        let err = parse_update_status("0.3.0", "windows", r#"{"tag_name":"garbage"}"#).unwrap_err();
        assert!(err.contains("unparsable release tag"), "{err}");
    }

    #[test]
    fn sanitize_file_name_removes_separators_and_keeps_extensions() {
        assert_eq!(
            sanitize_file_name("TA Assistant_0.4.0_x64-setup.exe"),
            "TA_Assistant_0.4.0_x64-setup.exe"
        );
        assert_eq!(sanitize_file_name("app.apk"), "app.apk");
        assert_eq!(sanitize_file_name("../etc/passwd"), ".._etc_passwd");
    }
}
