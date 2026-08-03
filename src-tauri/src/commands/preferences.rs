use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2, PasswordHasher,
};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, PartialEq, Debug)]
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
    get_preferences_impl(&conn)
}

fn get_preferences_impl(conn: &Connection) -> Result<Option<Preferences>, String> {
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
    verify_password_impl(&conn, password)
}

fn verify_password_impl(conn: &Connection, password: String) -> Result<bool, String> {
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
    save_preferences_impl(&conn, name, email, password, locale, theme, global_shortcut)
}

fn save_preferences_impl(
    conn: &Connection,
    name: String,
    email: String,
    password: String,
    locale: String,
    theme: String,
    global_shortcut: String,
) -> Result<(), String> {
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
    update_theme_impl(&conn, theme)
}

fn update_theme_impl(conn: &Connection, theme: String) -> Result<(), String> {
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
    update_locale_impl(&conn, locale)
}

fn update_locale_impl(conn: &Connection, locale: String) -> Result<(), String> {
    conn.execute(
        "UPDATE preferences SET locale = ?1 WHERE id = 1",
        rusqlite::params![locale],
    )
    .map_err(|e| format!("Update locale failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_utils;

    fn saved_conn() -> Connection {
        let conn = test_utils::test_conn();
        save_preferences_impl(
            &conn,
            "Abdullah".into(),
            "abdullah@example.com".into(),
            "secret123".into(),
            "en".into(),
            "dark".into(),
            "Ctrl+Shift+P".into(),
        )
        .expect("save preferences");
        conn
    }

    #[test]
    fn get_preferences_returns_none_when_empty() {
        let conn = test_utils::test_conn();
        assert_eq!(get_preferences_impl(&conn).unwrap(), None);
    }

    #[test]
    fn save_then_get_roundtrips_values() {
        let conn = saved_conn();
        let prefs = get_preferences_impl(&conn).unwrap().expect("prefs exist");
        assert_eq!(prefs.name, "Abdullah");
        assert_eq!(prefs.email, "abdullah@example.com");
        assert_eq!(prefs.locale, "en");
        assert_eq!(prefs.theme, "dark");
        assert_eq!(prefs.global_shortcut, "Ctrl+Shift+P");
        assert_eq!(prefs.auto_lock_minutes, 0);
        assert!(!prefs.created_at.is_empty());
    }

    #[test]
    fn save_twice_is_rejected() {
        let conn = saved_conn();
        let err = save_preferences_impl(
            &conn,
            "Again".into(),
            "x@y.com".into(),
            "password".into(),
            "en".into(),
            "light".into(),
            "Ctrl+Shift+P".into(),
        )
        .unwrap_err();
        assert!(err.contains("Insert failed"), "unexpected error: {err}");
    }

    #[test]
    fn verify_password_accepts_correct_and_rejects_wrong() {
        let conn = saved_conn();
        assert!(verify_password_impl(&conn, "secret123".into()).unwrap());
        assert!(!verify_password_impl(&conn, "wrong".into()).unwrap());
        assert!(!verify_password_impl(&conn, "".into()).unwrap());
    }

    #[test]
    fn verify_password_false_when_no_preferences() {
        let conn = test_utils::test_conn();
        assert!(!verify_password_impl(&conn, "anything".into()).unwrap());
    }

    #[test]
    fn update_theme_persists() {
        let conn = saved_conn();
        update_theme_impl(&conn, "light".into()).unwrap();
        assert_eq!(get_preferences_impl(&conn).unwrap().unwrap().theme, "light");
    }

    #[test]
    fn update_locale_persists() {
        let conn = saved_conn();
        update_locale_impl(&conn, "ar".into()).unwrap();
        assert_eq!(get_preferences_impl(&conn).unwrap().unwrap().locale, "ar");
    }
}
