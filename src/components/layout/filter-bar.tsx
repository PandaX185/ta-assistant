import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilterStore } from "@/stores/filter-store";

export default function FilterBar() {
  const {
    semesterYears,
    subjects,
    sections,
    selectedSemesterYearId,
    selectedSubjectId,
    selectedSectionId,
    loaded,
    loadData,
    loadSections,
    setSelectedSemesterYearId,
    setSelectedSubjectId,
    setSelectedSectionId,
  } = useFilterStore();

  useEffect(() => {
    if (!loaded) loadData();
  }, [loaded, loadData]);

  // Reload sections whenever the semester/subject scope changes.
  // loadSections auto-selects when only one section exists and keeps the
  // current selection when it's still valid.
  useEffect(() => {
    loadSections();
  }, [selectedSemesterYearId, selectedSubjectId, loaded, loadSections]);

  return (
    <div className="h-11 border-b bg-muted/30 flex items-center gap-3 px-4 shrink-0">
      <div className="flex items-center gap-2 text-sm flex-1">
        {/* Semester/Year dropdown */}
        <Select
          value={selectedSemesterYearId ?? ""}
          onValueChange={(val) => {
            setSelectedSemesterYearId(val || null);
            setSelectedSubjectId(null);
          }}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Semester / Year" />
          </SelectTrigger>
          <SelectContent>
            {semesterYears.length === 0 && (
              <SelectItem value="__placeholder" disabled>
                No semesters yet — create one in Settings
              </SelectItem>
            )}
            {semesterYears.map((sy) => (
              <SelectItem key={sy.id} value={sy.id}>
                {sy.year} {sy.semester}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Subject dropdown */}
        <Select
          value={selectedSubjectId ?? ""}
          onValueChange={(val) => setSelectedSubjectId(val || null)}
        >
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Subject" />
          </SelectTrigger>
          <SelectContent>
            {subjects.length === 0 && (
              <SelectItem value="__placeholder" disabled>
                No subjects yet
              </SelectItem>
            )}
            {subjects.map((sub) => (
              <SelectItem key={sub.id} value={sub.id}>
                {sub.code ? `[${sub.code}] ` : ""}
                {sub.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Section dropdown — only meaningful once semester + subject are set */}
        {selectedSemesterYearId && selectedSubjectId && (
          <Select
            value={selectedSectionId ?? ""}
            onValueChange={(val) => setSelectedSectionId(val || null)}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              {sections.length === 0 && (
                <SelectItem value="__placeholder" disabled>
                  No sections yet
                </SelectItem>
              )}
              {sections.map((sec) => (
                <SelectItem key={sec.id} value={sec.id}>
                  {sec.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
