import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Database from "@tauri-apps/plugin-sql";
import { applyLocale } from "@/i18n";
import { useLocaleStore } from "@/stores/locale-store";
import { useUIStore } from "@/stores/ui-store";
import Shell from "@/components/layout/shell";
import OnboardingWizard from "@/components/onboarding/wizard";
import { SpotlightSearch } from "@/components/search/spotlight";
import Dashboard from "@/pages/dashboard";
import Students from "@/pages/students";
import Grades from "@/pages/grades";
import Attendance from "@/pages/attendance";
import Settings from "@/pages/settings";

function AppContent() {
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const unlisten = listen("toggle-search", () => {
      setShowSearch((v) => !v);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="grades" element={<Grades />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>

      <SpotlightSearch
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={(result) => {
          if (result.kind === "student") {
            navigate("/students");
          } else if (result.kind === "subject") {
            navigate("/grades");
          }
        }}
      />
    </>
  );
}

export default function App() {
  const [checking, setChecking] = useState(true);
  const [hasPrefs, setHasPrefs] = useState(false);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const setDarkMode = useUIStore((s) => s.setDarkMode);

  useEffect(() => {
    Database.load("sqlite:ta-assistant.db")
      .then(() => invoke("get_preferences"))
      .then((raw) => {
        if (raw !== null) {
          const prefs = raw as {
            locale: string;
            theme: string;
          };
          applyLocale(prefs.locale);
          setLocale(prefs.locale);
          setDarkMode(prefs.theme === "dark");
          setHasPrefs(true);
        }
      })
      .catch(console.error)
      .finally(() => setChecking(false));
  }, [setLocale, setDarkMode]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!hasPrefs) {
    return <OnboardingWizard onComplete={() => setHasPrefs(true)} />;
  }

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
