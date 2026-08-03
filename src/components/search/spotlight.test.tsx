import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { SpotlightSearch } from "./spotlight";

const results = [
  {
    kind: "student",
    id: "1",
    label: "Alice Smith",
    subtitle: "Databases · Fall 2026 · 2026-0042",
    enrollment_id: "10",
    semester_year_id: "2",
    subject_id: "3",
  },
  {
    kind: "student",
    id: "2",
    label: "Bob Jones",
    subtitle: "Databases · Fall 2026 · 2026-0043",
    enrollment_id: "11",
    semester_year_id: "2",
    subject_id: "3",
  },
];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("SpotlightSearch", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SpotlightSearch open={false} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the hint when the query is empty and never invokes search", async () => {
    const user = userEvent.setup();
    render(<SpotlightSearch open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(
      screen.getByText("Type to search students across all subjects"),
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search students..."), "   ");
    await new Promise((r) => setTimeout(r, 300));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("searches after debounce and renders matching results", async () => {
    vi.mocked(invoke).mockResolvedValue(results);
    const user = userEvent.setup();
    render(<SpotlightSearch open onClose={vi.fn()} onSelect={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Search students..."), "ali");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("global_search", { query: "ali" }),
    );
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("shows a no-results message when the search comes back empty", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<SpotlightSearch open onClose={vi.fn()} onSelect={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Search students..."), "zzz");

    await waitFor(() => expect(screen.getByText('No results for "zzz"')).toBeInTheDocument());
  });

  it("selects a result on click and closes", async () => {
    vi.mocked(invoke).mockResolvedValue(results);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SpotlightSearch open onClose={onClose} onSelect={onSelect} />);

    await user.type(screen.getByPlaceholderText("Search students..."), "ali");
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.click(screen.getByText("Alice Smith"));

    expect(onSelect).toHaveBeenCalledWith(results[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("navigates with arrow keys and selects with Enter", async () => {
    vi.mocked(invoke).mockResolvedValue(results);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SpotlightSearch open onClose={onClose} onSelect={onSelect} />);

    const input = screen.getByPlaceholderText("Search students...");
    await user.type(input, "ali");
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(results[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<SpotlightSearch open onClose={onClose} onSelect={vi.fn()} />);

    fireEvent.keyDown(screen.getByPlaceholderText("Search students..."), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets query and results when reopened", async () => {
    vi.mocked(invoke).mockResolvedValue(results);
    const user = userEvent.setup();
    const { rerender } = render(
      <SpotlightSearch open onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Search students..."), "ali");
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    rerender(<SpotlightSearch open={false} onClose={vi.fn()} onSelect={vi.fn()} />);
    rerender(<SpotlightSearch open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByPlaceholderText("Search students...")).toHaveValue("");
    expect(
      screen.getByText("Type to search students across all subjects"),
    ).toBeInTheDocument();
  });
});
