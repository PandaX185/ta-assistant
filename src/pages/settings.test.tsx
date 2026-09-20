import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import {
  canInstall,
  install,
  requestInstallPermission,
} from "tauri-plugin-android-installer-api";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { useFilterStore } from "@/stores/filter-store";
import Settings from "./settings";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));
vi.mock("tauri-plugin-android-installer-api", () => ({
  canInstall: vi.fn(),
  install: vi.fn(),
  requestInstallPermission: vi.fn(),
}));

const semesterYears = [
  { id: "sy-1", year: 2026, semester: "Fall" },
  { id: "sy-2", year: 2026, semester: "Summer" },
];
const subjects = [{ id: "sub-1", name: "Databases", code: "DB", color: null }];
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
  vi.mocked(canInstall).mockReset();
  vi.mocked(install).mockReset();
  vi.mocked(requestInstallPermission).mockReset();
  vi.mocked(openDialog).mockReset();
  vi.mocked(saveDialog).mockReset();
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
          : []
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
      })
    );

    // Pick the subject → its sections load.
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(
      await screen.findByRole("option", { name: "[DB] Databases" })
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_sections", {
        semesterYearId: "sy-1",
        subjectId: "sub-1",
      })
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
      })
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
      })
    );

    // Delete with confirmation.
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_section", { id: "sec-1" })
    );
  });

  it("shows a scoped subject list and creates subjects in the chosen semester", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Subjects");

    // Default semester sy-1 shows its subject.
    await waitFor(() =>
      expect(screen.getByText("Databases")).toBeInTheDocument()
    );

    // Switch semester → empty state for that semester.
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(
      await screen.findByRole("option", { name: "2026 Summer" })
    );
    await waitFor(() =>
      expect(
        screen.getByText("No subjects yet for this semester.")
      ).toBeInTheDocument()
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
      })
    );
  });

  it("disables the section Add button until a subject is chosen", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Sections");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled()
    );
    expect(
      screen.getByText("Select a semester and subject to see its sections.")
    ).toBeInTheDocument();
  });

  it("reports when the installed version is up to date", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "check_for_updates")
        return Promise.resolve({
          current_version: "0.3.0",
          latest_version: "0.3.0",
          update_available: false,
          release_notes: null,
          published_at: null,
          download_url: null,
          asset_name: null,
          asset_size: null,
        });
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText(/You're up to date/)).toBeInTheDocument();
  });

  it("offers an update and hands the installer to the OS on desktop", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "check_for_updates")
        return Promise.resolve({
          current_version: "0.3.0",
          latest_version: "0.4.0",
          update_available: true,
          release_notes: "Fixed stuff",
          published_at: "2026-09-01T00:00:00Z",
          download_url:
            "https://github.com/PandaX185/ta-assistant/releases/download/v0.4.0/app.apk",
          asset_name: "app.apk",
          asset_size: 1_000_000,
        });
      if (cmd === "download_update")
        return Promise.resolve("/tmp/ta-assistant/updates/app.apk");
      return Promise.resolve(undefined);
    });
    vi.mocked(canInstall).mockResolvedValue(false);
    vi.mocked(requestInstallPermission).mockRejectedValue(
      new Error("only supported on Android")
    );
    vi.mocked(install).mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(
      await screen.findByRole("heading", { name: "Version 0.4.0 is available" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Published/)).toBeInTheDocument();
    expect(screen.getByText(/Fixed stuff/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Download & Install" })
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("download_update", {
        url: "https://github.com/PandaX185/ta-assistant/releases/download/v0.4.0/app.apk",
        assetName: "app.apk",
      })
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_downloaded", {
        path: "/tmp/ta-assistant/updates/app.apk",
      })
    );
    expect(install).not.toHaveBeenCalled();
  });

  it("uses the Android installer plugin when available", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "check_for_updates")
        return Promise.resolve({
          current_version: "0.3.0",
          latest_version: "0.4.0",
          update_available: true,
          release_notes: null,
          published_at: null,
          download_url:
            "https://github.com/PandaX185/ta-assistant/releases/download/v0.4.0/app.apk",
          asset_name: "app.apk",
          asset_size: null,
        });
      if (cmd === "download_update")
        return Promise.resolve(
          "/data/user/0/com.pandax185.taassistant/files/updates/app.apk"
        );
      return Promise.resolve(undefined);
    });
    vi.mocked(canInstall).mockResolvedValue(true);
    vi.mocked(install).mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await user.click(
      await screen.findByRole("button", { name: "Download & Install" })
    );
    await waitFor(() =>
      expect(install).toHaveBeenCalledWith(
        "/data/user/0/com.pandax185.taassistant/files/updates/app.apk"
      )
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "open_downloaded",
      expect.anything()
    );
  });

  it("gates import/export until semester, subject and section are chosen", async () => {
    mockInvoke();
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Data");

    expect(
      await screen.findByText(/Select a semester, subject and section/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Export roster (CSV)" })
    ).not.toBeInTheDocument();
    // Import is always available — it only needs the CSV file.
    expect(screen.getByRole("button", { name: "Choose CSV…" })).toBeEnabled();
  });

  it("creates a backup at a user-chosen path", async () => {
    mockInvoke();
    vi.mocked(saveDialog).mockResolvedValue("/tmp/markbook-backup.json");
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Data");
    await user.click(
      await screen.findByRole("button", { name: "Create backup…" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("backup_app_data", {
        filePath: "/tmp/markbook-backup.json",
      })
    );
    expect(await screen.findByText(/Backup saved:/)).toBeInTheDocument();
  });

  it("restores from a backup only after confirmation", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "restore_app_data")
        return Promise.resolve({ tables_restored: 13, rows_restored: 42 });
      // The page reloads the filter store after a restore.
      if (cmd === "get_semester_years") return Promise.resolve(semesterYears);
      if (cmd === "get_subjects") return Promise.resolve([]);
      if (cmd === "get_sections") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    vi.mocked(openDialog).mockResolvedValue("/tmp/markbook-backup.json");
    const user = userEvent.setup();
    render(<Settings />);

    await openTab(user, "Data");
    await user.click(
      await screen.findByRole("button", { name: "Restore from backup…" })
    );

    // In-app confirmation dialog (replaces window.confirm).
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("restore_app_data", {
        filePath: "/tmp/markbook-backup.json",
      })
    );
    expect(
      await screen.findByText(/Restored 13 tables \(42 rows\)/)
    ).toBeInTheDocument();
  });
});
