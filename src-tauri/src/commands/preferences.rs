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
    pub guide_seen: bool,
}

#[tauri::command]
pub fn get_preferences(app: AppHandle) -> Result<Option<Preferences>, String> {
    let conn = crate::db::open_db(&app)?;
    get_preferences_impl(&conn)
}

pub(crate) fn get_preferences_impl(conn: &Connection) -> Result<Option<Preferences>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, email, locale, theme, global_shortcut, auto_lock_minutes, created_at, guide_seen
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
            guide_seen: row.get::<_, i64>(7)? != 0,
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
    save_preferences_impl(
        &conn,
        name,
        email,
        password,
        locale,
        theme,
        global_shortcut.clone(),
    )?;
    // The OS hotkey was registered at startup with a placeholder value (the
    // wizard is the only writer); re-register so the chosen shortcut takes
    // effect immediately. Best effort — a persisted-but-unparseable value
    // falls back to the default inside register_search_shortcut.
    #[cfg(desktop)]
    crate::register_search_shortcut(&app, &global_shortcut);
    Ok(())
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
    let password_hash = hash_password(&password)?;

    conn.execute(
        "INSERT INTO preferences (id, name, email, password, locale, theme, global_shortcut)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![name, email, password_hash, locale, theme, global_shortcut],
    )
    .map_err(|e| format!("Insert failed: {e}"))?;

    Ok(())
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Password hashing failed: {e}"))
        .map(|hash| hash.to_string())
}

/// Minimum accepted password length (matches the onboarding wizard rule).
const MIN_PASSWORD_LEN: usize = 6;

#[tauri::command]
pub fn update_profile(app: AppHandle, name: String, email: String) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    update_profile_impl(&conn, name, email)
}

fn update_profile_impl(conn: &Connection, name: String, email: String) -> Result<(), String> {
    let name = name.trim();
    let email = email.trim();
    if name.is_empty() {
        return Err("Name cannot be empty".into());
    }
    if email.is_empty() {
        return Err("Email cannot be empty".into());
    }
    conn.execute(
        "UPDATE preferences SET name = ?1, email = ?2 WHERE id = 1",
        rusqlite::params![name, email],
    )
    .map_err(|e| format!("Update profile failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_password(
    app: AppHandle,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    update_password_impl(&conn, current_password, new_password)
}

fn update_password_impl(
    conn: &Connection,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    if !verify_password_impl(conn, current_password)? {
        return Err("Current password is incorrect".into());
    }
    if new_password.len() < MIN_PASSWORD_LEN {
        return Err("New password must be at least 6 characters".into());
    }
    let password_hash = hash_password(&new_password)?;
    conn.execute(
        "UPDATE preferences SET password = ?1 WHERE id = 1",
        rusqlite::params![password_hash],
    )
    .map_err(|e| format!("Update password failed: {e}"))?;
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

#[tauri::command]
pub fn set_guide_seen(app: AppHandle, seen: bool) -> Result<(), String> {
    let conn = crate::db::open_db(&app)?;
    set_guide_seen_impl(&conn, seen)
}

fn set_guide_seen_impl(conn: &Connection, seen: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE preferences SET guide_seen = ?1 WHERE id = 1",
        rusqlite::params![seen],
    )
    .map_err(|e| format!("Update guide_seen failed: {e}"))?;
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

    #[test]
    fn guide_seen_defaults_to_false() {
        let conn = saved_conn();
        assert!(!get_preferences_impl(&conn).unwrap().unwrap().guide_seen);
    }

    #[test]
    fn set_guide_seen_persists() {
        let conn = saved_conn();
        set_guide_seen_impl(&conn, true).unwrap();
        assert!(get_preferences_impl(&conn).unwrap().unwrap().guide_seen);
        set_guide_seen_impl(&conn, false).unwrap();
        assert!(!get_preferences_impl(&conn).unwrap().unwrap().guide_seen);
    }

    #[test]
    fn update_profile_persists_trimmed_values() {
        let conn = saved_conn();
        update_profile_impl(&conn, "  Sara Omar  ".into(), "  sara@uni.edu ".into()).unwrap();
        let prefs = get_preferences_impl(&conn).unwrap().unwrap();
        assert_eq!(prefs.name, "Sara Omar");
        assert_eq!(prefs.email, "sara@uni.edu");
        // Password hash untouched.
        assert!(verify_password_impl(&conn, "secret123".into()).unwrap());
    }

    #[test]
    fn update_profile_rejects_blanks() {
        let conn = saved_conn();
        assert!(update_profile_impl(&conn, "   ".into(), "a@b.com".into()).is_err());
        assert!(update_profile_impl(&conn, "Sara".into(), "   ".into()).is_err());
        let prefs = get_preferences_impl(&conn).unwrap().unwrap();
        assert_eq!(prefs.name, "Abdullah");
        assert_eq!(prefs.email, "abdullah@example.com");
    }

    #[test]
    fn update_password_round_trip() {
        let conn = saved_conn();
        update_password_impl(&conn, "secret123".into(), "newpass456".into()).unwrap();
        assert!(verify_password_impl(&conn, "newpass456".into()).unwrap());
        assert!(!verify_password_impl(&conn, "secret123".into()).unwrap());
    }

    #[test]
    fn update_password_rejects_wrong_current_and_short_new() {
        let conn = saved_conn();
        let err = update_password_impl(&conn, "nope".into(), "newpass456".into()).unwrap_err();
        assert!(err.contains("incorrect"), "{err}");
        let err = update_password_impl(&conn, "secret123".into(), "short".into()).unwrap_err();
        assert!(err.contains("at least 6"), "{err}");
        // Original password still works.
        assert!(verify_password_impl(&conn, "secret123".into()).unwrap());
    }
}
