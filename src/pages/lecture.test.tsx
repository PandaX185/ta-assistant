import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Lecture from "./lecture";

const lectureInfo = {
  id: "l-1",
  date: "2026-02-01",
  title: "Intro",
  subject_name: "Databases",
  section_name: "Group A",
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

function renderLecture(subjectLectureId: string | null) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_lecture")
      return Promise.resolve({ ...lectureInfo, subject_lecture_id: subjectLectureId });
    return Promise.resolve(undefined);
  });
  return render(
    <MemoryRouter initialEntries={["/lectures/l-1"]}>
      <Routes>
        <Route path="/lectures/:id" element={<Lecture />} />
        <Route path="/materials" element={<div>MATERIALS_LIST</div>} />
        <Route path="/materials/:id" element={<div>MATERIALS_DETAIL</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Lecture page (minimal)", () => {
  it("shows the header and deep-links to the mapped subject lecture", async () => {
    const user = userEvent.setup();
    renderLecture("sl-1");

    expect(await screen.findByText(/Intro/)).toBeInTheDocument();
    expect(screen.getByText(/Databases/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open materials" }));
    expect(screen.getByText("MATERIALS_DETAIL")).toBeInTheDocument();
  });

  it("goes to the materials list when no mapping exists", async () => {
    const user = userEvent.setup();
    renderLecture(null);

    await screen.findByText(/Intro/);
    await user.click(screen.getByRole("button", { name: "Open materials" }));
    expect(screen.getByText("MATERIALS_LIST")).toBeInTheDocument();
  });

  it("shows not found for unknown lectures", async () => {
    vi.mocked(invoke).mockImplementation(() =>
      Promise.reject("Lecture not found"),
    );
    render(
      <MemoryRouter initialEntries={["/lectures/l-1"]}>
        <Routes>
          <Route path="/lectures/:id" element={<Lecture />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Lecture not found/)).toBeInTheDocument();
  });
});
