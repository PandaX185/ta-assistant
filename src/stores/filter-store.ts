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

export interface FilterState {
  semesterYears: SemesterYear[];
  subjects: Subject[];
  selectedSemesterYearId: string | null;
  selectedSubjectId: string | null;
  loaded: boolean;
  loadData: () => Promise<void>;
  setSelectedSemesterYearId: (id: string | null) => void;
  setSelectedSubjectId: (id: string | null) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  semesterYears: [],
  subjects: [],
  selectedSemesterYearId: null,
  selectedSubjectId: null,
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

  setSelectedSemesterYearId: (id) => set({ selectedSemesterYearId: id }),
  setSelectedSubjectId: (id) => set({ selectedSubjectId: id }),
}));
