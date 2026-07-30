CREATE TABLE attendance (
    id              TEXT PRIMARY KEY,
    lecture_id      TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    enrollment_id   TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
    UNIQUE(lecture_id, enrollment_id)
);
