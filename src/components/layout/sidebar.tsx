import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

export default function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="hidden md:flex w-16 border-r bg-card flex-col items-center py-4 gap-2 shrink-0">
      <div className="text-base font-bold mb-4 tracking-tight" title="TA Assistant">
        TA
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
