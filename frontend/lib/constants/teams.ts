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
  "kick_sauber": "var(--color-team-sauber)",
  "haas": "var(--color-team-haas)",
  // Display name variants (from API constructor_name field)
  "alpine_f1_team": "var(--color-team-alpine)",
  "haas_f1_team": "var(--color-team-haas)",
  "rb_f1_team": "var(--color-team-rb)",
  "aston_martin_aramco_cognizant_f1_team": "var(--color-team-aston-martin)",
  "stake_f1_team_kick_sauber": "var(--color-team-sauber)",
  // Historical teams
  "alphatauri": "var(--color-team-rb)",
  "alfa_romeo": "var(--color-team-sauber)",
  "racing_point": "var(--color-team-aston-martin)",
  "renault": "var(--color-team-alpine)",
  "toro_rosso": "var(--color-team-rb)",
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

/** Hex color map for use in gradients/rgba where CSS variables don't work */
const TEAM_HEX: Record<string, string> = {
  "red_bull": "#3671C6",
  "mercedes": "#27F4D2",
  "ferrari": "#E8002D",
  "mclaren": "#FF8000",
  "aston_martin": "#229971",
  "alpine": "#FF87BC",
  "williams": "#64C4FF",
  "rb": "#6692FF",
  "sauber": "#52E252",
  "haas": "#B6BABD",
};

export function getTeamHexColor(constructorRef: string): string {
  const normalized = constructorRef.toLowerCase().replace(/[\s-]+/g, "_");
  const cssVar = TEAM_CSS_VARS[normalized];
  if (cssVar) {
    const canonical = Object.keys(TEAM_HEX).find(k => TEAM_CSS_VARS[k] === cssVar);
    if (canonical) return TEAM_HEX[canonical];
  }
  return "#A3A3A3";
}
