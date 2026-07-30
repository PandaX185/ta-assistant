import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import Shell from "@/components/layout/shell";
import OnboardingWizard from "@/components/onboarding/wizard";
import Dashboard from "@/pages/dashboard";
import Students from "@/pages/students";
import Grades from "@/pages/grades";
import Attendance from "@/pages/attendance";
import Settings from "@/pages/settings";

export default function App() {
  const [checking, setChecking] = useState(true);
  const [hasPrefs, setHasPrefs] = useState(false);

  useEffect(() => {
    Database.load("sqlite:ta-assistant.db")
      .then(() => invoke("get_preferences"))
      .then((prefs) => setHasPrefs(prefs !== null))
      .catch(console.error)
      .finally(() => setChecking(false));
  }, []);

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
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="grades" element={<Grades />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
