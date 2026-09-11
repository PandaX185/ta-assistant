import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import Lecture from "./lecture";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const lectureInfo = {
  id: "lec-1",
  date: "2026-02-01",
  title: "Intro",
  subject_name: "Databases",
  section_name: "Group A",
};

const note = {
  id: "note-1",
  lecture_id: "lec-1",
  content_md: "# Summary\n\n- key point",
  updated_at: 1730000000000,
};

const file = {
  id: "file-1",
  lecture_id: "lec-1",
  file_name: "slides.pdf",
  stored_path: "lec-1/abc.pdf",
  mime_type: "application/pdf",
  file_size: 12_345,
  created_at: 1730000000000,
};

const link = {
  id: "link-1",
  lecture_id: "lec-1",
  title: "Docs",
  url: "https://example.com",
  created_at: 1730000000000,
};

function renderLecture() {
  return render(
    <MemoryRouter initialEntries={["/lectures/lec-1"]}>
      <Routes>
        <Route path="lectures/:id" element={<Lecture />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(openDialog).mockReset();
  vi.mocked(openUrl).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_lecture") return Promise.resolve(lectureInfo);
    if (cmd === "get_lecture_materials")
      return Promise.resolve({ note, files: [file], links: [link] });
    return Promise.resolve(undefined);
  });
});

describe("Lecture materials page", () => {
  it("renders the lecture header and all three sections from mocked data", async () => {
    renderLecture();
    expect(
      await screen.findByRole("heading", { name: /Databases/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Group A/)).toBeInTheDocument();
    expect(screen.getByText("2026-02-01 — Intro")).toBeInTheDocument();

    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Links")).toBeInTheDocument();

    expect(screen.getByText("slides.pdf")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(await screen.findByText("Summary")).toBeInTheDocument();
  });

  it("renders an empty state when nothing is attached", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_lecture") return Promise.resolve(lectureInfo);
      if (cmd === "get_lecture_materials")
        return Promise.resolve({ note: null, files: [], links: [] });
      return Promise.resolve(undefined);
    });
    renderLecture();
    expect(
      await screen.findByText(/No notes yet/),
    ).toBeInTheDocument();
    expect(screen.getByText("No files attached.")).toBeInTheDocument();
    expect(screen.getByText("No links saved.")).toBeInTheDocument();
  });

  it("shows an error message when the lecture is missing", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_lecture") return Promise.reject("Lecture not found");
      return Promise.resolve(undefined);
    });
    renderLecture();
    expect(
      await screen.findByText(/Lecture not found/),
    ).toBeInTheDocument();
  });

  it("saves edited notes via save_note", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_lecture") return Promise.resolve(lectureInfo);
      if (cmd === "get_lecture_materials")
        return Promise.resolve({ note, files: [file], links: [link] });
      if (cmd === "save_note")
        return Promise.resolve({ ...note, content_md: "# Updated" });
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderLecture();
    await screen.findByText("Summary");

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const textarea = (await screen.findByRole("textbox", { name: "Notes" })) as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "# Updated");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("save_note", {
        lectureId: "lec-1",
        contentMd: "# Updated",
      }),
    );
  });

  it("attaches files picked in the native dialog", async () => {
    vi.mocked(openDialog).mockResolvedValue(["/tmp/slides.pdf", "/tmp/hw.pdf"]);
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_lecture") return Promise.resolve(lectureInfo);
      if (cmd === "get_lecture_materials")
        return Promise.resolve({ note, files: [file], links: [link] });
      if (cmd === "attach_files")
        return Promise.resolve({
          files: [
            { ...file, id: "file-2", file_name: "hw.pdf" },
          ],
          errors: [],
        });
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderLecture();
    await screen.findByText("slides.pdf");

    await user.click(screen.getByRole("button", { name: "+ Add files" }));
    await waitFor(() =>
      expect(openDialog).toHaveBeenCalledWith({ multiple: true, directory: false }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("attach_files", {
        lectureId: "lec-1",
        sourcePaths: ["/tmp/slides.pdf", "/tmp/hw.pdf"],
      }),
    );
    expect(await screen.findByText("hw.pdf")).toBeInTheDocument();
  });

  it("opens and deletes files via their commands", async () => {
    const user = userEvent.setup();
    renderLecture();
    await screen.findByText("slides.pdf");

    await user.click(screen.getAllByRole("button", { name: "Open" })[0]);
    expect(invoke).toHaveBeenCalledWith("open_file", { fileId: "file-1" });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(invoke).toHaveBeenCalledWith("delete_file", { fileId: "file-1" });
    confirmSpy.mockRestore();
  });

  it("adds a link and opens links in the default browser", async () => {
    const user = userEvent.setup();
    renderLecture();
    await screen.findByText("Docs");

    await user.click(screen.getAllByRole("button", { name: "Open" })[1]);
    expect(openUrl).toHaveBeenCalledWith("https://example.com");

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_lecture") return Promise.resolve(lectureInfo);
      if (cmd === "get_lecture_materials")
        return Promise.resolve({ note, files: [file], links: [] });
      if (cmd === "add_link")
        return Promise.resolve({ ...link, id: "link-2", title: "New ref" });
      return Promise.resolve(undefined);
    });
    await user.type(screen.getByLabelText("Title"), "New ref");
    await user.type(screen.getByLabelText("URL"), "https://new.example");
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("add_link", {
        lectureId: "lec-1",
        title: "New ref",
        url: "https://new.example",
      }),
    );
    expect(await screen.findByText("New ref")).toBeInTheDocument();
  });

  it("rejects a link that is not http(s)", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();
    renderLecture();
    await screen.findByText("Docs");

    await user.type(screen.getByLabelText("Title"), "Bad");
    await user.type(screen.getByLabelText("URL"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Add link" }));

    expect(invoke).not.toHaveBeenCalledWith(
      expect.objectContaining({ cmd: "add_link" }),
    );
    expect(alertSpy).toHaveBeenCalledWith("URL must start with http:// or https://");
    alertSpy.mockRestore();
  });
});