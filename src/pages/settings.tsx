import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import {
  canInstall,
  install,
  requestInstallPermission,
} from "tauri-plugin-android-installer-api";
import { Download, HelpCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useFilterStore, Subject, Section } from "@/stores/filter-store";
import { useUIStore } from "@/stores/ui-store";

/* ───── Update-checking types ───── */

interface UpdateStatus {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_notes: string | null;
  published_at: string | null;
  download_url: string | null;
  asset_name: string | null;
  asset_size: number | null;
}

interface DownloadProgress {
  bytes_downloaded: number;
  bytes_total: number | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/* ───── Shared bits ───── */

function SemesterPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { semesterYears } = useFilterStore();
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v || null)}
    >
      <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm">
        <SelectValue placeholder="Select semester" />
      </SelectTrigger>
      <SelectContent>
        {semesterYears.length === 0 && (
          <SelectItem value="__placeholder" disabled>
            No semesters yet — add one first
          </SelectItem>
        )}
        {semesterYears.map((sy) => (
          <SelectItem key={sy.id} value={sy.id}>
            {sy.year} {sy.semester}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/// Defaults a local semester picker to the filter bar's selected semester,
/// falling back to the first one. Re-runs once semesters load.
function useDefaultSemester(semesterId: string | null, setSemesterId: (id: string) => void) {
  const { semesterYears, selectedSemesterYearId } = useFilterStore();
  useEffect(() => {
    if (!semesterId && semesterYears.length > 0) {
      setSemesterId(selectedSemesterYearId ?? semesterYears[0].id);
    }
  }, [semesterId, semesterYears, selectedSemesterYearId, setSemesterId]);
}

/* ───── Semester/Year Section ───── */

function SemesterYearSection() {
  const { semesterYears, loadData } = useFilterStore();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");

  const handleCreate = async () => {
    if (!year || !semester) return;
    await invoke("create_semester_year", {
      year: parseInt(year, 10),
      semester,
    });
    setYear("");
    setSemester("");
    setOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Deleting this semester removes its subjects, sections, enrollments, grades, attendance and lectures. Continue?",
      )
    )
      return;
    await invoke("delete_semester_year", { id });
    loadData();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Semester / Year</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">+ Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Semester / Year</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="sy-year">Year</Label>
                <Input
                  id="sy-year"
                  type="number"
                  placeholder="2025"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sy-semester">Semester</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger id="sy-semester">
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fall">Fall</SelectItem>
                    <SelectItem value="Spring">Spring</SelectItem>
                    <SelectItem value="Summer">Summer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {semesterYears.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No semester/years yet. Add one to get started.
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[320px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Year</th>
                <th className="text-left px-4 py-2 font-medium">Semester</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {semesterYears.map((sy) => (
                <tr key={sy.id} className="border-t">
                  <td className="px-4 py-2">{sy.year}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
                      {sy.semester}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(sy.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───── Subject Section (semester-scoped) ───── */

function SubjectSection() {
  const { loadSubjects } = useFilterStore();
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("");

  useDefaultSemester(semesterId, setSemesterId);

  const reload = async (sem: string) => {
    const subs = await invoke<Subject[]>("get_subjects", {
      semesterYearId: sem,
    });
    setSubjects(subs);
    loadSubjects(); // keep the filter bar in sync
    return subs;
  };

  useEffect(() => {
    if (!semesterId) {
      setSubjects([]);
      setEditingId(null);
      return;
    }
    reload(semesterId).catch((e) => {
      console.error(e);
      setSubjects([]);
    });
  }, [semesterId]);

  const resetForm = () => {
    setName("");
    setCode("");
    setColor("");
    setEditingId(null);
  };

  const openEdit = (sub: Subject) => {
    setEditingId(sub.id);
    setName(sub.name);
    setCode(sub.code ?? "");
    setColor(sub.color ?? "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name || !semesterId) return;
    if (editingId) {
      await invoke("update_subject", {
        id: editingId,
        name,
        code: code || null,
        color: color || null,
      });
    } else {
      await invoke("create_subject", {
        semesterYearId: semesterId,
        name,
        code: code || null,
        color: color || null,
      });
    }
    resetForm();
    setOpen(false);
    reload(semesterId);
  };

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Deleting this subject removes its sections, enrollments, grades, attendance and lectures for this semester. Continue?",
      )
    )
      return;
    await invoke("delete_subject", { id });
    if (semesterId) reload(semesterId);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Subjects</h2>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">+ Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Subject" : "New Subject"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="sub-name">Name</Label>
                <Input
                  id="sub-name"
                  placeholder="e.g. Data Structures"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-code">Code (optional)</Label>
                <Input
                  id="sub-code"
                  placeholder="e.g. CS201"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-color">Color (optional)</Label>
                <Input
                  id="sub-color"
                  type="color"
                  value={color || "#3b82f6"}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10"
                />
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Semester:</span>
        <SemesterPicker value={semesterId} onChange={setSemesterId} />
      </div>

      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {semesterId
            ? "No subjects yet for this semester."
            : "Select a semester to manage its subjects."}
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[360px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Code</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub) => (
                <tr key={sub.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {sub.color && (
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: sub.color }}
                        />
                      )}
                      {sub.name}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {sub.code ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(sub)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(sub.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───── Sections Section ───── */

function SectionsSection() {
  const { loadSections } = useFilterStore();
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useDefaultSemester(semesterId, setSemesterId);

  useEffect(() => {
    if (!semesterId) {
      setSubjects([]);
      setSubjectId(null);
      setSections([]);
      return;
    }
    invoke<Subject[]>("get_subjects", { semesterYearId: semesterId })
      .then(setSubjects)
      .catch((e) => {
        console.error(e);
        setSubjects([]);
      });
  }, [semesterId]);

  useEffect(() => {
    if (!semesterId || !subjectId) {
      setSections([]);
      return;
    }
    invoke<Section[]>("get_sections", {
      semesterYearId: semesterId,
      subjectId,
    })
      .then(setSections)
      .catch((e) => {
        console.error(e);
        setSections([]);
      });
  }, [semesterId, subjectId]);

  const reloadSections = async () => {
    if (semesterId && subjectId) {
      const secs = await invoke<Section[]>("get_sections", {
        semesterYearId: semesterId,
        subjectId,
      });
      setSections(secs);
    }
    loadSections(); // keep the filter bar in sync
  };

  const handleCreate = async () => {
    if (!name || !semesterId || !subjectId) return;
    await invoke("create_section", {
      semesterYearId: semesterId,
      subjectId,
      name,
      color: color || null,
    });
    setName("");
    setColor("");
    setOpen(false);
    reloadSections();
  };

  const handleRename = async () => {
    if (!editingId || !editingName.trim()) return;
    await invoke("rename_section", { id: editingId, name: editingName });
    setEditingId(null);
    setEditingName("");
    reloadSections();
  };

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Deleting this section removes its enrollments, lectures, attendance and grades. Continue?",
      )
    )
      return;
    await invoke("delete_section", { id });
    reloadSections();
  };

  const selectedSubject = subjects.find((s) => s.id === subjectId);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Sections</h2>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setName("");
              setColor("");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" disabled={!semesterId || !subjectId}>
              + Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Section</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="sec-name">Name</Label>
                <Input
                  id="sec-name"
                  placeholder="e.g. Group B"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-color">Color (optional)</Label>
                <Input
                  id="sec-color"
                  type="color"
                  value={color || "#3b82f6"}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10"
                />
              </div>
              <Button onClick={handleCreate} className="w-full">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Semester:</span>
        <SemesterPicker value={semesterId} onChange={setSemesterId} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Subject:</span>
        <Select
          value={subjectId ?? ""}
          onValueChange={(v) => setSubjectId(v || null)}
        >
          <SelectTrigger className="w-full sm:w-[260px] h-9 text-sm">
            <SelectValue placeholder="Select subject" />
          </SelectTrigger>
          <SelectContent>
            {subjects.length === 0 && (
              <SelectItem value="__placeholder" disabled>
                {semesterId
                  ? "No subjects in this semester"
                  : "Select a semester first"}
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

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {!semesterId || !subjectId
            ? "Select a semester and subject to see its sections."
            : `No sections yet for ${selectedSubject?.name ?? "this subject"}.`}
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[360px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <tr key={sec.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {sec.color && (
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: sec.color }}
                        />
                      )}
                      {sec.name}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(sec.id);
                        setEditingName(sec.name);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(sec.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Dialog
        open={editingId !== null}
        onOpenChange={(v) => {
          if (!v) setEditingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="sec-rename">Name</Label>
              <Input
                id="sec-rename"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
              />
            </div>
            <Button onClick={handleRename} className="w-full">
              Update
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ───── Page ───── */

export default function Settings() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"semesters" | "subjects" | "sections">(
    "semesters",
  );
  const [version, setVersion] = useState<string | null>(null);
  const openGuide = useUIStore((s) => s.openGuide);

  // Update checking state
  const [updateInfo, setUpdateInfo] = useState<UpdateStatus | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<DownloadProgress>("update-download-progress", (event) => {
      setProgress(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleCheckForUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateError(null);
    setUpdateInfo(null);
    try {
      const status = await invoke<UpdateStatus>("check_for_updates");
      setUpdateInfo(status);
      if (status.update_available) setUpdateDialogOpen(true);
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!updateInfo?.download_url || !updateInfo.asset_name) return;
    setDownloading(true);
    setUpdateError(null);
    setProgress(null);
    try {
      const path = await invoke<string>("download_update", {
        url: updateInfo.download_url,
        assetName: updateInfo.asset_name,
      });
      if (await canInstall()) {
        await install(path);
        // The OS install prompt appears; on success the app is replaced, so
        // nothing after this runs in that case.
        setUpdateDialogOpen(false);
        return;
      }
      try {
        await requestInstallPermission();
      } catch {
        // Android 8+ isn't granted yet on Android; on desktop this always
        // rejects, which is how we hand the installer to the OS instead.
        await invoke("open_downloaded", { path });
        setUpdateDialogOpen(false);
        return;
      }
      if (await canInstall()) {
        await install(path);
        setUpdateDialogOpen(false);
      } else {
        setUpdateError(t("updates.permission_needed"));
      }
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
          {version && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.version")} {version}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={openGuide}>
          <HelpCircle />
          {t("guide.show_again")}
        </Button>
      </div>

      <div className="flex gap-2 border-b pb-0">
        <button
          onClick={() => setTab("semesters")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "semesters"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Semester / Year
        </button>
        <button
          onClick={() => setTab("subjects")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "subjects"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Subjects
        </button>
        <button
          onClick={() => setTab("sections")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "sections"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Sections
        </button>
      </div>

      {tab === "semesters" ? (
        <SemesterYearSection />
      ) : tab === "subjects" ? (
        <SubjectSection />
      ) : (
        <SectionsSection />
      )}

      {/* Updates */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("updates.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("updates.description")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckForUpdates}
            disabled={checkingUpdates || downloading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${checkingUpdates ? "animate-spin" : ""}`}
            />
            {checkingUpdates ? t("updates.checking") : t("updates.check")}
          </Button>
        </div>

        {updateError && (
          <p className="text-sm text-destructive">{updateError}</p>
        )}

        {updateInfo && !updateInfo.update_available && !checkingUpdates && (
          <p className="text-sm text-muted-foreground">
            {t("updates.up_to_date", { version: updateInfo.latest_version })}
          </p>
        )}

        {downloading && progress && (
          <div className="space-y-1 max-w-sm">
            <p className="text-sm">{t("updates.downloading")}</p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: progress.bytes_total
                    ? `${Math.min(100, (progress.bytes_downloaded / progress.bytes_total) * 100)}%`
                    : "40%",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(progress.bytes_downloaded)}
              {progress.bytes_total
                ? ` / ${formatBytes(progress.bytes_total)}`
                : ""}
            </p>
          </div>
        )}
      </section>

      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("updates.available", { version: updateInfo?.latest_version })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {updateInfo?.published_at && (
              <p className="text-xs text-muted-foreground">
                {t("updates.published", {
                  date: formatDate(updateInfo.published_at),
                })}
              </p>
            )}
            {updateInfo?.release_notes && (
              <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {updateInfo.release_notes}
              </div>
            )}
            {updateInfo?.asset_size ? (
              <p className="text-xs text-muted-foreground">
                {t("updates.size", { size: formatBytes(updateInfo.asset_size) })}
              </p>
            ) : null}
            <Button
              className="w-full"
              onClick={handleDownloadAndInstall}
              disabled={downloading}
            >
              <Download className="h-4 w-4 mr-1" />
              {downloading ? t("updates.downloading") : t("updates.download_install")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
