import { useTranslation } from "react-i18next";

export default function Attendance() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("attendance.title")}</h1>
      <p className="text-muted-foreground">{t("attendance.no_filter")}</p>
    </div>
  );
}
