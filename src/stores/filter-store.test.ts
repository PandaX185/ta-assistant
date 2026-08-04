import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useFilterStore } from "./filter-store";

const mockInvoke = vi.mocked(invoke);

describe("filter-store", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useFilterStore.setState({
      semesterYears: [],
      subjects: [],
      selectedSemesterYearId: null,
      selectedSubjectId: null,
      loaded: false,
      pendingDetailEnrollmentId: null,
    });
  });

  it("loadData fetches semester years only (subjects are scoped)", async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: "sy-1", year: 2026, semester: "Fall" },
    ]);

    await useFilterStore.getState().loadData();

    expect(mockInvoke).toHaveBeenCalledWith("get_semester_years");
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "get_subjects",
      expect.anything(),
    );
    const s = useFilterStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.semesterYears).toHaveLength(1);
    expect(s.semesterYears[0].semester).toBe("Fall");
    expect(s.subjects).toHaveLength(0);
  });

  it("loadSubjects fetches subjects for the selected semester", async () => {
    useFilterStore.setState({ selectedSemesterYearId: "sy-1" });
    mockInvoke.mockResolvedValueOnce([
      { id: "sub-1", name: "Databases", code: null, color: null },
    ]);

    await useFilterStore.getState().loadSubjects();

    expect(mockInvoke).toHaveBeenCalledWith("get_subjects", {
      semesterYearId: "sy-1",
    });
    const s = useFilterStore.getState();
    expect(s.subjects).toHaveLength(1);
    // Single subject auto-selects.
    expect(s.selectedSubjectId).toBe("sub-1");
  });

  it("loadSubjects clears subjects when no semester is selected", async () => {
    useFilterStore.setState({
      selectedSemesterYearId: null,
      subjects: [{ id: "sub-1", name: "Databases", code: null, color: null }],
      selectedSubjectId: "sub-1",
    });

    await useFilterStore.getState().loadSubjects();

    expect(mockInvoke).not.toHaveBeenCalled();
    const s = useFilterStore.getState();
    expect(s.subjects).toHaveLength(0);
    expect(s.selectedSubjectId).toBeNull();
  });

  it("loadData leaves state untouched and does not throw on failure", async () => {
    mockInvoke.mockRejectedValue(new Error("backend down"));
    await expect(useFilterStore.getState().loadData()).resolves.toBeUndefined();
    expect(useFilterStore.getState().loaded).toBe(false);
  });

  it("selection setters update ids", () => {
    useFilterStore.getState().setSelectedSemesterYearId("sy-9");
    useFilterStore.getState().setSelectedSubjectId("sub-9");
    const s = useFilterStore.getState();
    expect(s.selectedSemesterYearId).toBe("sy-9");
    expect(s.selectedSubjectId).toBe("sub-9");
  });

  it("pending detail enrollment id is set and cleared", () => {
    useFilterStore.getState().setPendingDetailEnrollmentId("enr-42");
    expect(useFilterStore.getState().pendingDetailEnrollmentId).toBe("enr-42");
    useFilterStore.getState().setPendingDetailEnrollmentId(null);
    expect(useFilterStore.getState().pendingDetailEnrollmentId).toBeNull();
  });
});
