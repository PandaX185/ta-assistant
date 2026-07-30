CREATE TABLE quizzes (
    id              TEXT PRIMARY KEY,
    enrollment_id   TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    max_score       REAL NOT NULL,
    score           REAL,
    date            TEXT
);
