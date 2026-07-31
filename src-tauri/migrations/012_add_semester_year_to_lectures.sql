ALTER TABLE lectures ADD COLUMN semester_year_id TEXT REFERENCES semester_years(id) ON DELETE CASCADE;
