//! Per-lecture teaching material: the TA's notes (1:1), file attachments and
//! reference links (1:N). Files are copied into `app_data_dir()/materials/<lecture_id>/`
//! with UUID names; the DB row stores the original name + relative path, and the
//! disk path is always resolved server-side (never from client input).
//!
//! Command wrappers are thin; the `*_impl` functions take the materials root
//! explicitly so tests point them at a temp dir.

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Upper bound for a single attachment, in bytes.
const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct LectureInfo {
    pub id: String,
    pub date: String,
    pub title: Option<String>,
    pub subject_name: String,
    pub section_name: Option<String>,
    /// The subject_lecture that carries this attendance lecture's materials,
    /// when one exists (migration 020 reuses the same id). Lets the minimal
    /// lecture page deep-link into the Materials tab.
    pub subject_lecture_id: Option<String>,
}

#[derive(Serialize)]
pub struct NoteInfo {
    pub id: String,
    pub lecture_id: String,
    pub content_md: String,
    pub updated_at: i64,
}

#[derive(Serialize)]
pub struct FileInfo {
    pub id: String,
    pub lecture_id: String,
    pub file_name: String,
    pub stored_path: String,
    pub mime_type: String,
    pub file_size: i64,
    pub created_at: i64,
}

#[derive(Serialize)]
pub struct LinkInfo {
    pub id: String,
    pub lecture_id: String,
    pub title: String,
    pub url: String,
    pub created_at: i64,
}

#[derive(Serialize)]
pub struct MaterialsBundle {
    pub note: Option<NoteInfo>,
    pub files: Vec<FileInfo>,
    pub links: Vec<LinkInfo>,
}

#[derive(Serialize)]
pub struct AttachResult {
    pub files: Vec<FileInfo>,
    pub errors: Vec<String>,
}

/// One item handed to `attach_files`. On desktop the dialog returns real paths,
/// so `source` is a filesystem path. On Android it returns a `content://` URI,
/// which is read through the fs plugin; the display name is derived from the
/// URI's last segment (`file_name` exists only for future explicit overrides).
#[derive(serde::Deserialize)]
pub struct IncomingAttach {
    pub source: String,
    #[serde(default)]
    pub file_name: Option<String>,
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn materials_root(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    dir.push("materials");
    Ok(dir)
}

/// Joins a `stored_path` from the DB onto the (canonicalized) materials root,
/// rejecting absolute paths and any `..` traversal. Defense in depth: the
/// stored value is written by us, but we never trust it blindly.
fn safe_join(root: &Path, stored_path: &str) -> Result<PathBuf, String> {
    if stored_path.is_empty() {
        return Err("Invalid stored path".to_string());
    }
    let stored = Path::new(stored_path);
    if stored.is_absolute()
        || stored
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("Invalid stored path".to_string());
    }
    let root_canon =
        fs::canonicalize(root).map_err(|_| "Materials directory missing".to_string())?;
    Ok(root_canon.join(stored))
}

fn mime_from_name(name: &str) -> String {
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "txt" | "md" | "markdown" => "text/plain",
        "csv" => "text/csv",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "html" => "text/html",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[tauri::command]
pub fn get_lecture(app: AppHandle, lecture_id: String) -> Result<LectureInfo, String> {
    let conn = crate::db::open_db(&app)?;
    get_lecture_impl(&conn, &lecture_id)
}

fn get_lecture_impl(conn: &Connection, lecture_id: &str) -> Result<LectureInfo, String> {
    let mut stmt = conn
        .prepare(
            "SELECT l.id, l.date, l.title, s.name, sec.name, sl.id
             FROM lectures l
             JOIN subjects s ON s.id = l.subject_id
             LEFT JOIN sections sec ON sec.id = l.section_id
             LEFT JOIN subject_lectures sl ON sl.id = l.id
             WHERE l.id = ?1",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;
    stmt.query_row(rusqlite::params![lecture_id], |row| {
        Ok(LectureInfo {
            id: row.get(0)?,
            date: row.get(1)?,
            title: row.get(2)?,
            subject_name: row.get(3)?,
            section_name: row.get(4)?,
            subject_lecture_id: row.get(5)?,
        })
    })
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => "Lecture not found".to_string(),
        e => format!("Query failed: {e}"),
    })
}

// ---------------------------------------------------------------------------
// Subject lectures (the Materials tab's own groupings)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct SubjectLectureInfo {
    pub id: String,
    pub title: String,
    pub date: Option<String>,
    pub created_at: i64,
    pub file_count: i64,
    pub link_count: i64,
    pub has_note: bool,
}

/// Every material command targets a subject_lecture — never an attendance
/// lecture. This is the single guard enforcing that boundary.
fn ensure_subject_lecture(conn: &Connection, lecture_id: &str) -> Result<(), String> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM subject_lectures WHERE id = ?1",
            rusqlite::params![lecture_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Query failed: {e}"))?;
    if exists.is_none() {
        return Err("Subject lecture not found".to_string());
    }
    Ok(())
}

