CREATE TABLE preferences (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    password        TEXT NOT NULL,
    locale          TEXT NOT NULL DEFAULT 'en',
    global_shortcut TEXT NOT NULL DEFAULT 'Ctrl+Shift+P',
    auto_lock_minutes INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
