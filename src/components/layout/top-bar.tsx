import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { Moon, Sun, Globe, Menu, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/stores/ui-store";
import { applyLocale } from "@/i18n";
import { useLocaleStore } from "@/stores/locale-store";
import { SETTINGS_SECTIONS, useSettingsStore } from "@/stores/settings-store";

export default function TopBar() {
  const { t } = useTranslation();
  const { darkMode, toggleDarkMode } = useUIStore();
  const { locale, setLocale } = useLocaleStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { section, setSection } = useSettingsStore();

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
    <header className="min-h-12 pt-[env(safe-area-inset-top)] border-b bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <span className="font-semibold text-sm truncate">
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title={t("sidebar.settings")}
              className={
                location.pathname === "/settings"
                  ? "bg-accent text-accent-foreground"
                  : undefined
              }
            >
              <Menu className="w-4 h-4" />
              <span className="sr-only">{t("sidebar.settings")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SETTINGS_SECTIONS.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => {
                  setSection(s);
                  navigate("/settings");
                }}
              >
                <span className="w-4">
                  {location.pathname === "/settings" && section === s && (
                    <Check className="w-4 h-4" />
                  )}
                </span>
                {t(`settings.tab_${s}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
