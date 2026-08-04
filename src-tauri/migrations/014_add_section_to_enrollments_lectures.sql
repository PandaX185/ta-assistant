ALTER TABLE enrollments ADD COLUMN section_id TEXT REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE lectures ADD COLUMN section_id TEXT REFERENCES sections(id) ON DELETE CASCADE;

-- Backfill: one default "Group A" section per (subject, semester) that has data.
INSERT INTO sections (id, subject_id, semester_year_id, name, color)
SELECT 'sec_' || lower(hex(randomblob(8))), subject_id, semester_year_id, 'Group A', NULL
FROM (SELECT DISTINCT subject_id, semester_year_id FROM enrollments);

-- Assign every legacy enrollment/lecture to its subject's default section.
UPDATE enrollments
SET section_id = (
    SELECT s.id FROM sections s
    WHERE s.subject_id = enrollments.subject_id
      AND s.semester_year_id = enrollments.semester_year_id
      AND s.name = 'Group A'
)
WHERE section_id IS NULL;

UPDATE lectures
SET section_id = (
    SELECT s.id FROM sections s
    WHERE s.subject_id = lectures.subject_id
      AND s.semester_year_id = lectures.semester_year_id
      AND s.name = 'Group A'
)
WHERE section_id IS NULL;
