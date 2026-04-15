"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { cn } from "@/lib/utils";

// Map of path segment → display label
const SEGMENT_LABELS: Record<string, string> = {
  "": "Home",
  standings: "Standings",
  races: "Races",
  drivers: "Drivers",
  predictions: "Predictions",
  dashboard: "Live Dashboard",
  chat: "Chat",
  academy: "Academy",
};

interface Crumb {
  label: string;
  href: string;
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Home", href: "/" }];

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];

  segments.forEach((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    // Use label map for known segments, otherwise title-case the segment
    const label =
      SEGMENT_LABELS[seg] ??
      seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href });
  });

  return crumbs;
}

export function Topbar() {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-10 px-4 border-b border-f1-grid bg-f1-dark/90 backdrop-blur-[2px]">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 text-f1-muted/50 shrink-0" aria-hidden />
                )}
                {isLast ? (
                  <span
                    className="text-xs font-data text-f1-text tracking-wide"
                    aria-current="page"
                  >
                    {crumb.label.toUpperCase()}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className={cn(
                      "text-xs font-data text-f1-muted tracking-wide transition-colors duration-100 hover:text-f1-text cursor-pointer",
                      i === 0 && "text-f1-muted"
                    )}
                  >
                    {crumb.label.toUpperCase()}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Season indicator */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-f1-green animate-pulse-dot" />
          <span className="text-[10px] font-data text-f1-muted tracking-widest uppercase">
            {CURRENT_SEASON} Season
          </span>
        </div>
      </div>
    </header>
  );
}
