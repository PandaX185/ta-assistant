import { BrowserRouter, Routes, Route } from "react-router-dom";
import Shell from "@/components/layout/shell";
import Dashboard from "@/pages/dashboard";
import Students from "@/pages/students";
import Grades from "@/pages/grades";
import Attendance from "@/pages/attendance";
import Settings from "@/pages/settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="grades" element={<Grades />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
