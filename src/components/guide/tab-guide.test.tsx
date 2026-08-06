import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { applyLocale } from "@/i18n";
import TabGuide from "./tab-guide";

beforeEach(async () => {
  await i18n.changeLanguage("en");
  document.documentElement.classList.remove("dark");
  document.documentElement.lang = "";
  document.documentElement.dir = "";
});

describe("TabGuide", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<TabGuide open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("walks intro then all five tabs and finishes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TabGuide open onClose={onClose} />);

    // intro card
    expect(screen.getByText("Welcome!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    // one card per tab, in nav order
    const tabs = ["Dashboard", "Students", "Grades", "Attendance", "Settings"];
    for (const tab of tabs) {
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("heading", { name: tab })).toBeInTheDocument();
    }

    // last card swaps Next for Finish, which closes
    const finish = screen.getByRole("button", { name: "Finish" });
    await user.click(finish);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("back returns to the previous card", async () => {
    const user = userEvent.setup();
    render(<TabGuide open onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: "Students" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("skip closes immediately", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TabGuide open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the guide", () => {
    const onClose = vi.fn();
    render(<TabGuide open onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders Arabic copy when locale is ar", async () => {
    applyLocale("ar");
    render(<TabGuide open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("مرحباً!")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "التالي" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "لوحة التحكم" }),
      ).toBeInTheDocument();
    });
  });
});
