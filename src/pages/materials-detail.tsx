import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface NoteInfo {
  id: string;
  lecture_id: string;
  content_md: string;
  updated_at: number;
}

interface FileInfo {
  id: string;
  lecture_id: string;
  file_name: string;
  stored_path: string;
  mime_type: string;
  file_size: number;
  created_at: number;
}

interface LinkInfo {
  id: string;
  lecture_id: string;
  title: string;
  url: string;
  created_at: number;
}

interface MaterialsBundle {
  note: NoteInfo | null;
  files: FileInfo[];
  links: LinkInfo[];
}

interface AttachResult {
  files: FileInfo[];
  errors: string[];
}

interface LocationState {
  title?: string;
  date?: string | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTime(millis: number): string {
  return new Date(millis).toLocaleDateString();
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * One subject lecture's materials: the TA's markdown notes, file attachments
 * and reference links. This is the same UI the attendance lecture page used
 * to host, now living under the Materials tab (subject-scoped, independent
 * of attendance). The entry's title/date come from the list page via router
 * state; the materials bundle is loaded by the subject_lecture id.
 */
export default function MaterialsDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { confirmDialog, confirmDialogElement } = useConfirmDialog();
  const state = (location.state ?? {}) as LocationState;

  const [bundle, setBundle] = useState<MaterialsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Notes editor
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Links
  const [linkDraft, setLinkDraft] = useState({ title: "", url: "" });
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState({ title: "", url: "" });

  const load = useCallback(async (lectureId: string) => {
    try {
      const materials = await invoke<MaterialsBundle>("get_lecture_materials", {
        lectureId,
      });
      setBundle(materials);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) load(id);
  }, [id, load]);

  const handleSaveNote = async () => {
    if (!id) return;
    setSavingNote(true);
    try {
      const note = await invoke<NoteInfo>("save_note", {
        lectureId: id,
        contentMd: noteDraft,
      });
      setBundle((prev) => (prev ? { ...prev, note } : prev));
      setEditingNote(false);
    } catch (e) {
      window.alert(String(e));
    } finally {
      setSavingNote(false);
    }
  };

  const handleAddFiles = async () => {
    if (!id) return;
    const selected = await openDialog({ multiple: true, directory: false });
    if (!selected || selected.length === 0) return;
    try {
      // Android hands back `content://` URIs instead of paths; the backend
      // reads those through the fs plugin and derives a display name.
      const result = await invoke<AttachResult>("attach_files", {
        lectureId: id,
        files: selected.map((source) => ({ source })),
      });
      setBundle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files: [...prev.files, ...result.files],
        };
      });
      if (result.errors.length > 0) {
        window.alert(result.errors.join("\n"));
      }
    } catch (e) {
      window.alert(String(e));
    }
  };

  const handleDeleteFile = async (file: FileInfo) => {
    const ok = await confirmDialog({
      message: t("lecture.delete_file_confirm"),
    });
    if (!ok) return;
    try {
      await invoke("delete_file", { fileId: file.id });
      setBundle((prev) =>
        prev
          ? { ...prev, files: prev.files.filter((f) => f.id !== file.id) }
          : prev
      );
    } catch (e) {
      window.alert(String(e));
    }
  };

  const handleOpenFile = async (file: FileInfo) => {
    try {
      await invoke("open_file", { fileId: file.id });
    } catch (e) {
      window.alert(String(e));
    }
  };

  const handleAddLink = async () => {
    if (!id) return;
    if (!linkDraft.title.trim() || !isHttpUrl(linkDraft.url)) {
      window.alert(t("lecture.invalid_url"));
      return;
    }
    try {
      const link = await invoke<LinkInfo>("add_link", {
        lectureId: id,
        title: linkDraft.title.trim(),
        url: linkDraft.url.trim(),
      });
      setBundle((prev) =>
        prev ? { ...prev, links: [...prev.links, link] } : prev
      );
      setLinkDraft({ title: "", url: "" });
    } catch (e) {
      window.alert(String(e));
    }
  };

  const startEditLink = (link: LinkInfo) => {
    setEditingLinkId(link.id);
    setEditingLink({ title: link.title, url: link.url });
  };

  const handleUpdateLink = async () => {
    if (!editingLinkId) return;
    if (!editingLink.title.trim() || !isHttpUrl(editingLink.url)) {
      window.alert(t("lecture.invalid_url"));
      return;
    }
    try {
      await invoke("update_link", {
        linkId: editingLinkId,
        title: editingLink.title.trim(),
        url: editingLink.url.trim(),
      });
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              links: prev.links.map((l) =>
                l.id === editingLinkId
                  ? {
                      ...l,
                      title: editingLink.title.trim(),
                      url: editingLink.url.trim(),
                    }
                  : l
              ),
            }
          : prev
      );
      setEditingLinkId(null);
    } catch (e) {
      window.alert(String(e));
    }
  };

  const handleDeleteLink = async (link: LinkInfo) => {
    const ok = await confirmDialog({
      message: t("lecture.delete_link_confirm"),
    });
    if (!ok) return;
    try {
      await invoke("delete_link", { linkId: link.id });
      setBundle((prev) =>
        prev
          ? { ...prev, links: prev.links.filter((l) => l.id !== link.id) }
          : prev
      );
    } catch (e) {
      window.alert(String(e));
    }
  };

  const handleDeleteLecture = async () => {
    if (!id) return;
    const ok = await confirmDialog({ message: t("materials.delete_confirm") });
    if (!ok) return;
    try {
      await invoke("delete_subject_lecture", { id });
      navigate("/materials");
    } catch (e) {
      window.alert(String(e));
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground animate-pulse p-4">
        {t("materials.loading")}
      </p>
    );
  }

  if (loadError || !bundle) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {loadError ?? t("materials.not_found")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/materials")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("materials.back")}
        </Button>
      </div>
    );
  }

  const note = bundle.note ?? null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => navigate("/materials")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("materials.back")}
          </Button>
          <h1 className="text-2xl font-bold">
            {state.title ?? t("materials.title")}
          </h1>
          {state.date && (
            <p className="text-sm text-muted-foreground">{state.date}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={handleDeleteLecture}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {t("materials.delete_lecture")}
        </Button>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("lecture.notes")}</CardTitle>
            <CardDescription>
              {note ? formatTime(note.updated_at) : ""}
            </CardDescription>
          </div>
          {!editingNote ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNoteDraft(note?.content_md ?? "");
                setEditingNote(true);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              {t("lecture.edit")}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingNote(false)}
              >
                {t("lecture.cancel")}
              </Button>
              <Button size="sm" onClick={handleSaveNote} disabled={savingNote}>
                {savingNote ? t("onboarding.saving") : t("lecture.save")}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editingNote ? (
            <textarea
              aria-label={t("lecture.notes")}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={t("lecture.notes_placeholder")}
              className="w-full min-h-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              dir="auto"
            />
          ) : note && note.content_md.trim() ? (
            <div className="max-w-none text-sm leading-relaxed space-y-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-blue-600 [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {note.content_md}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("lecture.no_notes")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Files */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{t("lecture.files")}</CardTitle>
          <Button size="sm" onClick={handleAddFiles}>
            <Plus className="h-4 w-4 mr-1" />
            {t("lecture.add_files")}
          </Button>
        </CardHeader>
        <CardContent>
          {bundle.files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("lecture.no_files")}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {bundle.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {file.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.file_size)} ·{" "}
                      {formatTime(file.created_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenFile(file)}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    {t("lecture.open")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteFile(file)}
                    aria-label={t("lecture.delete")}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle>{t("lecture.links")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="link-title">{t("lecture.link_title")}</Label>
              <Input
                id="link-title"
                placeholder={t("lecture.link_title_placeholder")}
                value={linkDraft.title}
                onChange={(e) =>
                  setLinkDraft((d) => ({ ...d, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-url">{t("lecture.link_url")}</Label>
              <Input
                id="link-url"
                placeholder={t("lecture.link_url_placeholder")}
                dir="ltr"
                value={linkDraft.url}
                onChange={(e) =>
                  setLinkDraft((d) => ({ ...d, url: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLink();
                }}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="self-end"
              onClick={handleAddLink}
              aria-label={t("lecture.add_link")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>

          {bundle.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("lecture.no_links")}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {bundle.links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {editingLinkId === link.id ? (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 flex-1">
                      <Input
                        aria-label={t("lecture.link_title")}
                        value={editingLink.title}
                        onChange={(e) =>
                          setEditingLink((d) => ({
                            ...d,
                            title: e.target.value,
                          }))
                        }
                      />
                      <Input
                        aria-label={t("lecture.link_url")}
                        dir="ltr"
                        value={editingLink.url}
                        onChange={(e) =>
                          setEditingLink((d) => ({ ...d, url: e.target.value }))
                        }
                      />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={handleUpdateLink}>
                          {t("lecture.save")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingLinkId(null)}
                          aria-label={t("lecture.cancel")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {link.title}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          dir="ltr"
                        >
                          {link.url}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openUrl(link.url)}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        {t("lecture.open")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditLink(link)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteLink(link)}
                        aria-label={t("lecture.delete")}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {confirmDialogElement}
    </div>
  );
}
