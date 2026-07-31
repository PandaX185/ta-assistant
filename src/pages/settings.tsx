import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
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
import { useFilterStore } from "@/stores/filter-store";

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
    await invoke("delete_semester_year", { id });
    loadData();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
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
          <table className="w-full text-sm">
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
      )}
    </section>
  );
}

/* ───── Subject Section ───── */

function SubjectSection() {
  const { subjects, loadData } = useFilterStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("");

  const resetForm = () => {
    setName("");
    setCode("");
    setColor("");
    setEditingId(null);
  };

  const openEdit = (sub: { id: string; name: string; code: string | null; color: string | null }) => {
    setEditingId(sub.id);
    setName(sub.name);
    setCode(sub.code ?? "");
    setColor(sub.color ?? "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name) return;
    if (editingId) {
      await invoke("update_subject", {
        id: editingId,
        name,
        code: code || null,
        color: color || null,
      });
    } else {
      await invoke("create_subject", {
        name,
        code: code || null,
        color: color || null,
      });
    }
    resetForm();
    setOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await invoke("delete_subject", { id });
    loadData();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
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

      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subjects yet.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
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
      )}
    </section>
  );
}

/* ───── Page ───── */

export default function Settings() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"semesters" | "subjects">("semesters");

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

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
      </div>

      {tab === "semesters" ? <SemesterYearSection /> : <SubjectSection />}
    </div>
  );
}
