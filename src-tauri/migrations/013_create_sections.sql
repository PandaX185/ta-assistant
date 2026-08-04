CREATE TABLE sections (
    id               TEXT PRIMARY KEY,
    subject_id       TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    semester_year_id TEXT NOT NULL REFERENCES semester_years(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    color            TEXT,
    UNIQUE(subject_id, semester_year_id, name)
);