fn get_subject_lectures_impl(
    conn: &Connection,
    subject_id: &str,
) -> Result<Vec<SubjectLectureInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT sl.id, sl.title, sl.date, sl.created_at,
                    (SELECT COUNT(*) FROM material_files f WHERE f.lecture_id = sl.id),
                    (SELECT COUNT(*) FROM material_links k WHERE k.lecture_id = sl.id),
                    EXISTS (SELECT 1 FROM material_notes n WHERE n.lecture_id = sl.id)
             FROM subject_lectures sl
             WHERE sl.subject_id = ?1
             ORDER BY (sl.date IS NULL), sl.date DESC, sl.created_at DESC, sl.id",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![subject_id], |row| {
            Ok(SubjectLectureInfo {
                id: row.get(0)?,
                title: row.get(1)?,
                date: row.get(2)?,
                created_at: row.get(3)?,
                file_count: row.get(4)?,
                link_count: row.get(5)?,
                has_note: row.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(|e| format!("Query failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row failed: {e}"))?;
    Ok(rows)
}

fn create_subject_lecture_impl(
    conn: &Connection,
    subject_id: &str,
    title: &str,
    date: Option<String>,
) -> Result<SubjectLectureInfo, String> {
    if title.trim().is_empty() {
        return Err("Title is required".to_string());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    conn.execute(
        "INSERT INTO subject_lectures (id, subject_id, title, date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, subject_id, title.trim(), date, created_at],
    )
    .map_err(|e| format!("Create subject lecture failed: {e}"))?;
    Ok(SubjectLectureInfo {
        id,
        title: title.trim().to_string(),
        date,
        created_at,
        file_count: 0,
        link_count: 0,
        has_note: false,
    })
}

fn update_subject_lecture_impl(
    conn: &Connection,
    id: &str,
    title: &str,
    date: Option<String>,
) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("Title is required".to_string());
    }
    let affected = conn
        .execute(
            "UPDATE subject_lectures SET title = ?2, date = ?3 WHERE id = ?1",
            rusqlite::params![id, title.trim(), date],
        )
        .map_err(|e| format!("Update subject lecture failed: {e}"))?;
    if affected == 0 {
        return Err("Subject lecture not found".to_string());
    }
    Ok(())
}

fn delete_subject_lecture_impl(conn: &Connection, root: &Path, id: &str) -> Result<(), String> {
    let deleted = conn
        .execute(
            "DELETE FROM subject_lectures WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Delete subject lecture failed: {e}"))?;
    if deleted == 0 {
        return Err("Subject lecture not found".to_string());
    }
    // Rows cascaded; remove the folder best-effort (same as lecture delete).
    let _ = fs::remove_dir_all(root.join(id));
    Ok(())
}

#[tauri::command]
pub fn get_subject_lectures(
    app: AppHandle,
    subject_id: String,
) -> Result<Vec<SubjectLectureInfo>, String> {
    let conn = crate::db::open_db(&app)?;
    get_subject_lectures_impl(&conn, &subject_id)
}

#[tauri::command]
pub fn create_subject_lecture(
    app: AppHandle,
    subject_id: String,
    title: String,
    date: Option<String>,
) -> Result<SubjectLectureInfo, String> {
    let conn = crate::db::open_db(&app)?;
    create_subject_lecture_impl(&conn, &subject_id, &title, date)
}

#[tauri::command]
pub fn update_subject_lecture(
    app: AppHandle,
    id: String,
    title: String,
    date: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    update_subject_lecture_impl(&conn, &id, &title, date)
}

#[tauri::command]
pub fn delete_subject_lecture(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    delete_subject_lecture_impl(&conn, &materials_root(&app)?, &id)
}

#[tauri::command]
pub fn get_lecture_materials(
    app: AppHandle,
    lecture_id: String,
) -> Result<MaterialsBundle, String> {
    let conn = crate::db::open_db(&app)?;
    get_lecture_materials_impl(&conn, &lecture_id)
}

