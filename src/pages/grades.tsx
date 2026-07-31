import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilterStore } from "@/stores/filter-store";

interface GradeColumn {
  id: string;
  name: string;
  max_score: number;
  date: string;
}

interface GradeStudent {
  enrollment_id: string;
  student_name: string;
  student_code: string | null;
  quiz_scores: (number | null)[];
  quiz_ids: (string | null)[];
  assignment_scores: (number | null)[];
  assignment_ids: (string | null)[];
}

interface GradeSheet {
  students: GradeStudent[];
  quizzes: GradeColumn[];
  assignments: GradeColumn[];
}

export default function Grades() {
  const { t } = useTranslation();
  const { selectedSemesterYearId, selectedSubjectId, subjects } =
    useFilterStore();

  const [sheet, setSheet] = useState<GradeSheet | null>(null);
  const [loading, setLoading] = useState(false);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"quiz" | "assignment">("quiz");
  const [createName, setCreateName] = useState("");
  const [createMax, setCreateMax] = useState("");
  const [createDate, setCreateDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  // Inline edit state — which cell is being edited
  const [editing, setEditing] = useState<{
    type: "quiz" | "assignment";
    id: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const loadGrades = useCallback(async () => {
    if (!selectedSemesterYearId || !selectedSubjectId) {
      setSheet(null);
      return;
    }
    setLoading(true);
    try {
      const data = await invoke<GradeSheet>("get_grades", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
      });
      setSheet(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedSemesterYearId, selectedSubjectId]);

  useEffect(() => {
    loadGrades();
  }, [loadGrades]);

  const handleCreate = async () => {
    if (!createName || !createMax || !selectedSemesterYearId || !selectedSubjectId)
      return;
    try {
      if (createType === "quiz") {
        await invoke("create_quiz_bulk", {
          semesterYearId: selectedSemesterYearId,
          subjectId: selectedSubjectId,
          name: createName,
          maxScore: parseFloat(createMax),
          date: createDate,
        });
      } else {
        await invoke("create_assignment_bulk", {
          semesterYearId: selectedSemesterYearId,
          subjectId: selectedSubjectId,
          name: createName,
          maxScore: parseFloat(createMax),
          date: createDate,
        });
      }
      setCreateOpen(false);
      setCreateName("");
      setCreateMax("");
      loadGrades();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveScore = async () => {
    if (!editing) return;
    try {
      const parsed = editValue === "" ? null : parseFloat(editValue);
      if (editing.type === "quiz") {
        await invoke("update_quiz_score", { id: editing.id, score: parsed });
      } else {
        await invoke("update_assignment_score", { id: editing.id, score: parsed });
      }
      setEditing(null);
      loadGrades();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteColumn = async (type: "quiz" | "assignment", colName: string, colDate: string) => {
    if (!window.confirm(`Delete "${colName}" for all students?`)) return;
    try {
      await invoke(type === "quiz" ? "delete_quiz_column" : "delete_assignment_column", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
        name: colName,
        date: colDate,
      });
      loadGrades();
    } catch (e) {
      console.error(e);
    }
  };

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  if (!selectedSemesterYearId || !selectedSubjectId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("grades.title")}</h1>
        <p className="text-muted-foreground">{t("grades.no_filter")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("grades.title")}</h1>
        <p className="text-sm text-muted-foreground">{selectedSubject?.name}</p>
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!sheet || sheet.students.length === 0) {
    return (
      <div className="space-y-6 max-w-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("grades.title")}</h1>
            <p className="text-sm text-muted-foreground">{selectedSubject?.name}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          No students enrolled yet. Go to Students to enroll them first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("grades.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {selectedSubject?.name} · {sheet.students.length} enrolled
          </p>
        </div>

        <Dialog
          open={createOpen}
          onOpenChange={(v) => {
            setCreateOpen(v);
            if (!v) { setCreateName(""); setCreateMax(""); }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">+ New Graded Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Graded Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={createType}
                  onValueChange={(v) => setCreateType(v as "quiz" | "assignment")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quiz">Quiz</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. Quiz 1"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Score</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="20"
                  value={createMax}
                  onChange={(e) => setCreateMax(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} className="w-full">
                Create for all students
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-8">
        {/* Quizzes */}
        {sheet.quizzes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Quizzes</h2>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 whitespace-nowrap">Student</th>
                    {sheet.quizzes.map((q) => (
                      <th key={q.id} className="text-center px-3 py-2 whitespace-nowrap group">
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-medium">{q.name}</span>
                          <span className="text-[10px] text-muted-foreground">/ {q.max_score}</span>
                          <button
                            className="text-[10px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteColumn("quiz", q.name, q.date)}
                          >
                            delete
                          </button>
                        </div>
                      </th>
                    ))}
                    <th className="text-center px-3 py-2 text-xs text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.students.map((student) => {
                    const quizTotal = student.quiz_scores.reduce<number>((s, v) => s + (v ?? 0), 0);
                    const quizMax = sheet.quizzes.reduce((s, q) => s + q.max_score, 0);
                    return (
                      <tr key={student.enrollment_id} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-xs">
                          {student.student_name}
                        </td>
                        {student.quiz_ids.map((id, qi) => (
                          <td key={qi} className="text-center px-2 py-2">
                            {editing?.type === "quiz" && editing.id === id ? (
                              <Input
                                type="number"
                                step="0.5"
                                className="w-16 h-7 text-xs text-center inline-block"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveScore();
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                onBlur={() => {
                                  // Save on blur too
                                  if (editing) handleSaveScore();
                                }}
                                autoFocus
                              />
                            ) : id ? (
                              <span
                                className="cursor-pointer hover:bg-accent rounded px-1.5 py-0.5 inline-block min-w-[2rem] text-xs"
                                onClick={() => {
                                  const score = student.quiz_scores[qi];
                                  setEditing({ type: "quiz", id });
                                  setEditValue(score?.toString() ?? "");
                                }}
                              >
                                {student.quiz_scores[qi] !== null && student.quiz_scores[qi] !== undefined
                                  ? student.quiz_scores[qi]
                                  : "—"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        ))}
                        <td className="text-center px-3 py-2 font-semibold text-xs">
                          {quizTotal}/{quizMax}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Assignments */}
        {sheet.assignments.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Assignments</h2>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 whitespace-nowrap">Student</th>
                    {sheet.assignments.map((a) => (
                      <th key={a.id} className="text-center px-3 py-2 whitespace-nowrap group">
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-medium">{a.name}</span>
                          <span className="text-[10px] text-muted-foreground">/ {a.max_score}</span>
                          <button
                            className="text-[10px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteColumn("assignment", a.name, a.date)}
                          >
                            delete
                          </button>
                        </div>
                      </th>
                    ))}
                    <th className="text-center px-3 py-2 text-xs text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.students.map((student) => {
                    const asgnTotal = student.assignment_scores.reduce<number>((s, v) => s + (v ?? 0), 0);
                    const asgnMax = sheet.assignments.reduce((s, a) => s + a.max_score, 0);
                    return (
                      <tr key={student.enrollment_id} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-xs">
                          {student.student_name}
                        </td>
                        {student.assignment_ids.map((id, ai) => (
                          <td key={ai} className="text-center px-2 py-2">
                            {editing?.type === "assignment" && editing.id === id ? (
                              <Input
                                type="number"
                                step="0.5"
                                className="w-16 h-7 text-xs text-center inline-block"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveScore();
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                onBlur={() => handleSaveScore()}
                                autoFocus
                              />
                            ) : id ? (
                              <span
                                className="cursor-pointer hover:bg-accent rounded px-1.5 py-0.5 inline-block min-w-[2rem] text-xs"
                                onClick={() => {
                                  const score = student.assignment_scores[ai];
                                  setEditing({ type: "assignment", id });
                                  setEditValue(score?.toString() ?? "");
                                }}
                              >
                                {student.assignment_scores[ai] !== null && student.assignment_scores[ai] !== undefined
                                  ? student.assignment_scores[ai]
                                  : "—"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        ))}
                        <td className="text-center px-3 py-2 font-semibold text-xs">
                          {asgnTotal}/{asgnMax}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {sheet.quizzes.length === 0 && sheet.assignments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No graded items yet. Click "+ New Graded Item" above.
          </p>
        )}

        {/* Grand totals table */}
        {(sheet.quizzes.length > 0 || sheet.assignments.length > 0) && (
          <section className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs">Student</th>
                  <th className="text-center px-3 py-2 text-xs">Quizzes</th>
                  <th className="text-center px-3 py-2 text-xs">Assignments</th>
                  <th className="text-center px-3 py-2 text-xs font-bold">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {sheet.students.map((student) => {
                  const qTotal = student.quiz_scores.reduce<number>((s, v) => s + (v ?? 0), 0);
                  const aTotal = student.assignment_scores.reduce<number>((s, v) => s + (v ?? 0), 0);
                  const qMax = sheet.quizzes.reduce((s, q) => s + q.max_score, 0);
                  const aMax = sheet.assignments.reduce((s, a) => s + a.max_score, 0);
                  return (
                    <tr key={student.enrollment_id} className="border-t">
                      <td className="px-3 py-2 text-xs font-medium">{student.student_name}</td>
                      <td className="text-center px-3 py-2 text-xs">{qTotal}/{qMax}</td>
                      <td className="text-center px-3 py-2 text-xs">{aTotal}/{aMax}</td>
                      <td className="text-center px-3 py-2 text-xs font-bold">
                        {qTotal + aTotal}/{qMax + aMax}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
