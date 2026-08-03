import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "./ui-store";

describe("ui-store", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    useUIStore.setState({ sidebarOpen: true, darkMode: false });
  });

  it("defaults to open sidebar and light mode", () => {
    const s = useUIStore.getState();
    expect(s.sidebarOpen).toBe(true);
    expect(s.darkMode).toBe(false);
  });

  it("toggleSidebar flips state", () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it("setDarkMode toggles the document class", () => {
    useUIStore.getState().setDarkMode(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useUIStore.getState().darkMode).toBe(true);

    useUIStore.getState().setDarkMode(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggleDarkMode flips and syncs the document class", () => {
    useUIStore.getState().toggleDarkMode();
    expect(useUIStore.getState().darkMode).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    useUIStore.getState().toggleDarkMode();
    expect(useUIStore.getState().darkMode).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
