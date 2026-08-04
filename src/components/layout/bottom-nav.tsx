import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

export default function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="md:hidden border-t bg-card shrink-0 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
