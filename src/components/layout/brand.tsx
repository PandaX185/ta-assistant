import { useTranslation } from "react-i18next";

export function BrandMark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <img
      src="/brand/xla-logo.png"
      alt={t("brand.name")}
      className={className}
      draggable={false}
    />
  );
}

export function BrandTitle({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={className}>
      {t("brand.name")}
    </span>
  );
}