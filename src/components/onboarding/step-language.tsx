import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface Props {
  locale: string;
  theme: string;
  onChange: (patch: { locale?: string; theme?: string }) => void;
}

export default function StepLanguage({ locale, theme, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="text-center space-y-8">
      <div>
        <h2 className="text-2xl font-bold">{t("onboarding.welcome")}</h2>
        <p className="text-muted-foreground mt-1">
          {t("onboarding.choose_language")}
        </p>
      </div>

      {/* Language selection */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onChange({ locale: "en" })}
          className={cn(
            "flex flex-col items-center gap-3 p-6 sm:p-8 rounded-xl border-2 transition-all",
            locale === "en"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30",
          )}
        >
          <span className="text-4xl">🇬🇧</span>
          <span className="font-semibold">{t("onboarding.english")}</span>
        </button>

        <button
          onClick={() => onChange({ locale: "ar" })}
          className={cn(
            "flex flex-col items-center gap-3 p-6 sm:p-8 rounded-xl border-2 transition-all",
            locale === "ar"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30",
          )}
        >
          <span className="text-4xl">🇸🇦</span>
          <span className="font-semibold">{t("onboarding.arabic")}</span>
        </button>
      </div>

      {/* Theme selection */}
      <div>
        <p className="text-sm font-medium mb-3">{t("onboarding.theme")}</p>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onChange({ theme: "light" })}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
              theme === "light"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <span className="text-2xl">☀️</span>
            <span className="font-medium text-sm">{t("onboarding.light")}</span>
          </button>

          <button
            onClick={() => onChange({ theme: "dark" })}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
              theme === "dark"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <span className="text-2xl">🌙</span>
            <span className="font-medium text-sm">{t("onboarding.dark")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
