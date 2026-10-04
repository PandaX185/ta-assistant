import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface SemesterYear {
  id: string;
  year: number;
  semester: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
}

export interface Section {
  id: string;
  subject_id: string;
  semester_year_id: string;
  name: string;
  color: string | null;
}

/// Sentinel section id meaning "all sections of the selected subject".
/// Pages that are inherently per-section (grades, attendance, dashboard)
/// treat it as "no concrete section" and show their select-a-section state.
export const ALL_SECTIONS = "__all__";

/// Resolves the store's section selection to a concrete section id, or null
/// when nothing is selected or "All sections" is picked. Pages that need a
/// single section (grades, attendance, dashboard, section-scoped data tools)
/// treat null as "select a section" and show their empty state instead.
export function concreteSectionId(
  selectedSectionId: string | null
): string | null {
  return !selectedSectionId || selectedSectionId === ALL_SECTIONS
    ? null
    : selectedSectionId;
}

export interface FilterState {
  semesterYears: SemesterYear[];
  subjects: Subject[];
  sections: Section[];
  selectedSemesterYearId: string | null;
  selectedSubjectId: string | null;
  selectedSectionId: string | null;
  loaded: boolean;
  loadData: () => Promise<void>;
  loadSubjects: () => Promise<void>;
  loadSections: () => Promise<void>;
  setSelectedSemesterYearId: (id: string | null) => void;
  setSelectedSubjectId: (id: string | null) => void;
  setSelectedSectionId: (id: string | null) => void;
  pendingDetailEnrollmentId: string | null;
  setPendingDetailEnrollmentId: (id: string | null) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  semesterYears: [],
  subjects: [],
  sections: [],
  selectedSemesterYearId: null,
  selectedSubjectId: null,
  selectedSectionId: null,
  loaded: false,

  loadData: async () => {
    try {
      const years = await invoke<SemesterYear[]>("get_semester_years");
      set({
        semesterYears: years,
        loaded: true,
      });
    } catch (e) {
      console.error("Failed to load filter data:", e);
    }
  },

  // Subjects are semester-scoped: reload whenever the semester changes.
  // Auto-selects when only one subject exists, keeps a still-valid selection,
  // and clears subject + section otherwise.
  loadSubjects: async () => {
    const { selectedSemesterYearId } = useFilterStore.getState();
    if (!selectedSemesterYearId) {
      set({
        subjects: [],
        selectedSubjectId: null,
        sections: [],
        selectedSectionId: null,
      });
      return;
    }
    try {
      const subs = await invoke<Subject[]>("get_subjects", {
        semesterYearId: selectedSemesterYearId,
      });
      set((state) => ({
        subjects: subs,
        selectedSubjectId:
          subs.length === 1
            ? subs[0].id
            : state.selectedSubjectId &&
                subs.some((s) => s.id === state.selectedSubjectId)
              ? state.selectedSubjectId
              : null,
        sections: [],
        selectedSectionId: null,
      }));
    } catch (e) {
      console.error("Failed to load subjects:", e);
      set({ subjects: [], selectedSubjectId: null });
    }
  },

  loadSections: async () => {
    const { selectedSemesterYearId, selectedSubjectId } =
      useFilterStore.getState();
    if (!selectedSemesterYearId || !selectedSubjectId) {
      set({ sections: [], selectedSectionId: null });
      return;
    }
    try {
      const secs = await invoke<Section[]>("get_sections", {
        semesterYearId: selectedSemesterYearId,
        subjectId: selectedSubjectId,
      });
      set((state) => ({
        sections: secs,
        selectedSectionId:
          // "All sections" survives reloads — it applies to any subject.
          state.selectedSectionId === ALL_SECTIONS
            ? ALL_SECTIONS
            : secs.length === 1
              ? secs[0].id
              : state.selectedSectionId &&
                  secs.some((s) => s.id === state.selectedSectionId)
                ? state.selectedSectionId
                : null,
      }));
    } catch (e) {
      console.error("Failed to load sections:", e);
      set({ sections: [], selectedSectionId: null });
    }
  },

  pendingDetailEnrollmentId: null,
  setSelectedSemesterYearId: (id) => set({ selectedSemesterYearId: id }),
  setSelectedSubjectId: (id) => set({ selectedSubjectId: id }),
  setSelectedSectionId: (id) => set({ selectedSectionId: id }),
  setPendingDetailEnrollmentId: (id) => set({ pendingDetailEnrollmentId: id }),
}));
