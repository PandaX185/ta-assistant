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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, ClipboardList } from "lucide-react";
import { useFilterStore } from "@/stores/filter-store";
import { StudentDetailDialog } from "@/components/students/student-detail-dialog";

interface StudentEnrollment {
  id: string;
  student_id: string;
  semester_year_id: string;
  subject_id: string;
  student_name: string;
  student_code: string | null;
}

interface StudentMatch {
  id: string;
  name: string;
  email: string | null;
  student_id: string | null;
}

export default function Students() {
  const { t } = useTranslation();
  const {
    selectedSemesterYearId,
    selectedSubjectId,
    selectedSectionId,
    sections,
    subjects,
    pendingDetailEnrollmentId,
    setPendingDetailEnrollmentId,
  } = useFilterStore();

  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [search, setSearch] = useState("");

  // Add/Edit dialog
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  // find-or-create matches shown before creating a new student
  const [matches, setMatches] = useState<StudentMatch[]>([]);

  // Detail dialog
  const [detailEnrollmentId, setDetailEnrollmentId] = useState<string | null>(null);

  // Pick up pending detail from spotlight search
  useEffect(() => {
    if (pendingDetailEnrollmentId) {
      setDetailEnrollmentId(pendingDetailEnrollmentId);
      setPendingDetailEnrollmentId(null);
    }
  }, [pendingDetailEnrollmentId, setPendingDetailEnrollmentId]);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ studentId: string; name: string } | null>(null);

  const loadEnrollments = useCallback(async () => {
    if (!selectedSemesterYearId || !selectedSubjectId || !selectedSectionId) {
      setEnrollments([]);
      return;
    }
    try {
      const data = await invoke<StudentEnrollment[]>("get_enrollments", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
      });
      setEnrollments(data);
    } catch (e) {
      console.error(e);
    }
  }, [selectedSemesterYearId, selectedSubjectId, selectedSectionId]);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setStudentId("");
    setEditId(null);
    setMatches([]);
  };

  const openEdit = (enr: StudentEnrollment) => {
    setEditId(enr.student_id);
    setName(enr.student_name);
    setStudentId(enr.student_code ?? "");
    setMatches([]);
    setOpen(true);
  };

  const createNewStudent = async () => {
    const newStudentId = await invoke<string>("create_student", {
      name,
      email: email || null,
      studentId: studentId || null,
    });
    if (selectedSemesterYearId && selectedSubjectId && selectedSectionId) {
      await invoke("create_enrollment", {
        studentId: newStudentId,
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
      });
    }
    setMatches([]);
    resetForm();
    setOpen(false);
    loadEnrollments();
  };

  const useExistingStudent = async (existingId: string) => {
    try {
      if (selectedSemesterYearId && selectedSubjectId && selectedSectionId) {
        await invoke("create_enrollment", {
          studentId: existingId,
          semesterYearId: selectedSemesterYearId,
          subjectId: selectedSubjectId,
          sectionId: selectedSectionId,
        });
      }
      setMatches([]);
      resetForm();
      setOpen(false);
      loadEnrollments();
    } catch (e) {
      console.error(e);
    }
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
        resetForm();
        setOpen(false);
        loadEnrollments();
        return;
      }
      // find-or-create: search by name (and ID when provided) before creating,
      // so existing students are reused across subjects instead of duplicated
      const queries = [name.trim()];
      if (studentId.trim()) queries.push(studentId.trim());
      const results = await Promise.all(
        queries.map((q) =>
          invoke<StudentMatch[]>("find_students", { query: q }),
        ),
      );
      const merged = Array.from(
        new Map(results.flat().map((m) => [m.id, m])).values(),
      );
      if (merged.length > 0) {
        setMatches(merged);
        return; // show picker; do not create yet
      }
      await createNewStudent();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await invoke("delete_student", { id: deleteTarget.studentId });
      setDeleteTarget(null);
      loadEnrollments();
    } catch (e) {
      console.error(e);
    }
  };

  const selectedSubject = subjects.find(
    (s) => s.id === selectedSubjectId,
  );
  const selectedSection = sections.find(
    (s) => s.id === selectedSectionId,
  );

  const filtered = search
    ? enrollments.filter(
        (e) =>
          e.student_name.toLowerCase().includes(search.toLowerCase()) ||
          (e.student_code ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : enrollments;

  // Student ids already enrolled in the current section — their "Use existing"
  // button is disabled to avoid a duplicate-enrollment constraint error.
  const enrolledIds = new Set(enrollments.map((e) => e.student_id));

  // No filter → empty state
  if (!selectedSemesterYearId || !selectedSubjectId || !selectedSectionId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users className="w-12 h-12 mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Select a Section</h2>
        <p className="text-muted-foreground max-w-md">
          Choose a semester/year, subject, and section from the filter bar to view enrolled students.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("students.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {selectedSubject?.name}
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">{t("students.add_student")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editId ? t("students.edit_student") : t("students.new_student")}
              </DialogTitle>
              {editId && (
                <DialogDescription>{t("students.editing_student")}</DialogDescription>
              )}
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="s-name">{t("students.name")}</Label>
                <Input
                  id="s-name"
                  placeholder={t("students.name_placeholder")}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setMatches([]);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-email">{t("students.email_optional")}</Label>
                <Input
                  id="s-email"
                  type="email"
                  placeholder={t("students.email_placeholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-id">{t("students.student_id_optional")}</Label>
                <Input
                  id="s-id"
                  placeholder={t("students.student_id_placeholder")}
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    setMatches([]);
                  }}
                />
              </div>
              {!editId && (
                <p className="text-xs text-muted-foreground text-center">
                  {t("students.will_be_enrolled_in")}{" "}
                  <span className="font-medium">{selectedSubject?.name}</span>
                  {selectedSection && (
                    <>
                      {" · "}
                      <span className="font-medium">{selectedSection.name}</span>
                    </>
                  )}
                </p>
              )}
              {!editId && matches.length > 0 && (
                <div className="border rounded-lg divide-y">
                  <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
                    {t("students.matches_found")}
                  </p>
                  {matches.map((m) => {
                    const alreadyEnrolled = enrolledIds.has(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 ${
                          alreadyEnrolled ? "opacity-60" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {m.student_id ?? "—"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={alreadyEnrolled}
                          onClick={() => useExistingStudent(m.id)}
                        >
                          {alreadyEnrolled
                            ? t("students.already_enrolled")
                            : t("students.use_existing")}
                        </Button>
                      </div>
                    );
                  })}
                  <div className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => {
                        setMatches([]);
                        createNewStudent();
                      }}
                    >
                      {t("students.create_new_anyway")}
                    </Button>
                  </div>
                </div>
              )}
              <Button onClick={handleSave} className="w-full">
                {editId ? t("students.update") : t("students.create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by name or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:max-w-xs"
      />

      {/* Stats */}
      <p className="text-sm text-muted-foreground">
        {enrollments.length} student{enrollments.length !== 1 ? "s" : ""} enrolled
        {search && <> · {filtered.length} match{filtered.length !== 1 ? "es" : ""}</>}
      </p>

      {/* Student table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <ClipboardList className="w-10 h-10 mb-3 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            {search
              ? "No students match your search."
              : "No students enrolled yet. Add your first student above."}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">ID</th>
                  <th className="text-right px-4 py-2 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((enr) => (
                  <tr key={enr.id} className="border-t hover:bg-muted/30 cursor-pointer">
                    <td
                      className="px-4 py-2 font-medium text-primary hover:underline"
                      onClick={() => setDetailEnrollmentId(enr.id)}
                    >
                      {enr.student_name}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {enr.student_code ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(enr);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <StudentDetailDialog
        enrollmentId={detailEnrollmentId}
        onClose={() => setDetailEnrollmentId(null)}
        onDeleted={() => {
          setDetailEnrollmentId(null);
          loadEnrollments();
        }}
        onEdit={(enrollmentId) => {
          const enr = enrollments.find((e) => e.id === enrollmentId);
          if (enr) {
            setDetailEnrollmentId(null);
            openEdit(enr);
          }
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and all
              their grades, attendance records, and bonuses. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
