import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CalendarCheck,
  Settings,
} from "lucide-react";

export const navItems = [
  { to: "/", icon: LayoutDashboard, labelKey: "sidebar.dashboard" },
  { to: "/students", icon: Users, labelKey: "sidebar.students" },
  { to: "/grades", icon: ClipboardList, labelKey: "sidebar.grades" },
  { to: "/attendance", icon: CalendarCheck, labelKey: "sidebar.attendance" },
  { to: "/settings", icon: Settings, labelKey: "sidebar.settings" },
];