fn get_lecture_materials_impl(
    conn: &Connection,
    lecture_id: &str,
) -> Result<MaterialsBundle, String> {
    ensure_subject_lecture(conn, lecture_id)?;
    let note = conn
        .query_row(
            "SELECT id, lecture_id, content_md, updated_at FROM material_notes
             WHERE lecture_id = ?1",
            rusqlite::params![lecture_id],
            |row| {
                Ok(NoteInfo {
                    id: row.get(0)?,
                    lecture_id: row.get(1)?,
                    content_md: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Query failed: {e}"))?;

    let mut files = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, lecture_id, file_name, stored_path, mime_type, file_size, created_at
                 FROM material_files WHERE lecture_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| format!("Query prepare failed: {e}"))?;
        let rows = stmt
            .query_map(rusqlite::params![lecture_id], |row| {
                Ok(FileInfo {
                    id: row.get(0)?,
                    lecture_id: row.get(1)?,
                    file_name: row.get(2)?,
                    stored_path: row.get(3)?,
                    mime_type: row.get(4)?,
                    file_size: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Query failed: {e}"))?;
        for row in rows {
            files.push(row.map_err(|e| format!("Row failed: {e}"))?);
        }
    }

    let mut links = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, lecture_id, title, url, created_at
                 FROM material_links WHERE lecture_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| format!("Query prepare failed: {e}"))?;
        let rows = stmt
            .query_map(rusqlite::params![lecture_id], |row| {
                Ok(LinkInfo {
                    id: row.get(0)?,
                    lecture_id: row.get(1)?,
                    title: row.get(2)?,
                    url: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| format!("Query failed: {e}"))?;
        for row in rows {
            links.push(row.map_err(|e| format!("Row failed: {e}"))?);
        }
    }

    Ok(MaterialsBundle { note, files, links })
}

#[tauri::command]
pub fn save_note(
    app: AppHandle,
    lecture_id: String,
    content_md: String,
) -> Result<NoteInfo, String> {
    let conn = crate::db::open_db(&app)?;
    save_note_impl(&conn, &lecture_id, &content_md)
}

/// Notes are 1:1 per lecture: upsert on the UNIQUE lecture_id.
fn save_note_impl(
    conn: &Connection,
    lecture_id: &str,
    content_md: &str,
) -> Result<NoteInfo, String> {
    ensure_subject_lecture(conn, lecture_id)?;
    let id = if let Some(id) = conn
        .query_row(
            "SELECT id FROM material_notes WHERE lecture_id = ?1",
            rusqlite::params![lecture_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("Query failed: {e}"))?
    {
        id
    } else {
        uuid::Uuid::new_v4().to_string()
    };
    let updated_at = now_millis();
    conn.execute(
        "INSERT INTO material_notes (id, lecture_id, content_md, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(lecture_id) DO UPDATE SET content_md = excluded.content_md, updated_at = excluded.updated_at",
        rusqlite::params![id, lecture_id, content_md, updated_at],
    )
    .map_err(|e| format!("Save note failed: {e}"))?;
    Ok(NoteInfo {
        id,
        lecture_id: lecture_id.to_string(),
        content_md: content_md.to_string(),
        updated_at,
    })
}

/// Real paths (all desktop platforms) go through the streaming copy loop.
/// Android hands back `content://` URIs instead, which std::fs cannot touch;
/// those are read through the fs plugin (it resolves Android content URIs).
fn split_incoming(files: &[IncomingAttach]) -> (Vec<String>, Vec<&IncomingAttach>) {
    let paths = files
        .iter()
        .filter(|f| !f.source.starts_with("content://"))
        .map(|f| f.source.clone())
        .collect::<Vec<_>>();
    let content = files
        .iter()
        .filter(|f| f.source.starts_with("content://"))
        .collect::<Vec<_>>();
    (paths, content)
}

#[tauri::command]
pub fn attach_files(
    app: AppHandle,
    lecture_id: String,
    files: Vec<IncomingAttach>,
) -> Result<AttachResult, String> {
    let conn = crate::db::open_db(&app)?;
    let root = materials_root(&app)?;

    let mut result = AttachResult {
        files: Vec::new(),
        errors: Vec::new(),
    };

    let (path_sources, content_files) = split_incoming(&files);
    if !path_sources.is_empty() {
        let paths_result = attach_files_impl(&conn, &root, &lecture_id, &path_sources)?;
        result.files.extend(paths_result.files);
        result.errors.extend(paths_result.errors);
    }
    for incoming in content_files {
        match attach_content_file(&app, &conn, &root, &lecture_id, incoming) {
            Ok(file) => result.files.push(file),
            Err(e) => {
                let name = incoming.file_name.as_deref().unwrap_or("attachment");
                result.errors.push(format!("{name}: {e}"));
            }
        }
    }

    Ok(result)
}

fn attach_files_impl(
    conn: &Connection,
    root: &Path,
    lecture_id: &str,
    source_paths: &[String],
) -> Result<AttachResult, String> {
    ensure_subject_lecture(conn, lecture_id)?;
    let mut files = Vec::new();
    let mut errors = Vec::new();
    let dir = root.join(lecture_id);

    for source in source_paths {
        let sp = Path::new(source);
        let meta = match fs::metadata(sp) {
            Ok(m) => m,
            Err(e) => {
                errors.push(format!("{}: {e}", sp.display()));
                continue;
            }
        };
        if !meta.is_file() {
            errors.push(format!("{}: not a file", sp.display()));
            continue;
        }
        if meta.len() == 0 || meta.len() > MAX_FILE_SIZE {
            errors.push(format!("{}: size outside the allowed range", sp.display()));
            continue;
        }

        let file_name = sp
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("attachment");
        if let Err(e) = fs::create_dir_all(&dir) {
            errors.push(format!(
                "{}: failed to create materials folder: {e}",
                sp.display()
            ));
            continue;
        }
        let stored_name = stored_name_for(file_name);
        let relative = format!("{}/{}", lecture_id, stored_name);
        let dest = root.join(&relative);
        if let Err(e) = fs::copy(sp, &dest) {
            errors.push(format!("{}: failed to copy file: {e}", sp.display()));
            continue;
        }

        match insert_file_row(conn, lecture_id, file_name, &relative, meta.len() as i64) {
            Ok(file) => files.push(file),
            Err(e) => {
                let _ = fs::remove_file(&dest);
                errors.push(format!("{}: {e}", sp.display()));
            }
        }
    }

    Ok(AttachResult { files, errors })
}

/// Attach a file picked on Android, where the dialog returns a `content://`
/// URI instead of a filesystem path. The bytes are read through the fs plugin
/// (which resolves Android content URIs) and stored like any other attachment.
/// The real display name comes from the content provider when available
/// (SAF URIs usually end in opaque ids, so the URI itself cannot be trusted).
fn attach_content_file(
    app: &AppHandle,
    conn: &Connection,
    root: &Path,
    lecture_id: &str,
    incoming: &IncomingAttach,
) -> Result<FileInfo, String> {
    ensure_subject_lecture(conn, lecture_id)?;
    use tauri_plugin_fs::{FilePath, FsExt};
    let path: FilePath = incoming
        .source
        .parse()
        .map_err(|_| "invalid source path".to_string())?;
    let data = app
        .fs()
        .read(path)
        .map_err(|e| format!("failed to read picked file: {e}"))?;
    let file_name = incoming
        .file_name
        .clone()
        .or_else(|| resolve_content_name(app, &incoming.source))
        .or_else(|| derive_content_name(&incoming.source))
        .unwrap_or_else(|| "attachment".to_string());
    store_attachment_bytes(conn, root, lecture_id, &file_name, &data)
}

/// Ask the native plugin to resolve a `content://` URI's display name from its
/// content provider (`OpenableColumns.DISPLAY_NAME`). Outside Android this
/// never happens (the desktop dialog returns real paths instead).
fn resolve_content_name(app: &AppHandle, source: &str) -> Option<String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_file_open::FileOpenExt;
        app.file_open().file_name(source.to_string()).ok().flatten()
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, source);
        None
    }
}

/// Best-effort display name for an Android `content://` URI. SAF pickers
/// usually encode the real file name in the last URI segment, percent-encoded
/// (e.g. `.../document/primary%3ADownloads%2Flecture%20notes.pdf`). When that
/// segment is just an opaque numeric id, we return None so a fallback name is
/// used instead.
fn derive_content_name(uri: &str) -> Option<String> {
    let last = uri.rfind('/').and_then(|i| uri.get(i + 1..))?;
    if last.is_empty() {
        return None;
    }
    let decoded = percent_encoding::percent_decode_str(last).decode_utf8_lossy();
    let name = decoded.rsplit('/').next().unwrap_or(&decoded);
    // Strip a provider key prefix like `primary:` or `msf:`.
    let name = name.rsplit(':').next().unwrap_or(name);
    if name.is_empty() || name.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(name.to_string())
}

/// Write a byte buffer into the lecture folder and register it in the DB.
/// Used on mobile where the picker only exposes `content://` URIs.
fn store_attachment_bytes(
    conn: &Connection,
    root: &Path,
    lecture_id: &str,
    file_name: &str,
    data: &[u8],
) -> Result<FileInfo, String> {
    if data.is_empty() || data.len() as u64 > MAX_FILE_SIZE {
        return Err("size outside the allowed range".to_string());
    }
    let dir = root.join(lecture_id);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create materials folder: {e}"))?;
    let stored_name = stored_name_for(file_name);
    let relative = format!("{}/{}", lecture_id, stored_name);
    let dest = root.join(&relative);
    fs::write(&dest, data).map_err(|e| format!("failed to write file: {e}"))?;
    match insert_file_row(conn, lecture_id, file_name, &relative, data.len() as i64) {
        Ok(file) => Ok(file),
        Err(e) => {
            let _ = fs::remove_file(&dest);
            Err(e)
        }
    }
}

/// Stored filename: UUID + original extension (so opening apps can sniff the
/// type). Files without an extension keep the bare UUID.
fn stored_name_for(file_name: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if ext.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        format!("{}.{}", uuid::Uuid::new_v4(), ext)
    }
}

/// Shared insert for a stored attachment; returns the full `FileInfo`.
fn insert_file_row(
    conn: &Connection,
    lecture_id: &str,
    file_name: &str,
    relative: &str,
    size_bytes: i64,
) -> Result<FileInfo, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    conn.execute(
        "INSERT INTO material_files (id, lecture_id, file_name, stored_path, mime_type, file_size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            id,
            lecture_id,
            file_name,
            relative,
            mime_from_name(file_name),
            size_bytes,
            created_at,
        ],
    )
    .map_err(|e| format!("failed to save: {e}"))?;
    Ok(FileInfo {
        id,
        lecture_id: lecture_id.to_string(),
        file_name: file_name.to_string(),
        stored_path: relative.to_string(),
        mime_type: mime_from_name(file_name),
        file_size: size_bytes,
        created_at,
    })
}

#[tauri::command]
pub fn delete_file(app: AppHandle, file_id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    delete_file_impl(&conn, &materials_root(&app)?, &file_id)
}

fn delete_file_impl(conn: &Connection, root: &Path, file_id: &str) -> Result<(), String> {
    let stored_path: String = conn
        .query_row(
            "SELECT stored_path FROM material_files WHERE id = ?1",
            rusqlite::params![file_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Query failed: {e}"))?
        .ok_or_else(|| "File not found".to_string())?;

    conn.execute(
        "DELETE FROM material_files WHERE id = ?1",
        rusqlite::params![file_id],
    )
    .map_err(|e| format!("Delete file failed: {e}"))?;

    if let Ok(path) = safe_join(root, &stored_path) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

/// Resolves and validates a lecture_file's on-disk path. Used by `open_file`;
/// returns the canonical path only if the row exists and the file is present
/// inside the materials root.
fn resolve_file_path(conn: &Connection, root: &Path, file_id: &str) -> Result<PathBuf, String> {
    let stored_path: String = conn
        .query_row(
            "SELECT stored_path FROM material_files WHERE id = ?1",
            rusqlite::params![file_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Query failed: {e}"))?
        .ok_or_else(|| "File not found".to_string())?;

    let expected = safe_join(root, &stored_path)?;
    let canonical =
        fs::canonicalize(&expected).map_err(|_| "File is missing on disk".to_string())?;
    let root_canon =
        fs::canonicalize(root).map_err(|_| "Materials directory missing".to_string())?;
    if !canonical.starts_with(&root_canon) {
        return Err("Invalid stored path".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
pub fn open_file(app: AppHandle, file_id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    let path = resolve_file_path(&conn, &materials_root(&app)?, &file_id)?;
    crate::commands::open_with_default(&app, &path)
}

#[tauri::command]
pub fn add_link(
    app: AppHandle,
    lecture_id: String,
    title: String,
    url: String,
) -> Result<LinkInfo, String> {
    let conn = crate::db::open_db(&app)?;
    add_link_impl(&conn, &lecture_id, &title, &url)
}

fn add_link_impl(
    conn: &Connection,
    lecture_id: &str,
    title: &str,
    url: &str,
) -> Result<LinkInfo, String> {
    ensure_subject_lecture(conn, lecture_id)?;
    if title.trim().is_empty() {
        return Err("Title is required".to_string());
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL must start with http:// or https://".to_string());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    conn.execute(
        "INSERT INTO material_links (id, lecture_id, title, url, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, lecture_id, title, url, created_at],
    )
    .map_err(|e| format!("Add link failed: {e}"))?;
    Ok(LinkInfo {
        id,
        lecture_id: lecture_id.to_string(),
        title: title.to_string(),
        url: url.to_string(),
        created_at,
    })
}

#[tauri::command]
pub fn update_link(
    app: AppHandle,
    link_id: String,
    title: String,
    url: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    update_link_impl(&conn, &link_id, &title, &url)
}

fn update_link_impl(
    conn: &Connection,
    link_id: &str,
    title: &str,
    url: &str,
) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("Title is required".to_string());
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL must start with http:// or https://".to_string());
    }
    let affected = conn
        .execute(
            "UPDATE material_links SET title = ?2, url = ?3 WHERE id = ?1",
            rusqlite::params![link_id, title, url],
        )
        .map_err(|e| format!("Update link failed: {e}"))?;
    if affected == 0 {
        return Err("Link not found".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn delete_link(app: AppHandle, link_id: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    delete_link_impl(&conn, &link_id)
}

fn delete_link_impl(conn: &Connection, link_id: &str) -> Result<(), String> {
    let affected = conn
        .execute(
            "DELETE FROM material_links WHERE id = ?1",
            rusqlite::params![link_id],
        )
        .map_err(|e| format!("Delete link failed: {e}"))?;
    if affected == 0 {
        return Err("Link not found".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::attendance_cmd::create_lecture_impl;
    use crate::commands::test_utils;
    use std::path::PathBuf;

    fn temp_root(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "ta-materials-test-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&p).expect("create temp root");
        p
    }

    fn seeded_lecture(conn: &Connection) -> String {
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(conn);
        test_utils::seed_section(conn, "sec-1", &sy, &sub);
        create_lecture_impl(
            conn,
            sub,
            sy,
            "sec-1".to_string(),
            "2026-02-01".to_string(),
            None,
        )
        .unwrap();
        conn.query_row(
            "SELECT id FROM lectures WHERE date = '2026-02-01'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap()
    }

    /// A subject_lecture for the materials tests — the only valid target of
    /// material commands after migration 020.
    fn seeded_subject_lecture(conn: &Connection) -> String {
        let (_sy, sub, _a, _b) = test_utils::seed_basic_scenario(conn);
        create_subject_lecture_impl(conn, &sub, "Theoretical intro", Some("2026-02-01".into()))
            .unwrap()
            .id
    }

    fn write_source(root: &Path, name: &str, bytes: &[u8]) -> String {
        let p = root.join(name);
        fs::write(&p, bytes).expect("write source");
        p.to_string_lossy().to_string()
    }

    #[test]
    fn get_lecture_returns_header_with_section() {
        let conn = test_utils::test_conn();
        let lid = seeded_lecture(&conn);
        let info = get_lecture_impl(&conn, &lid).unwrap();
        assert_eq!(info.date, "2026-02-01");
        assert_eq!(info.subject_name, "Databases");
        assert_eq!(info.section_name.as_deref(), Some("Group A"));
        assert!(info.title.is_none());
    }

    #[test]
    fn get_lecture_unknown_id_errors() {
        let conn = test_utils::test_conn();
        let err = get_lecture_impl(&conn, "nope").unwrap_err();
        assert!(err.contains("not found"), "{err}");
    }

    #[test]
    fn save_note_upserts_not_replicates() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let first = save_note_impl(&conn, &lid, "# Intro").unwrap();
        let second = save_note_impl(&conn, &lid, "# Intro\n\nUpdated").unwrap();
        assert_eq!(first.id, second.id, "upsert keeps the same row");
        assert!(second.updated_at >= first.updated_at);

        let bundle = get_lecture_materials_impl(&conn, &lid).unwrap();
        let note = bundle.note.expect("note present");
        assert_eq!(note.content_md, "# Intro\n\nUpdated");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM material_notes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn empty_materials_bundle_has_no_note_and_empty_lists() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let bundle = get_lecture_materials_impl(&conn, &lid).unwrap();
        assert!(bundle.note.is_none());
        assert!(bundle.files.is_empty());
        assert!(bundle.links.is_empty());
    }

    #[test]
    fn attach_files_copies_into_lecture_dir_and_lists() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let src = temp_root("src");
        let root = temp_root("root");
        let p1 = write_source(&src, "slides.pdf", b"%PDF-1.4 test");
        let p2 = write_source(&src, "image.PNG", b"pngbytes");

        let result = attach_files_impl(&conn, &root, &lid, &[p1, p2]).unwrap();
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        assert_eq!(result.files.len(), 2);

        let by_name: std::collections::HashMap<_, _> = result
            .files
            .iter()
            .map(|f| (f.file_name.clone(), f))
            .collect();
        assert!(by_name["slides.pdf"]
            .stored_path
            .starts_with(&format!("{lid}/")));
        assert_eq!(by_name["slides.pdf"].mime_type, "application/pdf");
        assert_eq!(by_name["image.PNG"].mime_type, "image/png");
        assert_eq!(by_name["slides.pdf"].file_size, 13);

        let disk = root.join(&by_name["slides.pdf"].stored_path);
        assert_eq!(fs::read(&disk).unwrap(), b"%PDF-1.4 test");

        let bundle = get_lecture_materials_impl(&conn, &lid).unwrap();
        assert_eq!(bundle.files.len(), 2);
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn attach_files_reports_per_file_errors() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let src = temp_root("src");
        let root = temp_root("root");
        let good = write_source(&src, "ok.txt", b"hello");
        let missing = src.join("does-not-exist.pdf").to_string_lossy().to_string();

        let result = attach_files_impl(&conn, &root, &lid, &[good, missing]).unwrap();
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.errors.len(), 1);
        assert!(
            result.errors[0].contains("does-not-exist.pdf"),
            "{}",
            result.errors[0]
        );
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn derive_content_name_extracts_names_from_saf_uris() {
        // Real-name encodings seen from the Downloads/external-storage pickers.
        assert_eq!(
            derive_content_name(
                "content://com.android.externalstorage.documents/document/primary%3ADownloads%2Flecture%20notes.pdf"
            )
            .as_deref(),
            Some("lecture notes.pdf")
        );
        assert_eq!(
            derive_content_name(
                "content://com.android.providers.downloads.documents/document/msf%3A42"
            )
            .as_deref(),
            None,
            "provider ids are opaque; fall back to a generic name"
        );
        assert_eq!(
            derive_content_name("content://media/external/images/media/12345").as_deref(),
            None
        );
        assert_eq!(derive_content_name("not a uri"), None);
        assert_eq!(derive_content_name("content:///"), None);
    }

    #[test]
    fn store_attachment_bytes_persists_buffer_with_name() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let root = temp_root("root");

        let file =
            store_attachment_bytes(&conn, &root, &lid, "notes.pdf", b"%PDF-1.4 data").unwrap();
        assert_eq!(file.file_name, "notes.pdf");
        assert_eq!(file.mime_type, "application/pdf");
        assert_eq!(file.file_size, 13);
        assert!(file.stored_path.starts_with(&format!("{lid}/")));
        assert_eq!(
            fs::read(root.join(&file.stored_path)).unwrap(),
            b"%PDF-1.4 data"
        );

        // Empty buffers and oversized ones are rejected.
        assert!(store_attachment_bytes(&conn, &root, &lid, "empty.bin", b"").is_err());
        let big = vec![0u8; (MAX_FILE_SIZE + 1) as usize];
        assert!(store_attachment_bytes(&conn, &root, &lid, "big.bin", &big).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn attach_files_splits_paths_and_content_uris() {
        let src = temp_root("src");
        let p = write_source(&src, "ok.txt", b"hello");
        let incoming = [
            IncomingAttach {
                source: p,
                file_name: None,
            },
            IncomingAttach {
                source: "content://com.android.providers.downloads/doc/7".to_string(),
                file_name: Some("desktop-cannot-read.cn".to_string()),
            },
        ];

        let (paths, content) = split_incoming(&incoming);
        assert_eq!(
            paths,
            vec![src.join("ok.txt").to_string_lossy().to_string()]
        );
        assert_eq!(content.len(), 1);
        assert_eq!(
            content[0].file_name.as_deref(),
            Some("desktop-cannot-read.cn")
        );
        let _ = fs::remove_dir_all(&src);
    }

    #[test]
    fn delete_file_removes_row_and_disk_file() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let src = temp_root("src");
        let root = temp_root("root");
        let p = write_source(&src, "a.pdf", b"abc");
        let attached = attach_files_impl(&conn, &root, &lid, &[p]).unwrap();
        let file_id = attached.files[0].id.clone();
        let stored = root.join(&attached.files[0].stored_path);
        assert!(stored.exists());

        delete_file_impl(&conn, &root, &file_id).unwrap();
        assert!(!stored.exists());
        assert!(get_lecture_materials_impl(&conn, &lid)
            .unwrap()
            .files
            .is_empty());
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn delete_file_tolerates_missing_disk_file() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let src = temp_root("src");
        let root = temp_root("root");
        let p = write_source(&src, "a.pdf", b"abc");
        let attached = attach_files_impl(&conn, &root, &lid, &[p]).unwrap();
        let file_id = attached.files[0].id.clone();
        fs::remove_file(root.join(&attached.files[0].stored_path)).unwrap();

        delete_file_impl(&conn, &root, &file_id).unwrap();
        assert!(get_lecture_materials_impl(&conn, &lid)
            .unwrap()
            .files
            .is_empty());
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn delete_file_unknown_id_errors() {
        let conn = test_utils::test_conn();
        let root = temp_root("root");
        let err = delete_file_impl(&conn, &root, "nope").unwrap_err();
        assert!(err.contains("not found"), "{err}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_file_path_rejects_traversal_and_missing_files() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let root = temp_root("root");
        // A row whose stored_path escapes the root must be rejected.
        conn.execute(
            "INSERT INTO material_files (id, lecture_id, file_name, stored_path, mime_type, file_size, created_at)
             VALUES ('evil', ?1, 'x.txt', '../../evil.txt', 'text/plain', 1, 0)",
            rusqlite::params![lid],
        )
        .unwrap();
        let err = resolve_file_path(&conn, &root, "evil").unwrap_err();
        assert!(err.contains("Invalid stored path"), "{err}");

        // Absolute stored_path also rejected.
        conn.execute(
            "UPDATE material_files SET stored_path = '/etc/passwd' WHERE id = 'evil'",
            [],
        )
        .unwrap();
        let err = resolve_file_path(&conn, &root, "evil").unwrap_err();
        assert!(err.contains("Invalid stored path"), "{err}");

        // Unknown id.
        let err = resolve_file_path(&conn, &root, "nope").unwrap_err();
        assert!(err.contains("not found"), "{err}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_file_path_returns_existing_file() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let src = temp_root("src");
        let root = temp_root("root");
        let p = write_source(&src, "ok.pdf", b"bytes");
        let attached = attach_files_impl(&conn, &root, &lid, &[p]).unwrap();
        let file_id = attached.files[0].id.clone();

        let path = resolve_file_path(&conn, &root, &file_id).unwrap();
        assert_eq!(
            path,
            fs::canonicalize(root.join(&attached.files[0].stored_path)).unwrap()
        );
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn link_crud_validates_urls() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);

        assert!(add_link_impl(&conn, &lid, "Docs", "ftp://x").is_err());
        assert!(add_link_impl(&conn, &lid, "  ", "https://ok.test").is_err());

        let link = add_link_impl(&conn, &lid, "Docs", "https://ok.test").unwrap();
        let bundle = get_lecture_materials_impl(&conn, &lid).unwrap();
        assert_eq!(bundle.links.len(), 1);
        assert_eq!(bundle.links[0].url, "https://ok.test");

        update_link_impl(&conn, &link.id, "Docs v2", "http://other.test").unwrap();
        let bundle = get_lecture_materials_impl(&conn, &lid).unwrap();
        assert_eq!(bundle.links[0].title, "Docs v2");
        assert_eq!(bundle.links[0].url, "http://other.test");

        assert!(update_link_impl(&conn, &link.id, "t", "javascript:alert(1)").is_err());
        assert!(delete_link_impl(&conn, "nope").is_err());
        delete_link_impl(&conn, &link.id).unwrap();
        assert!(get_lecture_materials_impl(&conn, &lid)
            .unwrap()
            .links
            .is_empty());
    }

    #[test]
    fn deleting_subject_lecture_cascades_rows_and_removes_dir() {
        let conn = test_utils::test_conn();
        let lid = seeded_subject_lecture(&conn);
        let root = temp_root("root");

        save_note_impl(&conn, &lid, "abc").unwrap();
        add_link_impl(&conn, &lid, "L", "https://x.test").unwrap();
        let src = temp_root("src");
        let p = write_source(&src, "a.pdf", b"abc");
        attach_files_impl(&conn, &root, &lid, &[p]).unwrap();
        assert!(root.join(&lid).exists());

        delete_subject_lecture_impl(&conn, &root, lid.clone().as_str()).unwrap();

        let note_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM material_notes", [], |r| r.get(0))
            .unwrap();
        let file_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM material_files", [], |r| r.get(0))
            .unwrap();
        let link_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM material_links", [], |r| r.get(0))
            .unwrap();
        assert_eq!((note_count, file_count, link_count), (0, 0, 0));
        assert!(!root.join(&lid).exists(), "materials dir removed");
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn subject_lecture_crud_and_listing() {
        let conn = test_utils::test_conn();
        let (_sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        let sl = create_subject_lecture_impl(&conn, &sub, "Week 1", Some("2026-02-01".into()))
            .unwrap()
            .id;
        let sl2 = create_subject_lecture_impl(&conn, &sub, "Undated", None)
            .unwrap()
            .id;
        assert!(create_subject_lecture_impl(&conn, &sub, "  ", None).is_err());
        assert!(create_subject_lecture_impl(&conn, "nope", "x", None).is_err());

        let list = get_subject_lectures_impl(&conn, &sub).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, sl, "dated entry sorts before the undated one");
        assert_eq!(list[1].id, sl2);
        assert!(!list[0].has_note);
        assert_eq!((list[0].file_count, list[0].link_count), (0, 0));

        update_subject_lecture_impl(&conn, &sl, "Week 1 — intro", None).unwrap();
        assert!(update_subject_lecture_impl(&conn, "nope", "x", None).is_err());
        let list = get_subject_lectures_impl(&conn, &sub).unwrap();
        let by_id = |id: &str| list.iter().find(|e| e.id == id).unwrap();
        assert_eq!(by_id(&sl).title, "Week 1 — intro");
        assert_eq!(by_id(&sl).date, None);
    }

    #[test]
    fn material_commands_reject_attendance_lecture_ids() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        test_utils::seed_section(&conn, "sec-1", &sy, &sub);
        create_lecture_impl(
            &conn,
            sub,
            sy,
            "sec-1".to_string(),
            "2026-02-01".to_string(),
            None,
        )
        .unwrap();
        let lid: String = conn
            .query_row(
                "SELECT id FROM lectures WHERE date = '2026-02-01'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(save_note_impl(&conn, &lid, "x").is_err());
        assert!(add_link_impl(&conn, &lid, "L", "https://x.test").is_err());
        let root = temp_root("root");
        assert!(attach_files_impl(&conn, &root, &lid, &[]).is_err());
        assert!(get_lecture_materials_impl(&conn, &lid).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn get_lecture_reports_subject_lecture_mapping() {
        let conn = test_utils::test_conn();
        let (sy, sub, _a, _b) = test_utils::seed_basic_scenario(&conn);
        test_utils::seed_section(&conn, "sec-1", &sy, &sub);
        create_lecture_impl(
            &conn,
            sub.clone(),
            sy,
            "sec-1".to_string(),
            "2026-02-01".to_string(),
            None,
        )
        .unwrap();
        let lid: String = conn
            .query_row(
                "SELECT id FROM lectures WHERE date = '2026-02-01'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(get_lecture_impl(&conn, &lid)
            .unwrap()
            .subject_lecture_id
            .is_none());

        // Migration 020 links the two by REUSING the lecture id — simulate it.
        conn.execute(
            "INSERT INTO subject_lectures (id, subject_id, title, date, created_at)
             VALUES (?1, ?2, 'Mapped', '2026-02-01', 0)",
            rusqlite::params![lid, sub],
        )
        .unwrap();
        assert_eq!(
            get_lecture_impl(&conn, &lid)
                .unwrap()
                .subject_lecture_id
                .as_deref(),
            Some(lid.as_str())
        );
    }
}
