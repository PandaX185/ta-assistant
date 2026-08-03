import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { StudentDetailDialog } from "./student-detail-dialog";

const detail = {
  student_id: "2026-0042",
  student_name: "Alice Smith",
  student_code: "CS-101",
  student_email: "alice@uni.edu",
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
  bonuses: [{ id: "b1", value: 2, reason: "Participation", date: "2026-09-02" }],
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("StudentDetailDialog", () => {
  it("renders nothing when enrollmentId is null", () => {
    const { container } = render(
      <StudentDetailDialog
        enrollmentId={null}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
      />,
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
        onEdit={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_student_detail", { enrollmentId: "10" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Alice Smith" })).toBeInTheDocument(),
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
    });
    render(
      <StudentDetailDialog
        enrollmentId="10"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No grades, attendance, or bonuses recorded yet."),
      ).toBeInTheDocument(),
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
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
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
        onEdit={onEdit}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith("10");
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
        onEdit={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText("Delete Student?")).toBeInTheDocument();
    expect(within(alert).getByText(/Alice Smith/)).toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_student", { id: "2026-0042" }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});
