-- Per-lecture teaching material: the TA's own notes, file attachments, and
-- reference links. Strictly additive; ON DELETE CASCADE keeps material rows
-- from ever blocking a lecture delete.
CREATE TABLE lecture_notes (
    id          TEXT PRIMARY KEY NOT NULL,
    lecture_id  TEXT NOT NULL UNIQUE REFERENCES lectures(id) ON DELETE CASCADE,
    content_md  TEXT NOT NULL DEFAULT '',
    updated_at  INTEGER NOT NULL
);

CREATE TABLE lecture_files (
    id          TEXT PRIMARY KEY NOT NULL,
    lecture_id  TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    file_size   INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE TABLE lecture_links (
    id          TEXT PRIMARY KEY NOT NULL,
    lecture_id  TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE INDEX idx_lecture_files_lecture ON lecture_files(lecture_id);
CREATE INDEX idx_lecture_links_lecture  ON lecture_links(lecture_id);