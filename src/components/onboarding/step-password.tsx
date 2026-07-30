import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface Props {
  password: string;
  onChange: (password: string) => void;
}

export default function StepPassword({ password, onChange }: Props) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 6;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{t("onboarding.password")}</h2>
        <p className="text-muted-foreground mt-1">
          {t("onboarding.password_desc")}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t("onboarding.password_label")}</Label>
          <Input
            id="password"
            type="password"
            placeholder={t("onboarding.password_placeholder")}
            value={password}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
          {tooShort && (
            <p className="text-xs text-destructive">
              {t("onboarding.password_short")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">{t("onboarding.confirm_password")}</Label>
          <Input
            id="confirm"
            type="password"
            placeholder={t("onboarding.confirm_placeholder")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && (
            <p className="text-xs text-destructive">
              {t("onboarding.confirm_mismatch")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
