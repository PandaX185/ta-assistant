import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "@/stores/filter-store";
import Materials from "./materials";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const subjectLectures = [
  {
    id: "sl-1",
    title: "Week 1",
    date: "2026-02-01",
    created_at: 1,
    file_count: 2,
    link_count: 1,
    has_note: true,
  },
  {
    id: "sl-2",
    title: "Undated entry",
    date: null,
    created_at: 2,
    file_count: 0,
    link_count: 0,
    has_note: false,
  },
];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useFilterStore.setState({
    semesterYears: [{ id: "sy-1", year: 2026, semester: "Fall" }],
    subjects: [{ id: "sub-1", name: "Databases", code: "DB", color: null }],
    sections: [],
    selectedSemesterYearId: "sy-1",
    selectedSubjectId: "sub-1",
    selectedSectionId: null,
    loaded: true,
  });
});

function mockInvoke() {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_subject_lectures") return Promise.resolve(subjectLectures);
    if (cmd === "create_subject_lecture")
      return Promise.resolve({
        id: "sl-3",
        title: "Week 2",
        date: null,
        created_at: 3,
        file_count: 0,
        link_count: 0,
        has_note: false,
      });
    return Promise.resolve(undefined);
  });
}

describe("Materials list", () => {
  it("lists subject lectures with counts and creates new ones", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/materials"]}>
        <Routes>
          <Route path="/materials" element={<Materials />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_subject_lectures", {
        subjectId: "sub-1",
      }),
    );
    expect(await screen.findByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("1 links")).toBeInTheDocument();
    // Undated entry renders too.
    expect(screen.getByText("Undated entry")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add lecture" }));
    await user.type(screen.getByLabelText("Title"), "Week 2");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_subject_lecture", {
        subjectId: "sub-1",
        title: "Week 2",
        date: null,
      }),
    );
    // The list reloads after create.
    await waitFor(() =>
      expect(
        vi.mocked(invoke).mock.calls.filter(
          ([cmd]) => cmd === "get_subject_lectures",
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it("navigates to the detail page when a lecture entry is opened", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/materials"]}>
        <Routes>
          <Route path="/materials" element={<Materials />} />
          <Route path="/materials/:id" element={<div>DETAIL_PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByText("Week 1"));
    expect(screen.getByText("DETAIL_PAGE")).toBeInTheDocument();
  });

  it("renames and deletes a lecture entry", async () => {
    mockInvoke();
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={["/materials"]}>
        <Routes>
          <Route path="/materials" element={<Materials />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Week 1");

    // Rename: edit buttons (one per entry); take the first.
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const input = screen.getByLabelText("Title");
    await user.clear(input);
    await user.type(input, "Week 1 — intro");
    await user.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_subject_lecture", {
        id: "sl-1",
        title: "Week 1 — intro",
        date: "2026-02-01",
      }),
    );

    // Delete with confirmation.
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_subject_lecture", {
        id: "sl-1",
      }),
    );
    expect(window.confirm).toHaveBeenCalled();
  });

  it("shows the no-subject empty state", async () => {
    useFilterStore.setState({ selectedSubjectId: null });
    mockInvoke();
    render(
      <MemoryRouter initialEntries={["/materials"]}>
        <Routes>
          <Route path="/materials" element={<Materials />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Select a subject/)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "get_subject_lectures",
      expect.anything(),
    );
  });
});
