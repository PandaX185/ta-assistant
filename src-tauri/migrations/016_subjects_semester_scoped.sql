-- Subjects become semester-scoped: a subject row is an offering for exactly
-- one semester/year (the app already keys sections, enrollments, lectures and
-- grades on the (subject_id, semester_year_id) pair — subjects being global was
-- the odd one out).
--
-- Existing global subjects are backfilled:
--   1. to the semester of their most recent section
--   2. else to the semester of their most recent enrollment/lecture
--   3. else to the newest semester year
--   4. if no semesters exist at all, they stay NULL (invisible — the filter
--      chain always requires a semester, so nothing can reference them)

ALTER TABLE subjects ADD COLUMN semester_year_id TEXT
    REFERENCES semester_years(id) ON DELETE CASCADE;

UPDATE subjects
SET semester_year_id = (
    SELECT s.semester_year_id
    FROM sections s
    WHERE s.subject_id = subjects.id
    ORDER BY (
        SELECT sy.year * 10 + CASE sy.semester
            WHEN 'Fall' THEN 3 WHEN 'Summer' THEN 2 ELSE 1 END
        FROM semester_years sy WHERE sy.id = s.semester_year_id
    ) DESC
    LIMIT 1
)
WHERE semester_year_id IS NULL
  AND EXISTS (SELECT 1 FROM sections s WHERE s.subject_id = subjects.id);

UPDATE subjects
SET semester_year_id = (
    SELECT e.semester_year_id
    FROM enrollments e
    WHERE e.subject_id = subjects.id
    ORDER BY (
        SELECT sy.year * 10 + CASE sy.semester
            WHEN 'Fall' THEN 3 WHEN 'Summer' THEN 2 ELSE 1 END
        FROM semester_years sy WHERE sy.id = e.semester_year_id
    ) DESC
    LIMIT 1
)
WHERE semester_year_id IS NULL
  AND EXISTS (SELECT 1 FROM enrollments e WHERE e.subject_id = subjects.id);

UPDATE subjects
SET semester_year_id = (
    SELECT l.semester_year_id
    FROM lectures l
    WHERE l.subject_id = subjects.id
    ORDER BY (
        SELECT sy.year * 10 + CASE sy.semester
            WHEN 'Fall' THEN 3 WHEN 'Summer' THEN 2 ELSE 1 END
        FROM semester_years sy WHERE sy.id = l.semester_year_id
    ) DESC
    LIMIT 1
)
WHERE semester_year_id IS NULL
  AND EXISTS (SELECT 1 FROM lectures l WHERE l.subject_id = subjects.id);

UPDATE subjects
SET semester_year_id = (
    SELECT id FROM semester_years
    ORDER BY year DESC, CASE semester
        WHEN 'Fall' THEN 3 WHEN 'Summer' THEN 2 ELSE 1 END DESC
    LIMIT 1
)
WHERE semester_year_id IS NULL
  AND EXISTS (SELECT 1 FROM semester_years);
