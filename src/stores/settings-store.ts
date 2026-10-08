import { create } from "zustand";

/// Sections of the Settings page. Shared between the top-bar burger menu
/// (which picks the section) and the Settings page (which renders it).
export type SettingsSection =
  "semesters" | "subjects" | "sections" | "data" | "profile";

export const SETTINGS_SECTIONS: SettingsSection[] = [
  "semesters",
  "subjects",
  "sections",
  "data",
  "profile",
];

interface SettingsState {
  section: SettingsSection;
  setSection: (section: SettingsSection) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  section: "semesters",
  setSection: (section) => set({ section }),
}));
