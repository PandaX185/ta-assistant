import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters falsy values", () => {
    expect(cn("a", false, undefined, null, "", "b")).toBe("a b");
  });

  it("merges tailwind conflicts (later wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("keeps non-conflicting utilities", () => {
    expect(cn("p-2", "m-4", "bg-red-500")).toBe("p-2 m-4 bg-red-500");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});
