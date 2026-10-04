import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  ALL_SECTIONS,
  concreteSectionId,
  useFilterStore,
} from "./filter-store";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useFilterStore.setState({
    semesterYears: [{ id: "sy-1", year: 2026, semester: "Fall" }],
    subjects: [{ id: "sub-1", name: "Databases", code: null, color: null }],
    sections: [],
    selectedSemesterYearId: "sy-1",
    selectedSubjectId: "sub-1",
    selectedSectionId: null,
    loaded: true,
  });
});

describe("concreteSectionId", () => {
  it("resolves a real section id unchanged", () => {
    expect(concreteSectionId("sec-1")).toBe("sec-1");
  });

  it("resolves null and All sections to null", () => {
    expect(concreteSectionId(null)).toBeNull();
    expect(concreteSectionId(ALL_SECTIONS)).toBeNull();
  });
});

describe("loadSections", () => {
  it("keeps the All-sections selection across reloads", async () => {
    const sections = [
      {
        id: "sec-1",
        subject_id: "sub-1",
        semester_year_id: "sy-1",
        name: "Group A",
        color: null,
      },
    ];
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_sections") return Promise.resolve(sections);
      return Promise.resolve([]);
    });
    useFilterStore.setState({ selectedSectionId: ALL_SECTIONS });

    await useFilterStore.getState().loadSections();

    expect(useFilterStore.getState().sections).toEqual(sections);
    expect(useFilterStore.getState().selectedSectionId).toBe(ALL_SECTIONS);
  });
});
