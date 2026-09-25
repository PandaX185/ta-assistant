import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "@/stores/filter-store";
import Students from "./students";

const subjects = [
  { id: "sub-1", name: "Data Structures", code: "CS201", color: null },
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
  useFilterStore.setState({
    semesterYears: [{ id: "sy-1", year: 2026, semester: "Fall" }],
    subjects,
    sections,
    selectedSemesterYearId: "sy-1",
    selectedSubjectId: "sub-1",
    selectedSectionId: "sec-1",
    loaded: true,
  });
});

const enrollmentsCall = {
  semesterYearId: "sy-1",
  subjectId: "sub-1",
  sectionId: "sec-1",
};

describe("Students", () => {
  it("shows an empty state until a section is selected", () => {
    useFilterStore.setState({ selectedSectionId: null });
    render(<Students />);
    expect(screen.getByText("Select a Section")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("creates a brand-new student when no match exists", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments") return Promise.resolve([]);
      if (cmd === "find_students") return Promise.resolve([]);
      if (cmd === "create_student") return Promise.resolve("stu-new");
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "+ Add Student" }));
    await user.type(screen.getByLabelText("Name"), "Ziad");
    await user.type(
      screen.getByLabelText("Student ID (optional)"),
      "2026-0077"
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("find_students", {
        query: "2026-0077",
      })
    );
    expect(invoke).toHaveBeenCalledWith("find_students", { query: "Ziad" });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_student", {
        name: "Ziad",
        email: null,
        studentId: "2026-0077",
        phone: null,
      })
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_enrollment", {
        studentId: "stu-new",
        ...enrollmentsCall,
      })
    );
  });

  it("offers to reuse an existing student instead of duplicating", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments") return Promise.resolve([]);
      if (cmd === "find_students")
        return Promise.resolve([
          {
            id: "stu-old",
            name: "Ziad Ahmed",
            email: null,
            student_id: "2026-0077",
          },
        ]);
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "+ Add Student" }));
    await user.type(screen.getByLabelText("Name"), "Ziad");
    await user.type(
      screen.getByLabelText("Student ID (optional)"),
      "2026-0077"
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    // Match picker appears; nothing was created yet
    await waitFor(() =>
      expect(screen.getByText("Ziad Ahmed")).toBeInTheDocument()
    );
    expect(invoke).toHaveBeenCalledWith("find_students", { query: "Ziad" });
    expect(invoke).not.toHaveBeenCalledWith(
      "create_student",
      expect.anything()
    );

    // Reuse the existing student: only an enrollment is created
    await user.click(screen.getByRole("button", { name: "Use existing" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_enrollment", {
        studentId: "stu-old",
        ...enrollmentsCall,
      })
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "create_student",
      expect.anything()
    );
  });

  it("still creates a new student when the user picks 'Create new anyway'", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments") return Promise.resolve([]);
      if (cmd === "find_students")
        return Promise.resolve([
          {
            id: "stu-old",
            name: "Ziad Ahmed",
            email: null,
            student_id: "2026-0077",
          },
        ]);
      if (cmd === "create_student") return Promise.resolve("stu-new");
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "+ Add Student" }));
    await user.type(screen.getByLabelText("Name"), "Ziad");
    await user.type(
      screen.getByLabelText("Student ID (optional)"),
      "2026-0077"
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(screen.getByText("Ziad Ahmed")).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Create new anyway" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_student", {
        name: "Ziad",
        email: null,
        studentId: "2026-0077",
        phone: null,
      })
    );
    expect(invoke).toHaveBeenCalledWith("create_enrollment", {
      studentId: "stu-new",
      ...enrollmentsCall,
    });
  });

  it("reuses an existing student by name when no ID is provided", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments") return Promise.resolve([]);
      if (cmd === "find_students")
        return Promise.resolve([
          { id: "stu-old", name: "Ziad Ahmed", email: null, student_id: null },
        ]);
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "+ Add Student" }));
    await user.type(screen.getByLabelText("Name"), "Ziad");
    await user.click(screen.getByRole("button", { name: "Create" }));

    // Only the name query runs — no ID to search by
    const findCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([cmd]) => cmd === "find_students");
    expect(findCalls).toHaveLength(1);
    expect(findCalls[0]).toEqual(["find_students", { query: "Ziad" }]);

    await waitFor(() =>
      expect(screen.getByText("Ziad Ahmed")).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Use existing" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_enrollment", {
        studentId: "stu-old",
        ...enrollmentsCall,
      })
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "create_student",
      expect.anything()
    );
  });

  it("merges and dedupes name and ID matches", async () => {
    const stu1 = {
      id: "stu-1",
      name: "Ziad Ahmed",
      email: null,
      student_id: "2026-0077",
    };
    const stu2 = {
      id: "stu-2",
      name: "Ziad Khaled",
      email: null,
      student_id: "2026-0099",
    };
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "get_enrollments") return Promise.resolve([]);
      if (cmd === "find_students") {
        const q = String((args as { query?: string } | undefined)?.query ?? "");
        if (q === "Ziad") return Promise.resolve([stu1]);
        if (q === "2026-0077") return Promise.resolve([stu1, stu2]);
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "+ Add Student" }));
    await user.type(screen.getByLabelText("Name"), "Ziad");
    await user.type(
      screen.getByLabelText("Student ID (optional)"),
      "2026-0077"
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(screen.getByText("Ziad Khaled")).toBeInTheDocument()
    );
    // stu-1 matched by both queries but appears once
    expect(screen.getAllByText("Ziad Ahmed")).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Use existing" })
    ).toHaveLength(2);
  });

  it("shows already-enrolled matches as grayed out", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments")
        return Promise.resolve([
          {
            id: "enr-1",
            student_id: "stu-old",
            semester_year_id: "sy-1",
            subject_id: "sub-1",
            student_name: "Ziad Ahmed",
            student_code: "2026-0077",
            student_email: null,
            student_phone: null,
          },
        ]);
      if (cmd === "find_students")
        return Promise.resolve([
          {
            id: "stu-old",
            name: "Ziad Ahmed",
            email: null,
            student_id: "2026-0077",
            phone: null,
          },
        ]);
      if (cmd === "create_student") return Promise.resolve("stu-new");
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "+ Add Student" }));
    await user.type(screen.getByLabelText("Name"), "Ziad");
    await user.click(screen.getByRole("button", { name: "Create" }));

    // Already-enrolled match: button disabled with the label instead of "Use existing"
    const enrolledBtn = await screen.findByRole("button", {
      name: "Already enrolled",
    });
    expect(enrolledBtn).toBeDisabled();

    // "Create new anyway" still works
    await user.click(screen.getByRole("button", { name: "Create new anyway" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_student", {
        name: "Ziad",
        email: null,
        studentId: null,
        phone: null,
      })
    );
  });

  it("passes phone through to create_student when provided", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments") return Promise.resolve([]);
      if (cmd === "find_students") return Promise.resolve([]);
      if (cmd === "create_student") return Promise.resolve("stu-new");
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "+ Add Student" }));
    await user.type(screen.getByLabelText("Name"), "Ziad");
    await user.type(screen.getByLabelText("Phone (optional)"), "0100 123 4567");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_student", {
        name: "Ziad",
        email: null,
        studentId: null,
        phone: "0100 123 4567",
      })
    );
  });

  it("edit form preserves existing email and phone when saving", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments")
        return Promise.resolve([
          {
            id: "enr-1",
            student_id: "stu-1",
            semester_year_id: "sy-1",
            subject_id: "sub-1",
            student_name: "Ziad",
            student_code: "ID-1",
            student_email: "z@test.com",
            student_phone: "0111 222 3333",
          },
        ]);
      if (cmd === "find_students") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Phone (optional)")).toHaveValue(
      "0111 222 3333"
    );
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("z@test.com");

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Ziad Updated");
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_student", {
        id: "stu-1",
        name: "Ziad Updated",
        email: "z@test.com",
        studentId: "ID-1",
        phone: "0111 222 3333",
      })
    );
  });

  it("filters table rows by phone number", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments")
        return Promise.resolve([
          {
            id: "enr-1",
            student_id: "stu-1",
            semester_year_id: "sy-1",
            subject_id: "sub-1",
            student_name: "Ziad",
            student_code: null,
            student_email: null,
            student_phone: "0100 123 4567",
          },
          {
            id: "enr-2",
            student_id: "stu-2",
            semester_year_id: "sy-1",
            subject_id: "sub-1",
            student_name: "Sara",
            student_code: null,
            student_email: null,
            student_phone: "0199 888 7777",
          },
        ]);
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    const search = screen.getByPlaceholderText(
      "Search by name, ID, or phone..."
    );
    await user.type(search, "888");

    expect(screen.queryByText("Ziad")).not.toBeInTheDocument();
    expect(screen.getByText("Sara")).toBeInTheDocument();
  });

  it("copy button invokes clipboard with the phone number", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_enrollments")
        return Promise.resolve([
          {
            id: "enr-1",
            student_id: "stu-1",
            semester_year_id: "sy-1",
            subject_id: "sub-1",
            student_name: "Ziad",
            student_code: null,
            student_email: null,
            student_phone: "0100 123 4567",
          },
        ]);
      return Promise.resolve(undefined);
    });

    render(<Students />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_enrollments", enrollmentsCall)
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy phone number" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("0100 123 4567")
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "get_student_detail",
      expect.anything()
    );
  });
});
