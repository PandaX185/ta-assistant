import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

/**
 * Mobile bottom navigation: exactly 5 tabs, with a sliding highlight bubble.
 * The outer track transitions (glides) between slots while the keyed bubble
 * replays a springy pop on every tab change; icons bounce via icon-pop.
 * RTL flips the slide direction because the grid itself is mirrored.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const rtl = document.documentElement.dir === "rtl";

  const activeIndex = navItems.findIndex((item) => {
    if (item.to === "/") return pathname === "/";
    return pathname.startsWith(item.to);
  });
  const slide = (activeIndex >= 0 ? activeIndex : 0) * (rtl ? -100 : 100);

  return (
    <nav className="md:hidden border-t bg-card shrink-0 pb-[env(safe-area-inset-bottom)]">
      <div className="relative grid grid-cols-5">
        {/* Sliding highlight bubble */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 start-0 w-1/5 p-1 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          style={{ transform: `translateX(${slide}%)` }}
        >
          <span
            key={activeIndex}
            className="block w-full h-full rounded-full bg-primary/10 motion-safe:animate-nav-bubble"
          />
        </span>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "relative z-10 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-primary [&>svg]:motion-safe:animate-icon-pop"
                  : "text-muted-foreground hover:text-foreground"
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
