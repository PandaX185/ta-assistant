import { beforeEach, describe, expect, it } from "vitest";
import { useLocaleStore } from "./locale-store";

describe("locale-store", () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: "en" });
  });

  it("defaults to en", () => {
    expect(useLocaleStore.getState().locale).toBe("en");
  });

  it("setLocale updates the locale", () => {
    useLocaleStore.getState().setLocale("ar");
    expect(useLocaleStore.getState().locale).toBe("ar");
  });
});
