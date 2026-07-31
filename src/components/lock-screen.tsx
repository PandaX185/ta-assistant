import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleUnlock = async () => {
    if (!password) return;
    setChecking(true);
    setError("");
    try {
      const ok = await invoke<boolean>("verify_password", { password });
      if (ok) {
        onUnlock();
      } else {
        setError(t("lock.wrong_password"));
        setPassword("");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t("lock.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("lock.description")}</p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              placeholder={t("lock.password_placeholder")}
              value={password}
              autoFocus
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUnlock();
              }}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <Button className="w-full" onClick={handleUnlock} disabled={checking || !password}>
          {checking ? t("lock.unlocking") : t("lock.unlock")}
        </Button>
      </div>
    </div>
  );
}
