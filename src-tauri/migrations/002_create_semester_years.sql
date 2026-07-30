CREATE TABLE semester_years (
    id          TEXT PRIMARY KEY,
    year        INTEGER NOT NULL,
    semester    TEXT NOT NULL CHECK(semester IN ('Fall', 'Spring', 'Summer')),
    UNIQUE(year, semester)
);
