import { useTranslation } from "react-i18next";
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
  { to: "/", icon: LayoutDashboard, labelKey: "sidebar.dashboard" },
  { to: "/students", icon: Users, labelKey: "sidebar.students" },
  { to: "/grades", icon: ClipboardList, labelKey: "sidebar.grades" },
  { to: "/attendance", icon: CalendarCheck, labelKey: "sidebar.attendance" },
  { to: "/settings", icon: Settings, labelKey: "sidebar.settings" },
];

export default function Sidebar() {
  const { t } = useTranslation();

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
          title={t(item.labelKey)}
        >
          <item.icon className="w-5 h-5" />
        </NavLink>
      ))}
    </aside>
  );
}
