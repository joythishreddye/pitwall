import { ScannerLine } from "@/components/ui/scanner-line";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-8">
      {/* Status header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="h-2 w-2 rounded-full bg-f1-cyan animate-pulse-dot" />
        <p className="text-xs font-data text-f1-cyan tracking-widest uppercase">
          Fetching Data
        </p>
      </div>

      {/* Primary scanner line */}
      <ScannerLine />

      {/* Skeleton tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border border-f1-grid bg-f1-dark-2 p-5 overflow-hidden relative"
            aria-hidden="true"
          >
            <div className="h-3 w-24 bg-f1-grid/60 mb-3" />
            <div className="h-6 w-40 bg-f1-grid/40" />
            {/* Inner scanner */}
            <div className="absolute bottom-0 left-0 right-0">
              <ScannerLine />
            </div>
          </div>
        ))}
      </div>

      {/* Wide skeleton */}
      <div
        className="border border-f1-grid bg-f1-dark-2 p-5 mt-1 relative overflow-hidden"
        aria-hidden="true"
      >
        <div className="h-3 w-32 bg-f1-grid/60 mb-4" />
        <div className="h-32 bg-f1-grid/20" />
        <div className="absolute bottom-0 left-0 right-0">
          <ScannerLine />
        </div>
      </div>

      {/* Status footer */}
      <p className="text-[10px] font-data text-f1-muted tracking-wider mt-2">
        SYSTEM NOMINAL — LOADING RACE DATA
      </p>
    </div>
  );
}
