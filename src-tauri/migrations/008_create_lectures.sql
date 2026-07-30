CREATE TABLE lectures (
    id                TEXT PRIMARY KEY,
    subject_id        TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    semester_year_id  TEXT NOT NULL REFERENCES semester_years(id) ON DELETE CASCADE,
    title             TEXT,
    date              TEXT NOT NULL,
    UNIQUE(subject_id, semester_year_id, date)
);
