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
          secs.length === 1
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
