import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CalendarCheck,
  FolderOpen,
  Settings,
} from "lucide-react";

export const navItems = [
  { to: "/", icon: LayoutDashboard, labelKey: "sidebar.dashboard" },
  { to: "/students", icon: Users, labelKey: "sidebar.students" },
  { to: "/grades", icon: ClipboardList, labelKey: "sidebar.grades" },
  { to: "/attendance", icon: CalendarCheck, labelKey: "sidebar.attendance" },
  { to: "/materials", icon: FolderOpen, labelKey: "sidebar.materials" },
  { to: "/settings", icon: Settings, labelKey: "sidebar.settings" },
];
