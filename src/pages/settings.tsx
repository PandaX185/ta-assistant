import { useTranslation } from "react-i18next";

export default function Settings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      <p className="text-muted-foreground">{t("settings.coming_soon")}</p>
    </div>
  );
}
