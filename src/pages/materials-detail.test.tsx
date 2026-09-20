import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import MaterialsDetail from "./materials-detail";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const bundle = {
  note: { id: "n1", lecture_id: "sl-1", content_md: "# Notes", updated_at: 1 },
  files: [
    {
      id: "f1",
      lecture_id: "sl-1",
      file_name: "slides.pdf",
      stored_path: "sl-1/x.pdf",
      mime_type: "application/pdf",
      file_size: 12,
      created_at: 1,
    },
  ],
  links: [
    {
      id: "k1",
      lecture_id: "sl-1",
      title: "Docs",
      url: "https://x.test",
      created_at: 1,
    },
  ],
};

function renderDetail() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/materials/sl-1",
          state: { title: "Week 1", date: "2026-02-01" },
        },
      ]}
    >
      <Routes>
        <Route path="/materials" element={<div>MATERIALS_LIST</div>} />
        <Route path="/materials/:id" element={<MaterialsDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(openDialog).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_lecture_materials") return Promise.resolve(bundle);
    if (cmd === "save_note")
      return Promise.resolve({
        id: "n1",
        lecture_id: "sl-1",
        content_md: "",
        updated_at: 2,
      });
    if (cmd === "attach_files")
      return Promise.resolve({ files: [], errors: [] });
    if (cmd === "add_link")
      return Promise.resolve({
        id: "k2",
        lecture_id: "sl-1",
        title: "Spec",
        url: "https://spec.test",
        created_at: 2,
      });
    return Promise.resolve(undefined);
  });
});

describe("Materials detail", () => {
  it("loads the bundle and saves notes via save_note", async () => {
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("slides.pdf")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();

    // Edit the note and save.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByLabelText("Notes");
    await user.type(textarea, " 2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("save_note", {
        lectureId: "sl-1",
        contentMd: expect.stringContaining("# Notes 2"),
      })
    );
  });

  it("attaches files picked through the dialog", async () => {
    vi.mocked(openDialog).mockResolvedValue(["/tmp/a.pdf"]);
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("slides.pdf");
    await user.click(screen.getByRole("button", { name: "+ Add files" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("attach_files", {
        lectureId: "sl-1",
        files: [{ source: "/tmp/a.pdf" }],
      })
    );
  });

  it("adds a link", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Docs");
    await user.type(screen.getByLabelText("Title"), "Spec");
    await user.type(screen.getByLabelText("URL"), "https://spec.test");
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("add_link", {
        lectureId: "sl-1",
        title: "Spec",
        url: "https://spec.test",
      })
    );
  });

  it("deletes the lecture entry and returns to the list", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Week 1");
    // Header "Delete" (lecture entry) — the first Delete button in the DOM;
    // the per-file delete is an icon button further down.
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_subject_lecture", {
        id: "sl-1",
      })
    );
    expect(screen.getByText("MATERIALS_LIST")).toBeInTheDocument();
  });
});
