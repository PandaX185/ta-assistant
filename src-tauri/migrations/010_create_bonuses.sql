CREATE TABLE bonuses (
    id              TEXT PRIMARY KEY,
    enrollment_id   TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    value           REAL NOT NULL,
    reason          TEXT NOT NULL,
    date            TEXT NOT NULL DEFAULT (datetime('now'))
);
