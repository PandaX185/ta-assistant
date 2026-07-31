import { useEffect, useState, useCallback } from "react";
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

interface Student {
  id: string;
  name: string;
  email: string | null;
  student_id: string | null;
}

interface Enrollment {
  id: string;
  student_id: string;
  semester_year_id: string;
  subject_id: string;
  student_name: string;
  student_code: string | null;
}

export default function Students() {
  const { t } = useTranslation();
  const {
    selectedSemesterYearId,
    selectedSubjectId,
    semesterYears,
    subjects,
  } = useFilterStore();

  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState("");

  // Dialog state
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");

  // Enroll dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollStudentId, setEnrollStudentId] = useState("");

  const loadStudents = useCallback(async () => {
    try {
      const data = await invoke<Student[]>("get_students");
      setStudents(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadEnrollments = useCallback(async () => {
    if (!selectedSemesterYearId || !selectedSubjectId) {
      setEnrollments([]);
      return;
    }
    try {
      const data = await invoke<Enrollment[]>("get_enrollments", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
      });
      setEnrollments(data);
    } catch (e) {
      console.error(e);
    }
  }, [selectedSemesterYearId, selectedSubjectId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setStudentId("");
    setEditId(null);
  };

  const openEdit = (s: Student) => {
    setEditId(s.id);
    setName(s.name);
    setEmail(s.email ?? "");
    setStudentId(s.student_id ?? "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name) return;
    try {
      if (editId) {
        await invoke("update_student", {
          id: editId,
          name,
          email: email || null,
          studentId: studentId || null,
        });
      } else {
        await invoke("create_student", {
          name,
          email: email || null,
          studentId: studentId || null,
        });
      }
      resetForm();
      setOpen(false);
      loadStudents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_student", { id });
      loadStudents();
      loadEnrollments();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEnroll = async () => {
    if (!enrollStudentId || !selectedSemesterYearId || !selectedSubjectId) return;
    try {
      await invoke("create_enrollment", {
        studentId: enrollStudentId,
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
      });
      setEnrollStudentId("");
      setEnrollOpen(false);
      loadEnrollments();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnenroll = async (enrollmentId: string) => {
    try {
      await invoke("delete_enrollment", { id: enrollmentId });
      loadEnrollments();
    } catch (e) {
      console.error(e);
    }
  };

  const enrolledIds = new Set(enrollments.map((e) => e.student_id));
  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.student_id ?? "").toLowerCase().includes(search.toLowerCase()),
  );
  const unenrolled = filtered.filter((s) => !enrolledIds.has(s.id));

  const selectedSemester = semesterYears.find(
    (sy) => sy.id === selectedSemesterYearId,
  );
  const selectedSubject = subjects.find(
    (s) => s.id === selectedSubjectId,
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("students.title")}</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">+ Add Student</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Student" : "New Student"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="s-name">Name</Label>
                <Input
                  id="s-name"
                  placeholder="Student name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-email">Email (optional)</Label>
                <Input
                  id="s-email"
                  type="email"
                  placeholder="student@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-id">Student ID (optional)</Label>
                <Input
                  id="s-id"
                  placeholder="e.g. 2024001"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                />
              </div>
              <Button onClick={handleSave} className="w-full">
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Input
        placeholder="Search students..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {/* Quick stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{students.length} total students</span>
        {selectedSemester && (
          <span>
            · {selectedSemester.year} {selectedSemester.semester}
          </span>
        )}
        {selectedSubject && <span>· {selectedSubject.name}</span>}
        {selectedSemesterYearId && selectedSubjectId && (
          <span>· {enrollments.length} enrolled</span>
        )}
      </div>

      {/* Enrolled students (requires filter) */}
      {selectedSemesterYearId && selectedSubjectId ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Enrolled — {selectedSubject?.name}
            </h2>
            <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Enroll Student
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enroll Student</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Student</Label>
                    <Select
                      value={enrollStudentId}
                      onValueChange={setEnrollStudentId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a student" />
                      </SelectTrigger>
                      <SelectContent>
                        {unenrolled.length === 0 && (
                          <SelectItem value="__none" disabled>
                            {search
                              ? "No matching students"
                              : "All students already enrolled"}
                          </SelectItem>
                        )}
                        {unenrolled.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                            {s.student_id ? ` (${s.student_id})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleEnroll}
                    disabled={!enrollStudentId}
                    className="w-full"
                  >
                    Enroll
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No students enrolled yet. Use "Enroll Student" above.
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium">ID</th>
                    <th className="text-right px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((enr) => (
                    <tr key={enr.id} className="border-t">
                      <td className="px-4 py-2">{enr.student_name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {enr.student_code ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleUnenroll(enr.id)}
                        >
                          Unenroll
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a semester/year and subject from the filter bar to manage
          enrollments.
        </p>
      )}

      {/* All students */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All Students</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Student ID</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr className="border-t">
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    {students.length === 0
                      ? "No students yet. Add your first student above."
                      : "No students match your search."}
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {s.email ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {s.student_id ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(s.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
