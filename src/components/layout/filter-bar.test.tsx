import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "@/stores/filter-store";
import FilterBar from "./filter-bar";

const semesterYears = [{ id: "2", year: 2026, semester: "Fall" }];
const subjects = [{ id: "3", name: "Databases", code: "DB", color: null }];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useFilterStore.setState({
    semesterYears: [],
    subjects: [],
    selectedSemesterYearId: null,
    selectedSubjectId: null,
    loaded: false,
  });
});

describe("FilterBar", () => {
  it("loads filter data on mount when not loaded yet", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_semester_years") return Promise.resolve(semesterYears);
      if (cmd === "get_subjects") return Promise.resolve(subjects);
      return Promise.resolve([]);
    });

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
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_semester_years") return Promise.resolve(semesterYears);
      if (cmd === "get_subjects") return Promise.resolve(subjects);
      return Promise.resolve([]);
    });

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

  it("shows placeholder items when there is no data", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_semester_years") return Promise.resolve([]);
      if (cmd === "get_subjects") return Promise.resolve([]);
      return Promise.resolve([]);
    });

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
