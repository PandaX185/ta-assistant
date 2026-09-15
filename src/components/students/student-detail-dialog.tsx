import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Copy, Check } from "lucide-react";
import { useCopyFeedback } from "@/lib/use-copy-feedback";
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

interface QuizItem {
  id: string;
  name: string;
  max_score: number;
  score: number | null;
}

interface AssignmentItem {
  id: string;
  name: string;
  max_score: number;
  score: number | null;
}

interface AttendanceItem {
  id: string | null;
  lecture_id: string;
  lecture_date: string;
  lecture_title: string | null;
  status: string;
}

interface BonusItem {
  id: string;
  value: number;
  reason: string;
  date: string;
}

interface StudentDetail {
  student_id: string;
  student_name: string;
  student_code: string | null;
  student_email: string | null;
  student_phone: string | null;
  quizzes: QuizItem[];
  assignments: AssignmentItem[];
  attendance: AttendanceItem[];
  bonuses: BonusItem[];
}

interface Props {
  enrollmentId: string | null;
  onClose: () => void;
  onDeleted: () => void;
  onEdit: (enrollmentId: string) => void;
}

export function StudentDetailDialog({ enrollmentId, onClose, onDeleted, onEdit }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const { copy, isCopied } = useCopyFeedback();

  useEffect(() => {
    if (!enrollmentId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    invoke<StudentDetail>("get_student_detail", { enrollmentId })
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enrollmentId]);

  const handleDelete = async () => {
    if (!detail) return;
    try {
      await invoke("delete_student", { id: detail.student_id });
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteConfirm(false);
      onDeleted();
    }
  };

  if (!enrollmentId) return null;

  // Calculate totals
  const quizTotal = detail?.quizzes.reduce((sum, q) => sum + (q.score ?? 0), 0) ?? 0;
  const quizMax = detail?.quizzes.reduce((sum, q) => sum + q.max_score, 0) ?? 0;
  const assignmentTotal = detail?.assignments.reduce((sum, a) => sum + (a.score ?? 0), 0) ?? 0;
  const assignmentMax = detail?.assignments.reduce((sum, a) => sum + a.max_score, 0) ?? 0;
  const bonusTotal = detail?.bonuses.reduce((sum, b) => sum + b.value, 0) ?? 0;
  const grandTotal = quizTotal + assignmentTotal + bonusTotal;
  const grandMax = quizMax + assignmentMax;
  const presentCount = detail?.attendance.filter((a) => a.status === "present").length ?? 0;
  const attTotal = detail?.attendance.length ?? 0;
  const attPct = attTotal > 0 ? Math.round((presentCount / attTotal) * 100) : null;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      present: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      absent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      excused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      late: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    };
    return colors[status] ?? "bg-gray-100 text-gray-800";
  };

  return (
    <>
      <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl">
                  {detail?.student_name ?? t("common.loading")}
                </DialogTitle>
                <div className="flex gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                  {detail?.student_code && (
                    <span className="font-mono">{detail.student_code}</span>
                  )}
                  {detail?.student_email && <span>{detail.student_email}</span>}
                  {detail?.student_phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <span dir="ltr" className="font-mono">
                        {detail.student_phone}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        aria-label={t("students.copy_phone")}
                        onClick={() =>
                          copy("detail", detail.student_phone as string)
                        }
                      >
                        {isCopied("detail") ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          {loading && (
            <div className="py-12 text-center text-muted-foreground">{t("common.loading")}</div>
          )}

          {!loading && detail && (
            <div className="space-y-6">
              {/* Quizzes */}
              {detail.quizzes.length > 0 && (
                <section>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">
                    {t("studentDetail.quizzes")}
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">{t("common.name")}</th>
                          <th className="text-right px-3 py-1.5 font-medium">{t("studentDetail.score")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.quizzes.map((q) => (
                          <tr key={q.id} className="border-t">
                            <td className="px-3 py-1.5">{q.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {q.score !== null ? `${q.score} / ${q.max_score}` : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t font-medium bg-muted/30">
                          <td className="px-3 py-1.5">{t("studentDetail.total")}</td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {quizTotal.toFixed(1)} / {quizMax.toFixed(1)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Assignments */}
              {detail.assignments.length > 0 && (
                <section>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">
                    {t("studentDetail.assignments")}
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">{t("common.name")}</th>
                          <th className="text-right px-3 py-1.5 font-medium">{t("studentDetail.score")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.assignments.map((a) => (
                          <tr key={a.id} className="border-t">
                            <td className="px-3 py-1.5">{a.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {a.score !== null ? `${a.score} / ${a.max_score}` : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t font-medium bg-muted/30">
                          <td className="px-3 py-1.5">{t("studentDetail.total")}</td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {assignmentTotal.toFixed(1)} / {assignmentMax.toFixed(1)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Attendance */}
              {detail.attendance.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                      {t("studentDetail.attendance")}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {t("studentDetail.present_count", { count: presentCount, total: attTotal })}
                      {attPct !== null ? ` (${attPct}%)` : ""}
                    </span>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">{t("common.date")}</th>
                          <th className="text-left px-3 py-1.5 font-medium">{t("studentDetail.topic")}</th>
                          <th className="text-right px-3 py-1.5 font-medium">{t("studentDetail.status")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.attendance.map((a) => (
                          <tr key={a.id ?? a.lecture_id} className="border-t">
                            <td className="px-3 py-1.5 font-mono text-xs">{a.lecture_date}</td>
                            <td className="px-3 py-1.5">{a.lecture_title ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${statusBadge(a.status)}`}
                              >
                                {a.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Bonuses & Deductions */}
              {detail.bonuses.length > 0 && (
                <section>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">
                    {t("studentDetail.bonuses")}
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">{t("studentDetail.reason")}</th>
                          <th className="text-right px-3 py-1.5 font-medium">{t("studentDetail.value")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.bonuses.map((b) => (
                          <tr key={b.id} className="border-t">
                            <td className="px-3 py-1.5">{b.reason}</td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono ${
                                b.value >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {b.value >= 0 ? "+" : ""}
                              {b.value}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t font-medium bg-muted/30">
                          <td className="px-3 py-1.5">{t("studentDetail.total_bonus")}</td>
                          <td
                            className={`px-3 py-1.5 text-right font-mono ${
                              bonusTotal >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {bonusTotal >= 0 ? "+" : ""}
                            {bonusTotal.toFixed(1)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Empty state for each section */}
              {detail.quizzes.length === 0 && detail.assignments.length === 0 && detail.attendance.length === 0 && detail.bonuses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("studentDetail.no_records")}
                </p>
              )}

              <Separator />

              {/* Grand Total */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm text-muted-foreground">
                    {t("studentDetail.grand_quizzes", { value: `${quizTotal.toFixed(1)}/${quizMax.toFixed(1)}` })}
                    {" · "}
                    {t("studentDetail.grand_assignments", { value: `${assignmentTotal.toFixed(1)}/${assignmentMax.toFixed(1)}` })}
                    {bonusTotal !== 0 && <>{" · "}{t("studentDetail.grand_bonus", { value: `${bonusTotal >= 0 ? "+" : ""}${bonusTotal.toFixed(1)}` })}</>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    {grandTotal.toFixed(1)}
                    <span className="text-base font-normal text-muted-foreground">
                      /{grandMax.toFixed(1)}
                    </span>
                  </p>
                  {grandMax > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {((grandTotal / grandMax) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(enrollmentId)}
                >
                  {t("common.edit")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirm(true)}
                >
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("studentDetail.delete_confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("studentDetail.delete_confirm_desc_1")} <strong>{detail?.student_name}</strong>{" "}
              {t("studentDetail.delete_confirm_desc_2")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
