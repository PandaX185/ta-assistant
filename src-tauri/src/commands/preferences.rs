use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2, PasswordHasher,
};
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Preferences {
    pub name: String,
    pub email: String,
    pub locale: String,
    pub theme: String,
    pub global_shortcut: String,
    pub auto_lock_minutes: i64,
    pub created_at: String,
}

#[tauri::command]
pub fn get_preferences(app: AppHandle) -> Result<Option<Preferences>, String> {
    let conn = crate::db::open_db(&app)?;

    let mut stmt = conn
        .prepare(
            "SELECT name, email, locale, theme, global_shortcut, auto_lock_minutes, created_at
             FROM preferences WHERE id = 1",
        )
        .map_err(|e| format!("Query prepare failed: {e}"))?;

    let result = stmt.query_row([], |row| {
        Ok(Preferences {
            name: row.get(0)?,
            email: row.get(1)?,
            locale: row.get(2)?,
            theme: row.get(3)?,
            global_shortcut: row.get(4)?,
            auto_lock_minutes: row.get(5)?,
            created_at: row.get(6)?,
        })
    });

    match result {
        Ok(prefs) => Ok(Some(prefs)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {e}")),
    }
}

#[tauri::command]
pub fn verify_password(app: AppHandle, password: String) -> Result<bool, String> {
    let conn = crate::db::open_db(&app)?;

    let stored: Option<String> = conn
        .query_row("SELECT password FROM preferences WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|e| format!("Query failed: {e}"))?;

    let Some(hash) = stored else {
        return Ok(false);
    };

    let parsed = PasswordHash::new(&hash).map_err(|e| format!("Stored hash invalid: {e}"))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[tauri::command]
pub fn save_preferences(
    app: AppHandle,
    name: String,
    email: String,
    password: String,
    locale: String,
    theme: String,
    global_shortcut: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Password hashing failed: {e}"))?
        .to_string();

    conn.execute(
        "INSERT INTO preferences (id, name, email, password, locale, theme, global_shortcut)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![name, email, password_hash, locale, theme, global_shortcut],
    )
    .map_err(|e| format!("Insert failed: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn update_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "UPDATE preferences SET theme = ?1 WHERE id = 1",
        rusqlite::params![theme],
    )
    .map_err(|e| format!("Update theme failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_locale(app: AppHandle, locale: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    conn.execute(
        "UPDATE preferences SET locale = ?1 WHERE id = 1",
        rusqlite::params![locale],
    )
    .map_err(|e| format!("Update locale failed: {e}"))?;
    Ok(())
}
