"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/constants/season";
import {
  Home,
  Trophy,
  Calendar,
  Users,
  MessageSquare,
  TrendingUp,
  LayoutDashboard,
  GraduationCap,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", shortLabel: "Home", icon: Home },
  { href: "/standings", label: "Standings", shortLabel: "Stand.", icon: Trophy },
  { href: "/races", label: "Races", shortLabel: "Races", icon: Calendar },
  { href: "/drivers", label: "Drivers", shortLabel: "Drivers", icon: Users },
  { href: "/predictions", label: "Predictions", shortLabel: "Predict", icon: TrendingUp },
  { href: "/dashboard", label: "Live", shortLabel: "Live", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", shortLabel: "Chat", icon: MessageSquare },
  { href: "/academy", label: "Academy", shortLabel: "Academy", icon: GraduationCap },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// ── Desktop sidebar ────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-30 h-screen w-56 border-r border-f1-grid bg-f1-dark-2 flex-col hidden md:flex">
        {/* Logo / wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2.5 px-4 py-4 border-b border-f1-grid group"
          aria-label="PitWall home"
        >
          {/* Glyph mark */}
          <div className="flex h-7 w-7 items-center justify-center border border-f1-red bg-f1-red/10 shrink-0">
            <Radio className="h-3.5 w-3.5 text-f1-red" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold tracking-tight font-heading">PITWALL</p>
            <p className="text-[10px] text-f1-muted font-data tracking-widest mt-0.5">AI RACE ENGINEER</p>
          </div>
        </Link>

        {/* Nav section label */}
        <div className="px-4 pt-4 pb-1">
          <p className="text-[10px] font-data text-f1-muted tracking-widest uppercase">Navigation</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-1 space-y-px overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-100 cursor-pointer border-l-2",
                  active
                    ? "bg-f1-dark-3 text-f1-text border-f1-red"
                    : "text-f1-muted hover:text-f1-text hover:bg-f1-dark-3 border-transparent"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-100",
                    active ? "text-f1-red" : "text-f1-muted group-hover:text-f1-text"
                  )}
                />
                <span className="truncate">{label}</span>
                {/* Active indicator dot */}
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-f1-red shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-f1-grid space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-f1-green animate-pulse-dot shrink-0" />
            <p className="text-[10px] font-data text-f1-muted tracking-wider uppercase">
              {CURRENT_SEASON} Season · Live
            </p>
          </div>
          <p className="text-[10px] text-f1-muted/50 font-data">F1 Data Platform v1.5</p>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <MobileTabBar pathname={pathname} />
    </>
  );
}

// ── Mobile bottom tab bar ──────────────────────────────────────────────────────

function MobileTabBar({ pathname }: { pathname: string }) {
  // Show only the most important 5 items on mobile
  const mobileItems = NAV_ITEMS.slice(0, 5);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden border-t border-f1-grid bg-f1-dark-2"
      aria-label="Mobile navigation"
    >
      {mobileItems.map(({ href, shortLabel, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[52px] transition-colors duration-100 cursor-pointer",
              active ? "text-f1-red" : "text-f1-muted"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={cn(
              "text-[10px] font-data tracking-wide",
              active ? "text-f1-red" : "text-f1-muted"
            )}>
              {shortLabel}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
