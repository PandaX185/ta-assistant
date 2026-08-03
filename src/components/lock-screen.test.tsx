import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import LockScreen from "./lock-screen";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("LockScreen", () => {
  it("disables the unlock button while password is empty", () => {
    render(<LockScreen onUnlock={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });

  it("calls verify_password and unlocks when the password is correct", async () => {
    const onUnlock = vi.fn();
    vi.mocked(invoke).mockResolvedValue(true);
    const user = userEvent.setup();

    render(<LockScreen onUnlock={onUnlock} />);
    await user.type(screen.getByPlaceholderText("Password"), "s3cret");

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("verify_password", { password: "s3cret" }),
    );
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
  });

  it("shows an error and clears the input on a wrong password", async () => {
    const onUnlock = vi.fn();
    vi.mocked(invoke).mockResolvedValue(false);
    const user = userEvent.setup();

    render(<LockScreen onUnlock={onUnlock} />);
    const input = screen.getByPlaceholderText("Password");
    await user.type(input, "wrong");

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() =>
      expect(screen.getByText("Incorrect password. Try again.")).toBeInTheDocument(),
    );
    expect(input).toHaveValue("");
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("does not invoke anything when clicked with an empty password", async () => {
    const user = userEvent.setup();
    render(<LockScreen onUnlock={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("toggles password visibility with the show/hide button", async () => {
    const user = userEvent.setup();
    render(<LockScreen onUnlock={vi.fn()} />);

    const input = screen.getByPlaceholderText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("unlocks when Enter is pressed inside the input", async () => {
    const onUnlock = vi.fn();
    vi.mocked(invoke).mockResolvedValue(true);
    const user = userEvent.setup();

    render(<LockScreen onUnlock={onUnlock} />);
    const input = screen.getByPlaceholderText("Password");
    await user.type(input, "s3cret");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
  });
});
