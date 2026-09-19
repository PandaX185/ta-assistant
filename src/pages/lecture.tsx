import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LectureInfo {
  id: string;
  date: string;
  title: string | null;
  subject_name: string;
  section_name: string | null;
  /// The subject_lecture carrying this attendance lecture's materials, when
  /// one exists (migration 020 reuses the same id). Null for lectures that
  /// never had materials — the Materials tab's "Add lecture" flow creates
  /// fresh entries instead.
  subject_lecture_id: string | null;
}

/**
 * Minimal attendance-lecture page: header info plus a jump into the
 * Materials tab. Materials themselves live under /materials now
 * (subject-scoped); this page only bridges the two worlds.
 */
export default function Lecture() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [lecture, setLecture] = useState<LectureInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    if (!id) return;
    invoke<LectureInfo>("get_lecture", { lectureId: id })
      .then((info) => {
        if (!cancelled) setLecture(info);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const openMaterials = () => {
    if (lecture?.subject_lecture_id) {
      navigate(`/materials/${lecture.subject_lecture_id}`);
    } else {
      navigate("/materials");
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground animate-pulse p-4">
        {t("lecture.loading")}
      </p>
    );
  }

  if (loadError || !lecture) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {loadError ?? t("lecture.not_found")}
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("/attendance")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("lecture.back_to_attendance")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate("/attendance")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("lecture.back_to_attendance")}
        </Button>
        <h1 className="text-2xl font-bold">
          {lecture.subject_name}
          {lecture.section_name ? ` · ${lecture.section_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {lecture.date}
          {lecture.title ? ` — ${lecture.title}` : ""}
        </p>
      </div>

      <Button variant="outline" onClick={openMaterials}>
        <FolderOpen className="h-4 w-4 mr-1" />
        {t("lecture.open_materials")}
      </Button>
    </div>
  );
}
