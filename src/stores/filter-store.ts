import { create } from "zustand";

export interface FilterState {
  year: number | null;
  semester: string | null;
  subjectId: string | null;
  setYear: (year: number | null) => void;
  setSemester: (semester: string | null) => void;
  setSubjectId: (subjectId: string | null) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  year: null,
  semester: null,
  subjectId: null,
  setYear: (year) => set({ year }),
  setSemester: (semester) => set({ semester }),
  setSubjectId: (subjectId) => set({ subjectId }),
  reset: () => set({ year: null, semester: null, subjectId: null }),
}));
