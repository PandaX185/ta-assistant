import { useTranslation } from "react-i18next";

export function MarkbookMark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <img
      src="/brand/markbook-mark.svg"
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