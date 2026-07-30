import { useTranslation } from "react-i18next";

export default function Grades() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("grades.title")}</h1>
      <p className="text-muted-foreground">{t("grades.no_filter")}</p>
    </div>
  );
}
