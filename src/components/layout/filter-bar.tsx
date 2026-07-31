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
    selectedSemesterYearId,
    selectedSubjectId,
    loaded,
    loadData,
    setSelectedSemesterYearId,
    setSelectedSubjectId,
  } = useFilterStore();

  useEffect(() => {
    if (!loaded) loadData();
  }, [loaded, loadData]);

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
      </div>
    </div>
  );
}
