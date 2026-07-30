CREATE TABLE enrollments (
    id                TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    semester_year_id  TEXT NOT NULL REFERENCES semester_years(id) ON DELETE CASCADE,
    subject_id        TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE(student_id, semester_year_id, subject_id)
);
