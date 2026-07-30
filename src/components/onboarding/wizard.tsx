import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { applyLocale } from "@/i18n";
import StepLanguage from "./step-language";
import StepProfile from "./step-profile";
import StepPassword from "./step-password";
import StepShortcut from "./step-shortcut";

interface FormData {
  locale: string;
  theme: string;
  name: string;
  email: string;
  password: string;
  globalShortcut: string;
}

const TOTAL_STEPS = 4;

interface Props {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<FormData>({
    locale: "en",
    theme: "light",
    name: "",
    email: "",
    password: "",
    globalShortcut: "Ctrl+Shift+P",
  });

  const update = (patch: Partial<FormData>) =>
    setData((prev) => ({ ...prev, ...patch }));

  // Apply locale and theme immediately as user selects them
  useEffect(() => {
    applyLocale(data.locale);
  }, [data.locale]);

  useEffect(() => {
    const isDark = data.theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  }, [data.theme]);

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return !!data.locale;
      case 1:
        return data.name.trim().length > 0 && data.email.trim().length > 0;
      case 2:
        return data.password.length >= 6;
      default:
        return true;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await invoke("save_preferences", {
        name: data.name.trim(),
        email: data.email.trim(),
        password: data.password,
        locale: data.locale,
        theme: data.theme,
        globalShortcut: data.globalShortcut,
      });
      onComplete();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-10">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            {i < TOTAL_STEPS - 1 && (
              <div
                className={`w-12 h-0.5 transition-colors ${
                  i < step ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-md">
        {step === 0 && (
          <StepLanguage
            locale={data.locale}
            theme={data.theme}
            onChange={(patch) => update(patch)}
          />
        )}
        {step === 1 && (
          <StepProfile
            name={data.name}
            email={data.email}
            onChange={(patch) => update(patch)}
          />
        )}
        {step === 2 && (
          <StepPassword
            password={data.password}
            onChange={(password) => update({ password })}
          />
        )}
        {step === 3 && (
          <StepShortcut
            value={data.globalShortcut}
            onChange={(globalShortcut) => update({ globalShortcut })}
          />
        )}

        {error && (
          <p className="text-sm text-destructive mt-4 text-center">{error}</p>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            {t("onboarding.back")}
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {t("onboarding.next")}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {saving ? t("onboarding.saving") : t("onboarding.get_started")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
