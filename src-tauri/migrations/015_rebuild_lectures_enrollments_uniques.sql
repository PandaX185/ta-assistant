-- Rebuild lectures: the legacy UNIQUE(subject_id, semester_year_id, date) would
-- block the core sections feature — two groups meeting on the same day. The new
-- uniqueness scope is per section: UNIQUE(section_id, date).
-- (section_id is nullable for legacy rows; SQLite treats NULLs as distinct in
-- unique indexes, so orphaned NULL rows can never collide.)
CREATE TABLE lectures_new (
    id                TEXT PRIMARY KEY,
    subject_id        TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    semester_year_id  TEXT NOT NULL REFERENCES semester_years(id) ON DELETE CASCADE,
    section_id        TEXT REFERENCES sections(id) ON DELETE CASCADE,
    title             TEXT,
    date              TEXT NOT NULL,
    UNIQUE(section_id, date)
);

INSERT INTO lectures_new (id, subject_id, semester_year_id, section_id, title, date)
    SELECT id, subject_id, semester_year_id, section_id, title, date FROM lectures;

DROP TABLE lectures;
ALTER TABLE lectures_new RENAME TO lectures;

-- Rebuild enrollments: include section_id in the uniqueness scope so the same
-- student can be enrolled in two sections of the same subject+semester
-- (one student row, N enrollment rows).
CREATE TABLE enrollments_new (
    id                TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    semester_year_id  TEXT NOT NULL REFERENCES semester_years(id) ON DELETE CASCADE,
    subject_id        TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    section_id        TEXT REFERENCES sections(id) ON DELETE CASCADE,
    UNIQUE(student_id, semester_year_id, subject_id, section_id)
);

INSERT INTO enrollments_new (id, student_id, semester_year_id, subject_id, section_id)
    SELECT id, student_id, semester_year_id, subject_id, section_id FROM enrollments;

DROP TABLE enrollments;
ALTER TABLE enrollments_new RENAME TO enrollments;
