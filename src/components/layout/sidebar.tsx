import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CalendarCheck,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/students", icon: Users, label: "Students" },
  { to: "/grades", icon: ClipboardList, label: "Grades" },
  { to: "/attendance", icon: CalendarCheck, label: "Attendance" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-16 border-r bg-card flex flex-col items-center py-4 gap-2">
      <div className="text-lg font-bold mb-4" title="TA Assistant">
        🐼
      </div>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )
          }
          title={item.label}
        >
          <item.icon className="w-5 h-5" />
        </NavLink>
      ))}
    </aside>
  );
}
