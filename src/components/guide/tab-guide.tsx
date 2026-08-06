import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navItems } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

/** Keys used for per-tab descriptions — order matches navItems. */
const TAB_KEYS = ["dashboard", "students", "grades", "attendance", "settings"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * First-launch guide: an overlay that walks through the 5 main tabs.
 * Intro card + one card per tab. Localized via i18n (ar/en), RTL-safe,
 * and responsive by design (fixed overlay, centered max-w-md card).
 */
export default function TabGuide({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const total = 1 + navItems.length; // intro + 5 tabs

  // Reset to the intro whenever the guide opens
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Escape closes the guide
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isIntro = step === 0;
  const isLast = step === total - 1;

  const goNext = () => {
    if (isLast) onClose();
    else setStep((s) => s + 1);
  };

  // icon + labels for the current card (navItems[step - 1] only read when not intro)
  const CurrentIcon = isIntro ? Sparkles : navItems[step - 1].icon;
  const icon = <CurrentIcon className="w-7 h-7 text-primary" />;
  const title = isIntro
    ? t("guide.intro_title")
    : t(navItems[step - 1].labelKey);
  const description = isIntro
    ? t("guide.intro_desc")
    : t(`guide.${TAB_KEYS[step - 1]}_desc`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("guide.intro_title")}
    >
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl p-6">
        {/* progress dots */}
        <div className="flex justify-center gap-1.5 mb-5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>

        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="flex items-center justify-between gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>
            {t("guide.skip")}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={isIntro}
            >
              {t("guide.back")}
            </Button>
            <Button onClick={goNext}>
              {isLast ? t("guide.finish") : t("guide.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
