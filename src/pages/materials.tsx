import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { FileText, FolderOpen, Link2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFilterStore } from "@/stores/filter-store";

interface SubjectLectureInfo {
  id: string;
  title: string;
  date: string | null;
  created_at: number;
  file_count: number;
  link_count: number;
  has_note: boolean;
}

/**
 * Materials tab: the subject's lecture entries (the Materials tab's own
 * groupings, independent of attendance lectures) with their notes, files and
 * links. Subject follows the top-bar filter, like every other page.
 */
export default function Materials() {
  const { t } = useTranslation();
  const { confirmDialog, confirmDialogElement } = useConfirmDialog();
  const navigate = useNavigate();
  const {
    semesterYears,
    selectedSemesterYearId,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
  } = useFilterStore();
  const [lectures, setLectures] = useState<SubjectLectureInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [editing, setEditing] = useState<SubjectLectureInfo | null>(null);

  useEffect(() => {
    if (!selectedSubjectId) {
      setLectures([]);
      return;
    }
    invoke<SubjectLectureInfo[]>("get_subject_lectures", {
      subjectId: selectedSubjectId,
    })
      .then(setLectures)
      .catch(() => setLectures([]));
  }, [selectedSubjectId]);

  const reload = async () => {
    if (!selectedSubjectId) return;
    const fresh = await invoke<SubjectLectureInfo[]>("get_subject_lectures", {
      subjectId: selectedSubjectId,
    });
    setLectures(fresh);
  };

  const resetForm = () => {
    setTitle("");
    setDate("");
    setEditing(null);
  };

  const handleSave = async () => {
    if (!title.trim() || !selectedSubjectId) return;
    if (editing) {
      await invoke("update_subject_lecture", {
        id: editing.id,
        title: title.trim(),
        date: editing.date,
      });
    } else {
      await invoke("create_subject_lecture", {
        subjectId: selectedSubjectId,
        title: title.trim(),
        date: date || null,
      });
    }
    resetForm();
    setOpen(false);
    reload();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t("materials.delete_confirm") });
    if (!ok) return;
    await invoke("delete_subject_lecture", { id });
    setLectures((ls) => ls.filter((l) => l.id !== id));
  };

  const selectedSemester = semesterYears.find(
    (s) => s.id === selectedSemesterYearId
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("materials.title")}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {t("materials.description")}
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
            <Button size="sm">{t("materials.add_lecture")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? t("materials.rename") : t("materials.new_lecture")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="mat-title">
                  {t("materials.lecture_title")}
                </Label>
                <Input
                  id="mat-title"
                  placeholder={t("materials.lecture_title_placeholder")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              {!editing && (
                <div className="space-y-2">
                  <Label htmlFor="mat-date">
                    {t("materials.date_optional")}
                  </Label>
                  <Input
                    id="mat-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              )}
              <Button onClick={handleSave} className="w-full">
                {editing ? t("materials.update") : t("materials.create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedSubjectId ?? ""}
          onValueChange={(v) => setSelectedSubjectId(v || null)}
        >
          <SelectTrigger className="w-full sm:w-[260px] h-9 text-sm">
            <SelectValue
              placeholder={
                selectedSemester
                  ? t("common.select_subject")
                  : t("common.no_semesters_yet")
              }
            />
          </SelectTrigger>
          <SelectContent>
            {subjects.length === 0 && (
              <SelectItem value="__placeholder" disabled>
                {selectedSemester
                  ? t("settings.no_subjects_in_semester")
                  : t("settings.select_semester_first")}
              </SelectItem>
            )}
            {subjects.map((sub) => (
              <SelectItem key={sub.id} value={sub.id}>
                {sub.code ? `[${sub.code}] ` : ""}
                {sub.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedSubjectId ? (
        <p className="text-sm text-muted-foreground">
          {t("materials.no_subject")}
        </p>
      ) : lectures.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("materials.no_subject_lectures")}
        </p>
      ) : (
        <div className="space-y-2">
          {lectures.map((lec) => (
            <div
              key={lec.id}
              className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <button
                className="text-start space-y-1"
                onClick={() => navigate(`/materials/${lec.id}`)}
              >
                <span className="font-medium flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  {lec.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {lec.date ?? "—"}
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {lec.has_note && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {t("materials.note")}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  {t("materials.files_count", { count: lec.file_count })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" />
                  {t("materials.links_count", { count: lec.link_count })}
                </span>
                <span className="space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(lec);
                      setTitle(lec.title);
                      setOpen(true);
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(lec.id)}
                  >
                    {t("materials.delete_lecture")}
                  </Button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDialogElement}
    </div>
  );
}
