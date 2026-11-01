"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const AUTO_RETRY_SECONDS = 15;
const MAX_AUTO_RETRIES = 4;

/**
 * Shown when race data can't reach the page. Retries on its own a few times
 * with a visible countdown, then leaves the call to the reader.
 */
export function DataLinkDown({
  onRetry,
  isRetrying,
}: {
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const [attempts, setAttempts] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETRY_SECONDS);
  const autoRetrying = attempts < MAX_AUTO_RETRIES;

  useEffect(() => {
    if (!autoRetrying || isRetrying) return;
    const timer = setTimeout(() => {
      if (secondsLeft <= 1) {
        setAttempts((n) => n + 1);
        setSecondsLeft(AUTO_RETRY_SECONDS);
        onRetry();
      } else {
        setSecondsLeft((s) => s - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, autoRetrying, isRetrying, onRetry]);

  const retryNow = () => {
    setAttempts(0);
    setSecondsLeft(AUTO_RETRY_SECONDS);
    onRetry();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-xl rounded-sm border border-f1-grid border-l-2 border-l-f1-red bg-f1-dark-2 px-5 py-5"
    >
      <p className="flex items-center gap-2 font-data text-[10px] uppercase tracking-widest text-f1-red">
        <span className="h-1.5 w-1.5 rounded-full bg-f1-red" aria-hidden="true" />
        Data link lost
      </p>
      <p className="mt-2 text-sm text-f1-text">
        Race data isn&apos;t reaching the pit wall right now.
      </p>
      <p className="mt-1 text-xs text-f1-muted">
        {isRetrying ? (
          "Reconnecting…"
        ) : autoRetrying ? (
          <>
            Retrying in <span className="font-data">{secondsLeft}s</span>.
          </>
        ) : (
          "Still no signal. Try again in a minute."
        )}
      </p>
      <button
        type="button"
        onClick={retryNow}
        disabled={isRetrying}
        className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-f1-grid px-3 py-1.5 font-data text-[11px] uppercase tracking-wider text-f1-muted transition-colors duration-150 hover:border-f1-muted hover:text-f1-text disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
        Retry now
      </button>
    </div>
  );
}
