import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import BottomNav from "./bottom-nav";

function renderNav(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
    </MemoryRouter>
  );
}

describe("BottomNav", () => {
  it("renders exactly five tabs without Settings", async () => {
    await i18n.changeLanguage("en");
    renderNav("/");

    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/",
      "/students",
      "/grades",
      "/attendance",
      "/materials",
    ]);
    expect(screen.queryByTitle("Settings")).not.toBeInTheDocument();
  });

  it("marks the active tab and highlights dashboard with end=true", async () => {
    await i18n.changeLanguage("en");
    renderNav("/");

    const dashboard = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboard).toHaveClass("text-primary");
    expect(screen.getByRole("link", { name: /students/i })).toHaveClass(
      "text-muted-foreground"
    );
    // The bubble track is translated to the first slot.
    const bubble = document.querySelector("span[aria-hidden] > span");
    expect(bubble?.parentElement).toHaveStyle({ transform: "translateX(0%)" });
  });

  it("slides the bubble to the materials slot on /materials", async () => {
    await i18n.changeLanguage("en");
    renderNav("/materials");

    expect(screen.getByRole("link", { name: /materials/i })).toHaveClass(
      "text-primary"
    );
    const bubble = document.querySelector("span[aria-hidden] > span");
    // 5th of 5 slots → 400% of the track width.
    expect(bubble?.parentElement).toHaveStyle({
      transform: "translateX(400%)",
    });
  });

  it("materials stays active on the detail route", async () => {
    await i18n.changeLanguage("en");
    renderNav("/materials/42");

    expect(screen.getByRole("link", { name: /materials/i })).toHaveClass(
      "text-primary"
    );
  });

  it("navigates between tabs on click", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();
    renderNav("/");

    await user.click(screen.getByRole("link", { name: /grades/i }));
    expect(screen.getByRole("link", { name: /grades/i })).toHaveClass(
      "text-primary"
    );
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveClass(
      "text-muted-foreground"
    );
  });
});
