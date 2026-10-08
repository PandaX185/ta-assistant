import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "@/stores/filter-store";
import { StudentDetailDialog } from "./student-detail-dialog";

const detail = {
  student_id: "2026-0042",
  student_name: "Alice Smith",
  student_code: "CS-101",
  student_email: "alice@uni.edu",
  student_phone: "+966 50 123 4567",
  quizzes: [{ id: "q1", name: "Quiz 1", max_score: 10, score: 8 }],
  assignments: [{ id: "a1", name: "HW 1", max_score: 20, score: 15 }],
  attendance: [
    {
      id: "att1",
      lecture_id: "l1",
      lecture_date: "2026-09-01",
      lecture_title: "Intro",
      status: "present",
    },
    {
      id: "att2",
      lecture_id: "l2",
      lecture_date: "2026-09-08",
      lecture_title: null,
      status: "absent",
    },
  ],
  bonuses: [
    { id: "b1", value: 2, reason: "Participation", date: "2026-09-02" },
  ],
  section_id: "sec-1",
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useFilterStore.setState({ sections: [] });
});

describe("StudentDetailDialog", () => {
  it("renders nothing when enrollmentId is null", () => {
    const { container } = render(
      <StudentDetailDialog
        enrollmentId={null}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("loads and renders the full student detail", async () => {
    vi.mocked(invoke).mockResolvedValue(detail);
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_student_detail", {
        enrollmentId: "10",
      })
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alice Smith" })
      ).toBeInTheDocument()
    );
    expect(screen.getByText("CS-101")).toBeInTheDocument();
    expect(screen.getByText("alice@uni.edu")).toBeInTheDocument();

    // Quizzes section: score cell and totals
    expect(screen.getByText("Quiz 1")).toBeInTheDocument();
    expect(screen.getByText("8 / 10")).toBeInTheDocument();

    // Assignments
    expect(screen.getByText("HW 1")).toBeInTheDocument();
    expect(screen.getByText("15 / 20")).toBeInTheDocument();

    // Attendance: badge counts and null lecture title renders as —
    expect(screen.getByText("1/2 present (50%)")).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("present")).toBeInTheDocument();
    expect(screen.getByText("absent")).toBeInTheDocument();

    // Bonuses
    expect(screen.getByText("Participation")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();

    // Grand total: 8 + 15 + 2 = 25 / 30 → 83.3%
    expect(screen.getByText("25.0")).toBeInTheDocument();
    expect(screen.getByText("/30.0")).toBeInTheDocument();
    expect(screen.getByText("83.3%")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", async () => {
    vi.mocked(invoke).mockResolvedValue({
      student_id: "2026-0042",
      student_name: "Alice Smith",
      student_code: null,
      student_email: null,
      quizzes: [],
      assignments: [],
      attendance: [],
      bonuses: [],
      section_id: "sec-1",
    });
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText("No grades, attendance, or bonuses recorded yet.")
      ).toBeInTheDocument()
    );
  });

  it("shows a loading state while the request is in flight", () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(invoke).mockReturnValue(new Promise((r) => (resolve = r)));

    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    resolve(detail);
  });

  it("triggers onEdit with the enrollment id", async () => {
    vi.mocked(invoke).mockResolvedValue(detail);
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={onEdit}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith("10");
  });

  it("adds a bonus and reloads the detail", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_bonus") return Promise.resolve("b2");
      return Promise.resolve(detail);
    });
    const user = userEvent.setup();
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(screen.getByText("Participation")).toBeInTheDocument()
    );
    await user.type(screen.getByLabelText("Value"), "1.5");
    await user.type(screen.getByLabelText("Reason"), "Helping");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_bonus", {
        enrollmentId: "10",
        value: 1.5,
        reason: "Helping",
      })
    );
    // Detail reloads so the new total shows.
    await waitFor(() =>
      expect(
        vi
          .mocked(invoke)
          .mock.calls.filter(([cmd]) => cmd === "get_student_detail")
      ).toHaveLength(2)
    );
  });

  it("deletes a bonus after confirmation", async () => {
    vi.mocked(invoke).mockResolvedValue(detail);
    const user = userEvent.setup();
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(screen.getByText("Participation")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Delete bonus: Participation" })
    );

    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText("Delete this bonus?")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_bonus", { id: "b1" })
    );
    await waitFor(() =>
      expect(
        vi
          .mocked(invoke)
          .mock.calls.filter(([cmd]) => cmd === "get_student_detail")
      ).toHaveLength(2)
    );
  });

  it("deletes the student after confirmation", async () => {
    vi.mocked(invoke).mockResolvedValue(detail);
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={onDeleted}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText("Delete Student?")).toBeInTheDocument();
    expect(within(alert).getByText(/Alice Smith/)).toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_student", { id: "2026-0042" })
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("hides Move when there is no other section", async () => {
    vi.mocked(invoke).mockResolvedValue(detail);
    useFilterStore.setState({
      sections: [
        {
          id: "sec-1",
          subject_id: "sub-1",
          semester_year_id: "sy-1",
          name: "Group A",
          color: null,
        },
      ],
    });
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(screen.getByText("Participation")).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "Move" })
    ).not.toBeInTheDocument();
  });

  it("moves the student to another section after confirmation", async () => {
    vi.mocked(invoke).mockResolvedValue(detail);
    useFilterStore.setState({
      sections: [
        {
          id: "sec-1",
          subject_id: "sub-1",
          semester_year_id: "sy-1",
          name: "Group A",
          color: null,
        },
        {
          id: "sec-2",
          subject_id: "sub-1",
          semester_year_id: "sy-1",
          name: "Group B",
          color: null,
        },
      ],
    });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={onChanged}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Move" }));

    const moveDialog = await screen.findByRole("dialog", {
      name: "Move to Section",
    });
    await user.click(within(moveDialog).getByRole("combobox"));
    // The current section is not offered as a target.
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Group B"]);
    await user.click(await screen.findByRole("option", { name: "Group B" }));
    await user.click(within(moveDialog).getByRole("button", { name: "Move" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("transfer_enrollment", {
        enrollmentId: "10",
        targetSectionId: "sec-2",
      })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("unenrolls the student from the subject after confirmation", async () => {
    vi.mocked(invoke).mockResolvedValue(detail);
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onChanged={onChanged}
        onEdit={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Unenroll" })
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Unenroll" }));

    const alert = await screen.findByRole("alertdialog");
    expect(
      within(alert).getByText("Unenroll from this subject?")
    ).toBeInTheDocument();
    expect(within(alert).getByText(/Alice Smith/)).toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Unenroll" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_enrollment", { id: "10" })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});
