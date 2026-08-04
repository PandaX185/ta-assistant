import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilterStore } from "@/stores/filter-store";

interface DashboardStats {
  enrolled_students: number;
  quiz_count: number;
  assignment_count: number;
  lecture_count: number;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const {
    selectedSemesterYearId,
    selectedSubjectId,
    selectedSectionId,
    sections,
    subjects,
    semesterYears,
  } = useFilterStore();

  const [stats, setStats] = useState<DashboardStats | null>(null);

  const loadStats = useCallback(async () => {
    if (!selectedSemesterYearId || !selectedSubjectId || !selectedSectionId) {
      setStats(null);
      return;
    }
    try {
      // Get all enrollments
      const enrollments = await invoke<any[]>("get_enrollments", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
      });

      // Get grades
      const grades = await invoke<any>("get_grades", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
      });

      // Get lectures
      const lectures = await invoke<any[]>("get_lectures", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
      });

      setStats({
        enrolled_students: enrollments.length,
        quiz_count: grades?.quizzes?.length ?? 0,
        assignment_count: grades?.assignments?.length ?? 0,
        lecture_count: lectures.length,
      });
    } catch (e) {
      console.error(e);
    }
  }, [selectedSemesterYearId, selectedSubjectId, selectedSectionId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const selectedSemester = semesterYears.find(
    (sy) => sy.id === selectedSemesterYearId,
  );

  if (!selectedSemesterYearId || !selectedSubjectId || !selectedSectionId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              {t("dashboard.description")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {selectedSubject?.name}
          {selectedSection && ` · ${selectedSection.name}`}
          {selectedSemester && ` · ${selectedSemester.semester} ${selectedSemester.year}`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats?.enrolled_students ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quizzes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.quiz_count ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats?.assignment_count ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lectures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats?.lecture_count ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {stats && stats.enrolled_students === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No students enrolled yet. Go to{" "}
              <span className="font-medium">Students</span> to enroll them.
            </p>
          </CardContent>
        </Card>
      )}

      {stats && stats.enrolled_students > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>{stats.enrolled_students} students enrolled</p>
            {stats.quiz_count === 0 && stats.assignment_count === 0 && (
              <p>→ Go to <span className="font-medium">Grades</span> to create quizzes and assignments</p>
            )}
            {stats.lecture_count === 0 && (
              <p>→ Go to <span className="font-medium">Attendance</span> to create lectures</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
