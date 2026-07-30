CREATE TABLE settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('global_shortcut', 'Ctrl+Shift+P');
INSERT OR IGNORE INTO settings (key, value) VALUES ('locale', 'en');
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_lock_minutes', '0');
