import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { applyLocale } from "./index";

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
