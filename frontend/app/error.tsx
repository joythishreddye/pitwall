"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Log to error reporting in production
    if (process.env.NODE_ENV !== "development") return;
    console.error("[PitWall Error Boundary]", error);
  }, [error]);

  const errorCode = error.digest ?? "ERR_UNKNOWN";

  return (
    <div className="flex flex-col items-start justify-center min-h-[60vh] p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 border border-f1-red bg-f1-red/10 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 text-f1-red" />
        </div>
        <div>
          <p className="text-[10px] font-data text-f1-red tracking-widest uppercase">
            System Fault
          </p>
          <h1 className="text-xl font-heading font-bold text-f1-text tracking-tight leading-none">
            SYSTEM MALFUNCTION
          </h1>
        </div>
      </div>

      {/* Error code block */}
      <div className="border border-f1-grid bg-f1-dark-2 p-4 mb-6 w-full max-w-lg">
        <p className="text-[10px] font-data text-f1-muted tracking-widest uppercase mb-2">
          Fault Code
        </p>
        <p className="font-data text-sm text-f1-red">{errorCode}</p>
        {error.message && (
          <>
            <div className="h-px bg-f1-grid my-3" />
            <p className="text-[10px] font-data text-f1-muted tracking-widest uppercase mb-1">
              Message
            </p>
            <p className="font-data text-xs text-f1-muted break-all">{error.message}</p>
          </>
        )}
      </div>

      {/* Status lines */}
      <div className="space-y-1 mb-8 font-data text-[11px] text-f1-muted">
        <p>▸ Race engineer has been notified</p>
        <p>▸ Attempting system recovery</p>
        <p>▸ If problem persists, return to home</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => unstable_retry()}
          className="flex items-center gap-2 px-4 py-2 border border-f1-red bg-f1-red/10 text-f1-red text-sm font-data tracking-wide transition-colors duration-100 hover:bg-f1-red/20 cursor-pointer"
          aria-label="Retry loading the page"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          RETRY
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 border border-f1-grid bg-f1-dark-2 text-f1-muted text-sm font-data tracking-wide transition-colors duration-100 hover:bg-f1-dark-3 hover:text-f1-text cursor-pointer"
        >
          RETURN HOME
        </Link>
      </div>
    </div>
  );
}
