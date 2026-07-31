import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Globe } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { applyLocale } from "@/i18n";
import { useLocaleStore } from "@/stores/locale-store";

export default function TopBar() {
  const { t } = useTranslation();
  const { darkMode, toggleDarkMode } = useUIStore();
  const { locale, setLocale } = useLocaleStore();

  const toggleLang = useCallback(() => {
    const next = locale === "en" ? "ar" : "en";
    applyLocale(next);
    setLocale(next);
    invoke("update_locale", { locale: next }).catch(console.error);
  }, [locale, setLocale]);

  const handleToggleTheme = useCallback(() => {
    const next = !darkMode;
    toggleDarkMode();
    invoke("update_theme", {
      theme: next ? "dark" : "light",
    }).catch(console.error);
  }, [darkMode, toggleDarkMode]);

  return (
    <header className="h-12 border-b bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-semibold text-sm">
          {t("topbar.app_title")}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleLang}
          title={locale === "en" ? "العربية" : "English"}
        >
          <Globe className="w-4 h-4" />
        </Button>

        <Button variant="ghost" size="icon" onClick={handleToggleTheme}>
          {darkMode ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
