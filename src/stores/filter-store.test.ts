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

  it("loadData fetches years and subjects in parallel", async () => {
    mockInvoke
      .mockResolvedValueOnce([
        { id: "sy-1", year: 2026, semester: "Fall" },
      ])
      .mockResolvedValueOnce([{ id: "sub-1", name: "Databases", code: null, color: null }]);

    await useFilterStore.getState().loadData();

    expect(mockInvoke).toHaveBeenCalledWith("get_semester_years");
    expect(mockInvoke).toHaveBeenCalledWith("get_subjects");
    const s = useFilterStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.semesterYears).toHaveLength(1);
    expect(s.semesterYears[0].semester).toBe("Fall");
    expect(s.subjects).toHaveLength(1);
    expect(s.subjects[0].name).toBe("Databases");
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
