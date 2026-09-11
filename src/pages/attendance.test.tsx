import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "@/stores/filter-store";
import Attendance from "./attendance";

const lecture = {
  id: "lec-1",
  subject_id: "sub-1",
  semester_year_id: "sy-1",
  date: "2026-02-01",
  title: "Intro",
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useFilterStore.setState({
    semesterYears: [{ id: "sy-1", year: 2026, semester: "Fall" }],
    subjects: [{ id: "sub-1", name: "Databases", code: null, color: null }],
    sections: [
      {
        id: "sec-1",
        subject_id: "sub-1",
        semester_year_id: "sy-1",
        name: "Group A",
        color: null,
      },
    ],
    selectedSemesterYearId: "sy-1",
    selectedSubjectId: "sub-1",
    selectedSectionId: "sec-1",
    loaded: true,
  });
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_lectures") return Promise.resolve([lecture]);
    return Promise.resolve(undefined);
  });
});

describe("Attendance lecture rows", () => {
  it("has a Materials link that opens the lecture view without selecting the row", async () => {
    render(
      <MemoryRouter initialEntries={["/attendance"]}>
        <Routes>
          <Route path="attendance" element={<Attendance />} />
          <Route path="lectures/:id" element={<div>MATERIALS_PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await screen.findByText("2026-02-01");

    await user.click(screen.getByRole("button", { name: "Materials" }));

    await waitFor(() =>
      expect(invoke).not.toHaveBeenCalledWith("get_attendance", {
        lectureId: "lec-1",
      }),
    );
    expect(await screen.findByText("MATERIALS_PAGE")).toBeInTheDocument();
  });
});