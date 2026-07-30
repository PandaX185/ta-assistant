import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  name: string;
  email: string;
  onChange: (patch: { name?: string; email?: string }) => void;
}

export default function StepProfile({ name, email, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{t("onboarding.profile")}</h2>
        <p className="text-muted-foreground mt-1">
          {t("onboarding.profile_desc")}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("onboarding.full_name")}</Label>
          <Input
            id="name"
            placeholder={t("onboarding.name_placeholder")}
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t("onboarding.email")}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t("onboarding.email_placeholder")}
            value={email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
