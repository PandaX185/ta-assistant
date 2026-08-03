import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import OnboardingWizard from "./wizard";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  document.documentElement.classList.remove("dark");
  document.documentElement.lang = "";
  document.documentElement.dir = "";
});

describe("OnboardingWizard", () => {
  it("walks through all four steps and saves preferences", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={onComplete} />);

    // Step 1: language + theme
    expect(screen.getByText("Welcome to TA Assistant")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 2: profile — Next stays disabled until both fields are filled
    expect(screen.getByText("Your Profile")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeDisabled();
    await user.type(screen.getByLabelText("Full Name"), "  Alice Smith  ");
    await user.type(screen.getByLabelText("Email"), "alice@uni.edu");
    await user.click(next);

    // Step 3: password — needs at least 6 characters
    expect(screen.getByText("Set a Password")).toBeInTheDocument();
    const nextPwd = screen.getByRole("button", { name: "Next" });
    expect(nextPwd).toBeDisabled();
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "secret123");
    await user.click(nextPwd);

    // Step 4: shortcut — capture a key combo
    expect(screen.getByText("Global Shortcut")).toBeInTheDocument();
    const shortcutInput = screen.getByLabelText("Keybinding");
    fireEvent.keyDown(shortcutInput, { key: "k", ctrlKey: true, shiftKey: true });
    expect(shortcutInput).toHaveValue("Ctrl+Shift+K");

    // Save
    await user.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("save_preferences", {
        name: "Alice Smith",
        email: "alice@uni.edu",
        password: "secret123",
        locale: "en",
        theme: "light",
        globalShortcut: "Ctrl+Shift+K",
      }),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("blocks the password step when the password is too short", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Next" })); // → profile
    await user.type(screen.getByLabelText("Full Name"), "Alice");
    await user.type(screen.getByLabelText("Email"), "a@uni.edu");
    await user.click(screen.getByRole("button", { name: "Next" })); // → password

    await user.type(screen.getByLabelText("Password"), "123");
    expect(screen.getByText("Must be at least 6 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.type(screen.getByLabelText("Password"), "456");
    await user.type(screen.getByLabelText("Confirm Password"), "nomatch");
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
  });

  it("applies locale and theme as they are selected", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(screen.getByRole("button", { name: /AR/ }));
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("disables Back on the first step and navigates backwards", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Your Profile")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Welcome to TA Assistant")).toBeInTheDocument();
  });

  it("shows the error when saving fails and does not complete", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("db locked"));
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "Next" })); // → profile
    await user.type(screen.getByLabelText("Full Name"), "Alice");
    await user.type(screen.getByLabelText("Email"), "a@uni.edu");
    await user.click(screen.getByRole("button", { name: "Next" })); // → password
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Next" })); // → shortcut
    await user.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() =>
      expect(screen.getByText("Error: db locked")).toBeInTheDocument(),
    );
    expect(onComplete).not.toHaveBeenCalled();
  });
});
