import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export function applyLocale(locale: string) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  i18n.changeLanguage(locale);
}

/** Localize the stored season codes (Fall/Spring/Summer) for display. */
export function localizeSeason(season: string): string {
  const key =
    season === "Fall"
      ? "settings.season_fall"
      : season === "Spring"
        ? "settings.season_spring"
        : season === "Summer"
          ? "settings.season_summer"
          : null;
  return key ? i18n.t(key) : season;
}

export default i18n;
