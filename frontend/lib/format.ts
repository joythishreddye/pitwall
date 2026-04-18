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

/** Position color class: gold for P1, silver for P2, bronze for P3 */
export function positionColor(pos: number | null): string {
  if (pos === 1) return "text-f1-gold";
  if (pos === 2) return "text-f1-silver";
  if (pos === 3) return "text-f1-bronze";
  return "text-f1-muted";
}

/** Format pit stop duration: 22.4s */
export function formatPitDuration(ms: number | null | undefined): string {
  if (ms == null) return "\u2014";
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Strip common LLM markdown syntax so AI responses render as clean prose.
 * Handles bold, italic, headers, inline code, and horizontal rules.
 * Preserves newlines and list numbering — just removes the decoration.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Headers: ## Heading → Heading
      .replace(/^#{1,6}\s+/gm, "")
      // Bold+italic: ***text*** or ___text___ ([^] matches newlines without /s flag)
      .replace(/\*{3}([^]*?)\*{3}/g, "$1")
      .replace(/_{3}([^]*?)_{3}/g, "$1")
      // Bold: **text** or __text__
      .replace(/\*{2}([^]*?)\*{2}/g, "$1")
      .replace(/_{2}([^]*?)_{2}/g, "$1")
      // Italic: *text* or _text_ (not inside words)
      .replace(/(^|[\s(])\*([^*\n]+)\*($|[\s)])/gm, "$1$2$3")
      .replace(/(^|[\s(])_([^_\n]+)_($|[\s)])/gm, "$1$2$3")
      // Inline code: `code`
      .replace(/`([^`]+)`/g, "$1")
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // Leading list markers: - item or * item (keep numbered lists: 1. item)
      .replace(/^[*\-]\s+/gm, "")
      // Trailing whitespace per line
      .replace(/[ \t]+$/gm, "")
      // Collapse 3+ consecutive blank lines to 2
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Format laps behind race leader: +1 Lap, +2 Laps, etc. */
export function formatLapsDown(
  driverLaps: number | null | undefined,
  winnerLaps: number | null | undefined,
): string {
  if (driverLaps == null || winnerLaps == null) return "\u2014";
  const diff = winnerLaps - driverLaps;
  if (diff <= 0) return "\u2014";
  return diff === 1 ? "+1 Lap" : `+${diff} Laps`;
}
