/** Maps constructor refs to CSS variable references defined in globals.css */
const TEAM_CSS_VARS: Record<string, string> = {
  "red_bull": "var(--color-team-red-bull)",
  "mercedes": "var(--color-team-mercedes)",
  "ferrari": "var(--color-team-ferrari)",
  "mclaren": "var(--color-team-mclaren)",
  "aston_martin": "var(--color-team-aston-martin)",
  "alpine": "var(--color-team-alpine)",
  "williams": "var(--color-team-williams)",
  "rb": "var(--color-team-rb)",
  "sauber": "var(--color-team-sauber)",
  "haas": "var(--color-team-haas)",
} as const;

export const TEAM_NAMES: Record<string, string> = {
  "red_bull": "Red Bull Racing",
  "mercedes": "Mercedes-AMG Petronas",
  "ferrari": "Scuderia Ferrari",
  "mclaren": "McLaren F1 Team",
  "aston_martin": "Aston Martin Aramco",
  "alpine": "Alpine F1 Team",
  "williams": "Williams Racing",
  "rb": "Visa Cash App RB",
  "sauber": "Stake F1 Team Kick Sauber",
  "haas": "MoneyGram Haas F1 Team",
} as const;

export function getTeamColor(constructorRef: string): string {
  const normalized = constructorRef.toLowerCase().replace(/[\s-]+/g, "_");
  return TEAM_CSS_VARS[normalized] ?? "var(--color-f1-muted)";
}
