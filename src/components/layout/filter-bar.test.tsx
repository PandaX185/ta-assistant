import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "@/stores/filter-store";
import FilterBar from "./filter-bar";

const semesterYears = [{ id: "2", year: 2026, semester: "Fall" }];
const subjects = [{ id: "3", name: "Databases", code: "DB", color: null }];
const sections = [
  { id: "sec-1", subject_id: "3", semester_year_id: "2", name: "Group A", color: null },
];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useFilterStore.setState({
    semesterYears: [],
    subjects: [],
    sections: [],
    selectedSemesterYearId: null,
    selectedSubjectId: null,
    selectedSectionId: null,
    loaded: false,
  });
});

function mockDefaults(overrides?: {
  sections?: typeof sections;
  semesterYears?: typeof semesterYears;
  subjects?: typeof subjects;
}) {
  const { sections: secs = [], semesterYears: sys = semesterYears, subjects: subs = subjects } =
    overrides ?? {};
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_semester_years") return Promise.resolve(sys);
    if (cmd === "get_subjects") return Promise.resolve(subs);
    if (cmd === "get_sections") return Promise.resolve(secs);
    return Promise.resolve([]);
  });
}

describe("FilterBar", () => {
  it("loads filter data on mount when not loaded yet", async () => {
    mockDefaults();

    render(<FilterBar />);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_semester_years"),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_subjects"));

    await waitFor(() => expect(useFilterStore.getState().loaded).toBe(true));
    expect(useFilterStore.getState().semesterYears).toEqual(semesterYears);
    expect(useFilterStore.getState().subjects).toEqual(subjects);
  });

  it("renders semester and subject selects with their values", async () => {
    mockDefaults();

    render(<FilterBar />);

    await waitFor(() => expect(useFilterStore.getState().loaded).toBe(true));

    expect(screen.getByText("Semester / Year")).toBeInTheDocument();
    expect(screen.getByText("Subject")).toBeInTheDocument();

    // Select a semester — subject selection gets reset
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "2026 Fall" }));

    expect(useFilterStore.getState().selectedSemesterYearId).toBe("2");
    expect(useFilterStore.getState().selectedSubjectId).toBeNull();

    // Select a subject
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "[DB] Databases" }));
    expect(useFilterStore.getState().selectedSubjectId).toBe("3");
  });

  it("loads and auto-selects the section when only one exists", async () => {
    mockDefaults({ sections });

    render(<FilterBar />);

    await waitFor(() => expect(useFilterStore.getState().loaded).toBe(true));

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "2026 Fall" }));
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "[DB] Databases" }));

    // Section dropdown appears once semester + subject are set, and the
    // single section is auto-selected
    await waitFor(() => {
      expect(useFilterStore.getState().sections).toEqual(sections);
      expect(useFilterStore.getState().selectedSectionId).toBe("sec-1");
    });
    expect(screen.getByText("Group A")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_sections", {
      semesterYearId: "2",
      subjectId: "3",
    });
  });

  it("shows section placeholder when semester+subject have no sections", async () => {
    mockDefaults({ sections: [] });

    render(<FilterBar />);
    await waitFor(() => expect(useFilterStore.getState().loaded).toBe(true));

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "2026 Fall" }));
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "[DB] Databases" }));

    await user.click(screen.getAllByRole("combobox")[2]);
    expect(await screen.findByText("No sections yet")).toBeInTheDocument();
  });

  it("shows placeholder items when there is no data", async () => {
    mockDefaults({ semesterYears: [], subjects: [] });

    render(<FilterBar />);
    await waitFor(() => expect(useFilterStore.getState().loaded).toBe(true));

    const user = userEvent.setup();
    const [semesterTrigger, subjectTrigger] = screen.getAllByRole("combobox");

    await user.click(semesterTrigger);
    expect(
      await screen.findByText("No semesters yet — create one in Settings"),
    ).toBeInTheDocument();

    // Close the semester dropdown first: while a listbox is open, Radix
    // disables pointer events on everything else on the page.
    fireEvent.keyDown(semesterTrigger, { key: "Escape" });
    await waitFor(() =>
      expect(semesterTrigger).toHaveAttribute("aria-expanded", "false"),
    );

    await user.click(subjectTrigger);
    expect(await screen.findByText("No subjects yet")).toBeInTheDocument();
  });

  it("does not crash when loading fails and keeps the bar rendered", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("db unavailable"));
    render(<FilterBar />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_semester_years"));
    await new Promise((r) => setTimeout(r, 50));

    expect(useFilterStore.getState().loaded).toBe(false);
    expect(screen.getByText("Semester / Year")).toBeInTheDocument();
  });
});
