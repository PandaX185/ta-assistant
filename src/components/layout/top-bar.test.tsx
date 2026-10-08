import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import TopBar from "./top-bar";
import { useSettingsStore } from "@/stores/settings-store";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useSettingsStore.setState({ section: "semesters" });
});

function renderTopBar(initialEntries = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TopBar />
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route path="settings" element={<div>SETTINGS_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TopBar settings menu", () => {
  it("lists the settings sections and navigates to the chosen one", async () => {
    const user = userEvent.setup();
    renderTopBar();

    await user.click(screen.getByTitle("Settings"));

    for (const name of [
      "Semester / Year",
      "Subjects",
      "Sections",
      "Data",
      "Profile",
    ]) {
      expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("menuitem", { name: "Profile" }));

    expect(useSettingsStore.getState().section).toBe("profile");
    expect(await screen.findByText("SETTINGS_PAGE")).toBeInTheDocument();
  });

  it("marks the active section when already on settings", async () => {
    useSettingsStore.setState({ section: "data" });
    const user = userEvent.setup();
    renderTopBar(["/settings"]);

    await user.click(screen.getByTitle("Settings"));

    const active = screen.getByRole("menuitem", { name: "Data" });
    expect(active.querySelector("svg")).not.toBeNull();
    const other = screen.getByRole("menuitem", { name: "Profile" });
    expect(other.querySelector("svg")).toBeNull();
  });
});
