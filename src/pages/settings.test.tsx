import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "@/stores/filter-store";
import Settings from "./settings";

const semesterYears = [
  { id: "sy-1", year: 2026, semester: "Fall" },
  { id: "sy-2", year: 2026, semester: "Summer" },
];
const subjects = [
  { id: "sub-1", name: "Databases", code: "DB", color: null },
];
const sections = [
  {
    id: "sec-1",
    subject_id: "sub-1",
    semester_year_id: "sy-1",
    name: "Group A",
    color: null,
  },
];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  useFilterStore.setState({
    semesterYears,
    subjects: [],
    sections: [],
    selectedSemesterYearId: null,
    selectedSubjectId: null,
    selectedSectionId: null,
    loaded: true,
  });
});

function mockInvoke() {
  vi.mocked(invoke).mockImplementation((cmd: string, args?: any) => {
    if (cmd === "get_semester_years") return Promise.resolve(semesterYears);
    if (cmd === "get_subjects")
      return Promise.resolve(args?.semesterYearId === "sy-1" ? subjects : []);
    if (cmd === "get_sections")
      return Promise.resolve(
        args?.semesterYearId === "sy-1" && args?.subjectId === "sub-1"
          ? sections
          : [],
      );
    return Promise.resolve(undefined);
  });
}

async function openTab(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name }));
}

describe("Settings", () => {
  it("manages sections per semester+subject: create, rename, delete", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Sections");

    // Semester defaults to the first one → its subjects load.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_subjects", {
        semesterYearId: "sy-1",
      }),
    );

    // Pick the subject → its sections load.
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(
      await screen.findByRole("option", { name: "[DB] Databases" }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_sections", {
        semesterYearId: "sy-1",
        subjectId: "sub-1",
      }),
    );
    expect(screen.getByText("Group A")).toBeInTheDocument();

    // Create a section.
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    await user.type(screen.getByLabelText("Name"), "Group B");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_section", {
        semesterYearId: "sy-1",
        subjectId: "sub-1",
        name: "Group B",
        color: null,
      }),
    );

    // Rename Group A.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const renameInput = screen.getByLabelText("Name");
    await user.clear(renameInput);
    await user.type(renameInput, "Alpha");
    await user.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("rename_section", {
        id: "sec-1",
        name: "Alpha",
      }),
    );

    // Delete with confirmation.
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_section", { id: "sec-1" }),
    );
    expect(window.confirm).toHaveBeenCalled();
  });

  it("shows a scoped subject list and creates subjects in the chosen semester", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Subjects");

    // Default semester sy-1 shows its subject.
    await waitFor(() => expect(screen.getByText("Databases")).toBeInTheDocument());

    // Switch semester → empty state for that semester.
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "2026 Summer" }));
    await waitFor(() =>
      expect(
        screen.getByText("No subjects yet for this semester."),
      ).toBeInTheDocument(),
    );

    // Create a subject in the Summer semester.
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    await user.type(screen.getByLabelText("Name"), "OS");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_subject", {
        semesterYearId: "sy-2",
        name: "OS",
        code: null,
        color: null,
      }),
    );
  });

  it("disables the section Add button until a subject is chosen", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Sections");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled(),
    );
    expect(
      screen.getByText("Select a semester and subject to see its sections."),
    ).toBeInTheDocument();
  });
});
