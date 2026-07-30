import { useTranslation } from "react-i18next";

export default function Students() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("students.title")}</h1>
      <p className="text-muted-foreground">{t("students.no_filter")}</p>
    </div>
  );
}
