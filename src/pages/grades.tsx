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
import { FileText, ClipboardPenLine } from "lucide-react";
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
  const {
    selectedSemesterYearId,
    selectedSubjectId,
    selectedSectionId,
    sections,
    subjects,
  } = useFilterStore();

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

  // Tab view — column id
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  // Inline edit state — which cell is being edited
  const [editing, setEditing] = useState<{
    type: "quiz" | "assignment";
    id: string;
    maxScore: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const loadGrades = useCallback(async () => {
    if (!selectedSemesterYearId || !selectedSubjectId || !selectedSectionId) {
      setSheet(null);
      return;
    }
    setLoading(true);
    try {
      const data = await invoke<GradeSheet>("get_grades", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
      });
      setSheet(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedSemesterYearId, selectedSubjectId, selectedSectionId]);

  useEffect(() => {
    loadGrades();
  }, [loadGrades]);

  const handleCreate = async () => {
    if (
      !createName ||
      !createMax ||
      !selectedSemesterYearId ||
      !selectedSubjectId ||
      !selectedSectionId
    )
      return;
    try {
      if (createType === "quiz") {
        await invoke("create_quiz_bulk", {
          semesterYearId: selectedSemesterYearId,
          subjectId: selectedSubjectId,
          sectionId: selectedSectionId,
          name: createName,
          maxScore: parseFloat(createMax),
          date: createDate,
        });
      } else {
        await invoke("create_assignment_bulk", {
          semesterYearId: selectedSemesterYearId,
          subjectId: selectedSubjectId,
          sectionId: selectedSectionId,
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
      if (parsed !== null && parsed > editing.maxScore) return;
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
        sectionId: selectedSectionId,
        name: colName,
        date: colDate,
      });
      loadGrades();
    } catch (e) {
      console.error(e);
    }
  };

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  if (!selectedSemesterYearId || !selectedSubjectId || !selectedSectionId) {
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
        <p className="text-sm text-muted-foreground">
          {selectedSubject?.name}
          {selectedSection && ` · ${selectedSection.name}`}
        </p>
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
            <p className="text-sm text-muted-foreground">
              {selectedSubject?.name}
              {selectedSection && ` · ${selectedSection.name}`}
            </p>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("grades.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {selectedSubject?.name}
            {selectedSection && ` · ${selectedSection.name}`} ·{" "}
            {sheet.students.length} enrolled
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

      {/* Tab bar — one tab per graded item */}
      {(() => {
        const allColumns = [
          ...sheet.quizzes.map((q) => ({ ...q, type: "quiz" as const })),
          ...sheet.assignments.map((a) => ({ ...a, type: "assignment" as const })),
        ];
        if (allColumns.length === 0) {
          return (
            <p className="text-sm text-muted-foreground">
              No graded items yet. Click &ldquo;+ New Graded Item&rdquo; above.
            </p>
          );
        }
        if (!activeColumnId || !allColumns.some((c) => c.id === activeColumnId)) {
          setTimeout(() => setActiveColumnId(allColumns[0].id));
        }
        return (
          <div className="flex gap-1 border-b overflow-x-auto">
            {allColumns.map((col) => (
              <button
                key={col.id}
                className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
                  activeColumnId === col.id
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveColumnId(col.id)}
              >
                {col.type === "quiz" ? <FileText className="w-4 h-4 inline" /> : <ClipboardPenLine className="w-4 h-4 inline" />} {col.name}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Active column table — simple Student | Score */}
      {(() => {
        const allColumns = [
          ...sheet.quizzes.map((q, i) => ({ ...q, type: "quiz" as const, index: i })),
          ...sheet.assignments.map((a, i) => ({ ...a, type: "assignment" as const, index: i })),
        ];
        const active = allColumns.find((c) => c.id === activeColumnId);
        if (!active) return null;

        const getScore = active.type === "quiz"
          ? (s: GradeStudent) => ({ score: s.quiz_scores[active.index], id: s.quiz_ids[active.index] })
          : (s: GradeStudent) => ({ score: s.assignment_scores[active.index], id: s.assignment_ids[active.index] });

        return (
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
              <span className="font-semibold">{active.name} · / {active.max_score}</span>
              <button
                className="text-destructive hover:underline"
                onClick={() => handleDeleteColumn(active.type, active.name, active.date)}
              >
                delete this item
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2">Student</th>
                  <th className="text-center px-3 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {sheet.students.map((student) => {
                  const { score, id } = getScore(student);
                  return (
                    <tr key={student.enrollment_id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium text-xs">
                        {student.student_name}
                      </td>
                      <td className="text-center px-3 py-2">
                        {id && editing?.id === id ? (
                          <Input
                            type="number"
                            step="0.5"
                            max={editing.maxScore}
                            className="w-20 h-7 text-xs text-center inline-block"
                            value={editValue}
                            onChange={(e) => {
                              const val = e.target.value;
                              const num = parseFloat(val);
                              if (editing && !isNaN(num) && num > editing.maxScore) {
                                setEditValue(editing.maxScore.toString());
                              } else {
                                setEditValue(val);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveScore();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            onBlur={() => {
                              if (editing) handleSaveScore();
                            }}
                            autoFocus
                          />
                        ) : id ? (
                          <span
                            className="cursor-pointer hover:bg-accent rounded px-2 py-0.5 inline-block min-w-[2.5rem] text-xs"
                            onClick={() => {
                              setEditing({ type: active.type, id, maxScore: active.max_score });
                              setEditValue(score?.toString() ?? "");
                            }}
                          >
                            {score !== null && score !== undefined ? score : "—"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
