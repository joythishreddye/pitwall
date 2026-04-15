import Link from "next/link";
import { Flag } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start justify-center min-h-[60vh] p-8 relative overflow-hidden">
      {/* Background: circuit grid SVG watermark */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        aria-hidden="true"
        style={{
          backgroundImage: `
            linear-gradient(to right, #E5E5E5 1px, transparent 1px),
            linear-gradient(to bottom, #E5E5E5 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
      />

      {/* DNF badge */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 border border-f1-red bg-f1-red/10 flex items-center justify-center shrink-0">
          <Flag className="h-4 w-4 text-f1-red" />
        </div>
        <div>
          <p className="text-[10px] font-data text-f1-red tracking-widest uppercase">
            404 — Did Not Finish
          </p>
          <h1 className="text-4xl font-heading font-bold text-f1-text tracking-tight leading-none">
            DNF
          </h1>
        </div>
      </div>

      {/* Message */}
      <div className="border border-f1-grid bg-f1-dark-2 p-4 mb-6 max-w-md">
        <p className="text-[10px] font-data text-f1-muted tracking-widest uppercase mb-1">
          Race Control
        </p>
        <p className="text-sm text-f1-text">
          This page did not finish the race. It may have been retired, moved, or never
          made it to the grid.
        </p>
      </div>

      {/* Telemetry lines */}
      <div className="space-y-1 mb-8 font-data text-[11px] text-f1-muted">
        <p>▸ Route not found in system</p>
        <p>▸ Safety car deployed</p>
        <p>▸ Race engineer recommends returning to home</p>
      </div>

      {/* Back to home */}
      <Link
        href="/"
        className="flex items-center gap-2 px-4 py-2 border border-f1-red bg-f1-red/10 text-f1-red text-sm font-data tracking-wide transition-colors duration-100 hover:bg-f1-red/20 cursor-pointer"
      >
        <Flag className="h-3.5 w-3.5" />
        RETURN TO PITS
      </Link>
    </div>
  );
}
