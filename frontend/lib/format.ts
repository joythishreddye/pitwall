/** Format milliseconds as lap time: 1:23.456 */
export function formatLapTime(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "\u2014";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
  }
  return seconds.toFixed(3);
}

/** Format gap: +1.234s or winner time */
export function formatGap(
  ms: number | null | undefined,
  winnerMs: number | null | undefined,
  status: string | null | undefined,
): string {
  if (status === "Finished" && ms != null && winnerMs != null && ms > winnerMs) {
    const gap = (ms - winnerMs) / 1000;
    return `+${gap.toFixed(3)}s`;
  }
  if (status && status !== "Finished") return status;
  if (ms != null) return formatLapTime(ms);
  return "\u2014";
}

/** Format pit stop duration: 22.4s */
export function formatPitDuration(ms: number | null | undefined): string {
  if (ms == null) return "\u2014";
  return `${(ms / 1000).toFixed(1)}s`;
}
