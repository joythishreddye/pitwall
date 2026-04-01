"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/constants/season";
import {
  Trophy,
  Calendar,
  Users,
  MessageSquare,
  TrendingUp,
  LayoutDashboard,
  GraduationCap,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/standings", label: "Standings", icon: Trophy },
  { href: "/races", label: "Races", icon: Calendar },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/predictions", label: "Predictions", icon: TrendingUp },
  { href: "/dashboard", label: "Live", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/academy", label: "Academy", icon: GraduationCap },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-56 border-r border-f1-grid bg-f1-dark-2 flex flex-col">
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 px-4 py-5 border-b border-f1-grid"
      >
        <Flag className="h-5 w-5 text-f1-red" />
        <span className="text-base font-semibold tracking-tight">
          PitWall
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-150",
                isActive
                  ? "bg-f1-dark-3 text-f1-text border-l-2 border-f1-red"
                  : "text-f1-muted hover:text-f1-text hover:bg-f1-dark-3 border-l-2 border-transparent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-f1-grid">
        <p className="text-xs text-f1-muted">
          {CURRENT_SEASON} Season
        </p>
      </div>
    </aside>
  );
}
