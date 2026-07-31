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

import { useFilterStore } from "@/stores/filter-store";

interface Lecture {
  id: string;
  subject_id: string;
  semester_year_id: string | null;
  date: string;
  title: string | null;
}

interface AttendanceRecord {
  id: string;
  lecture_id: string;
  enrollment_id: string;
  student_name: string;
  status: string;
}



export default function Attendance() {
  const { t } = useTranslation();
  const { selectedSemesterYearId, selectedSubjectId, subjects } =
    useFilterStore();

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [createDesc, setCreateDesc] = useState("");

  const loadLectures = useCallback(async () => {
    if (!selectedSemesterYearId || !selectedSubjectId) {
      setLectures([]);
      return;
    }
    try {
      const data = await invoke<Lecture[]>("get_lectures", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
      });
      setLectures(data);
    } catch (e) {
      console.error(e);
    }
  }, [selectedSemesterYearId, selectedSubjectId]);

  const loadAttendance = useCallback(
    async (lectureId: string) => {
      setLoading(true);
      try {
        const data = await invoke<AttendanceRecord[]>("get_attendance", {
          lectureId,
        });
        setAttendance(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadLectures();
  }, [loadLectures]);

  useEffect(() => {
    if (selectedLecture) {
      loadAttendance(selectedLecture.id);
    }
  }, [selectedLecture, loadAttendance]);

  const handleCreate = async () => {
    if (!selectedSemesterYearId || !selectedSubjectId || !createDate) return;
    try {
      await invoke("create_lecture", {
        subjectId: selectedSubjectId,
        semesterYearId: selectedSemesterYearId,
        date: createDate,
        title: createDesc || null,
      });
      setCreateOpen(false);
      setCreateDate(new Date().toISOString().split("T")[0]);
      setCreateDesc("");
      loadLectures();
    } catch (e) {
      console.error(e);
    }
  };



  const handleToggle = async (lectureId: string, enrollmentId: string, currentlyPresent: boolean) => {
    const status = currentlyPresent ? "absent" : "present";
    try {
      await invoke("mark_attendance", { lectureId, enrollmentId, status });
      setAttendance((prev) =>
        prev.map((a) =>
          a.enrollment_id === enrollmentId ? { ...a, status } : a,
        ),
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLecture = async (id: string) => {
    if (!window.confirm("Delete this lecture and all its attendance records?"))
      return;
    try {
      await invoke("delete_lecture", { id });
      if (selectedLecture?.id === id) {
        setSelectedLecture(null);
        setAttendance([]);
      }
      loadLectures();
    } catch (e) {
      console.error(e);
    }
  };

  const selectAndLoad = (lecture: Lecture) => {
    setSelectedLecture(lecture);
    loadAttendance(lecture.id).then(() => {
      // Auto-seed if empty
      loadLectures();
    });
  };

  // Auto-seed attendance when records are empty after loading
  useEffect(() => {
    if (
      selectedLecture &&
      attendance.length === 0 &&
      !loading &&
      selectedSemesterYearId &&
      selectedSubjectId
    ) {
      const seedAndReload = async () => {
        try {
          await invoke("seed_attendance", {
            lectureId: selectedLecture.id,
            semesterYearId: selectedSemesterYearId,
            subjectId: selectedSubjectId,
          });
          loadAttendance(selectedLecture.id);
        } catch (e) {
          console.error(e);
        }
      };
      seedAndReload();
    }
  }, [selectedLecture, attendance, loading, selectedSemesterYearId, selectedSubjectId, loadAttendance]);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  if (!selectedSemesterYearId || !selectedSubjectId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("attendance.title")}</h1>
        <p className="text-muted-foreground">{t("attendance.no_filter")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("attendance.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {selectedSubject?.name}
          </p>
        </div>

        <Dialog
          open={createOpen}
          onOpenChange={(v) => {
            setCreateOpen(v);
            if (!v) setCreateDesc("");
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">+ New Lecture</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Lecture</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="lec-date">Date</Label>
                <Input
                  id="lec-date"
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lec-desc">
                  Topic (optional)
                </Label>
                <Input
                  id="lec-desc"
                  placeholder="e.g. Chapter 3: Linked Lists"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} className="w-full">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lectures list */}
        <div className="md:col-span-1 border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-sm font-medium border-b">
            Lectures ({lectures.length})
          </div>
          <div className="divide-y max-h-[60vh] overflow-y-auto">
            {lectures.length === 0 && (
              <p className="text-xs text-muted-foreground p-4 text-center">
                No lectures yet.
              </p>
            )}
            {lectures.map((lec) => (
              <div
                key={lec.id}
                className={`px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${
                  selectedLecture?.id === lec.id ? "bg-muted/50" : ""
                }`}
                onClick={() => selectAndLoad(lec)}
              >
                <div className="text-sm font-medium">{lec.date}</div>
                {lec.title && (
                  <div className="text-xs text-muted-foreground truncate">
                    {lec.title}
                  </div>
                )}
                <button
                  className="text-[10px] text-destructive mt-1 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteLecture(lec.id);
                  }}
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance roster — simple checkbox list */}
        <div className="md:col-span-2 border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-sm font-medium border-b">
            <span>
              {selectedLecture
                ? `${selectedLecture.date} — Students`
                : "Select a lecture"}
            </span>
          </div>

          {!selectedLecture ? (
            <p className="text-xs text-muted-foreground p-6 text-center">
              Select a lecture from the left.
            </p>
          ) : loading ? (
            <p className="text-xs text-muted-foreground p-6 text-center animate-pulse">
              Loading...
            </p>
          ) : attendance.length === 0 ? (
            <p className="text-xs text-muted-foreground p-6 text-center animate-pulse">
              Loading roster...
            </p>
          ) : (
            <div className="divide-y">
              {attendance.map((record) => {
                const present = record.status === "present";
                return (
                  <label
                    key={record.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={present}
                      onChange={() =>
                        handleToggle(
                          selectedLecture.id,
                          record.enrollment_id,
                          present,
                        )
                      }
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span
                      className={`text-sm ${
                        present ? "font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {record.student_name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
