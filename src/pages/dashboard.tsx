import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
      <p className="text-muted-foreground">{t("dashboard.description")}</p>
    </div>
  );
}
