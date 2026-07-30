import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (locale: string) => void;
}

export default function StepLanguage({ value, onChange }: Props) {
  return (
    <div className="text-center space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Welcome to TA Assistant</h2>
        <p className="text-muted-foreground mt-1">Choose your preferred language</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onChange("en")}
          className={cn(
            "flex flex-col items-center gap-3 p-8 rounded-xl border-2 transition-all",
            value === "en"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30",
          )}
        >
          <span className="text-4xl">🇬🇧</span>
          <span className="font-semibold">English</span>
          <span className="text-xs text-muted-foreground">English</span>
        </button>

        <button
          onClick={() => onChange("ar")}
          className={cn(
            "flex flex-col items-center gap-3 p-8 rounded-xl border-2 transition-all",
            value === "ar"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30",
          )}
        >
          <span className="text-4xl">🇸🇦</span>
          <span className="font-semibold">العربية</span>
          <span className="text-xs text-muted-foreground">Arabic</span>
        </button>
      </div>
    </div>
  );
}
