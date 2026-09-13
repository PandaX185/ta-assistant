import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { applyLocale, localizeSeason } from "./index";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object"
      ? flatten(v as Record<string, unknown>, key)
      : [key];
  });
}

describe("applyLocale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets lang and ltr direction for en", async () => {
    await applyLocale("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(i18n.language).toBe("en");
  });

  it("sets lang and rtl direction for ar", async () => {
    await applyLocale("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(i18n.language).toBe("ar");
  });

  it("falls back to ltr for unknown locales", async () => {
    await applyLocale("fr");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("switches back from rtl to ltr", async () => {
    await applyLocale("ar");
    expect(document.documentElement.dir).toBe("rtl");
    await applyLocale("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});

describe("locale key parity", () => {
  it("flattens every key in en and ar", () => {
    const enFlat = flatten(en as Record<string, unknown>);
    const arFlat = flatten(ar as Record<string, unknown>);
    expect(enFlat.length).toBeGreaterThan(0);
    expect(arFlat.length).toBeGreaterThan(0);
  });

  it("ar has exactly the same keys as en (deep parity)", () => {
    const enKeys = flatten(en as Record<string, unknown>).sort();
    const arKeys = flatten(ar as Record<string, unknown>).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("localizeSeason maps the stored seasons for both locales", async () => {
    await applyLocale("en");
    expect(localizeSeason("Fall")).toBe("Fall");
    expect(localizeSeason("Spring")).toBe("Spring");
    expect(localizeSeason("Summer")).toBe("Summer");
    expect(localizeSeason("Other")).toBe("Other");
    await applyLocale("ar");
    expect(localizeSeason("Fall")).toBe("الترم الأول");
    expect(localizeSeason("Spring")).toBe("الترم الثاني");
    expect(localizeSeason("Summer")).toBe("الترم الصيفي");
    expect(localizeSeason("Other")).toBe("Other");
  });
});
