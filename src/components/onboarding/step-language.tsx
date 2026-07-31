import { useTranslation } from "react-i18next";
import { Sun, Moon, Globe } from "lucide-react";
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
          <div className="flex flex-col items-center gap-3 p-2">
            <Globe className="w-8 h-8" />
            <span className="text-2xl font-bold">EN</span>
            <span className="font-semibold">{t("onboarding.english")}</span>
          </div>
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
          <div className="flex flex-col items-center gap-3 p-2">
            <Globe className="w-8 h-8" />
            <span className="text-2xl font-bold">AR</span>
            <span className="font-semibold">{t("onboarding.arabic")}</span>
          </div>
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
            <Sun className="w-6 h-6" />
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
            <Moon className="w-6 h-6" />
            <span className="font-medium text-sm">{t("onboarding.dark")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
