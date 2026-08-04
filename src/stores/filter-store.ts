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
      const [years, subs] = await Promise.all([
        invoke<SemesterYear[]>("get_semester_years"),
        invoke<Subject[]>("get_subjects"),
      ]);
      set({
        semesterYears: years,
        subjects: subs,
        loaded: true,
      });
    } catch (e) {
      console.error("Failed to load filter data:", e);
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
