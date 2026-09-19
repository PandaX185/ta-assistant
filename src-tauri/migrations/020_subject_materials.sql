-- Materials become subject-scoped. subject_lectures are the Materials tab's
-- own groupings (no section FK); for every attendance lecture that actually
-- HAS materials we create a subject_lecture REUSING THE SAME ID, so on-disk
-- materials/<id>/ folders and stored_path values stay valid untouched.
-- Attendance lectures without materials are not copied; attendance itself is
-- untouched. Tables are rebuilt (015 pattern): create + insert + drop old,
-- run with FK off by run_pending.

CREATE TABLE subject_lectures (
    id          TEXT PRIMARY KEY NOT NULL,
    subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    date        TEXT,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_subject_lectures_subject ON subject_lectures(subject_id);

INSERT INTO subject_lectures (id, subject_id, title, date, created_at)
SELECT l.id,
       l.subject_id,
       COALESCE(l.title, l.date, 'Lecture'),
       l.date,
       CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM lectures l
WHERE EXISTS (SELECT 1 FROM lecture_notes n WHERE n.lecture_id = l.id)
   OR EXISTS (SELECT 1 FROM lecture_files f WHERE f.lecture_id = l.id)
   OR EXISTS (SELECT 1 FROM lecture_links k WHERE k.lecture_id = l.id);

CREATE TABLE material_notes (
    id          TEXT PRIMARY KEY NOT NULL,
    lecture_id  TEXT NOT NULL UNIQUE REFERENCES subject_lectures(id) ON DELETE CASCADE,
    content_md  TEXT NOT NULL DEFAULT '',
    updated_at  INTEGER NOT NULL
);
INSERT INTO material_notes (id, lecture_id, content_md, updated_at)
SELECT id, lecture_id, content_md, updated_at FROM lecture_notes;
DROP TABLE lecture_notes;

CREATE TABLE material_files (
    id          TEXT PRIMARY KEY NOT NULL,
    lecture_id  TEXT NOT NULL REFERENCES subject_lectures(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    file_size   INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
);
INSERT INTO material_files (id, lecture_id, file_name, stored_path, mime_type, file_size, created_at)
SELECT id, lecture_id, file_name, stored_path, mime_type, file_size, created_at FROM lecture_files;
DROP TABLE lecture_files;
CREATE INDEX idx_material_files_lecture ON material_files(lecture_id);

CREATE TABLE material_links (
    id          TEXT PRIMARY KEY NOT NULL,
    lecture_id  TEXT NOT NULL REFERENCES subject_lectures(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
INSERT INTO material_links (id, lecture_id, title, url, created_at)
SELECT id, lecture_id, title, url, created_at FROM lecture_links;
DROP TABLE lecture_links;
CREATE INDEX idx_material_links_lecture ON material_links(lecture_id);
