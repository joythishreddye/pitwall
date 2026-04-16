import { useQuery } from "@tanstack/react-query";
import { z } from "zod/v4";

const OpenF1DriverSchema = z.object({
  driver_number: z.number(),
  name_acronym: z.string(),
  full_name: z.string(),
  headshot_url: z.string().nullable(),
});

export type OpenF1Driver = z.infer<typeof OpenF1DriverSchema>;

async function fetchOpenF1Drivers(): Promise<OpenF1Driver[]> {
  const res = await fetch(
    "https://api.openf1.org/v1/drivers?session_key=latest"
  );
  if (!res.ok) return [];
  const raw = await res.json();
  // OpenF1 returns {"detail":"No results found."} (not an array) on empty results
  if (!Array.isArray(raw)) return [];
  return z.array(OpenF1DriverSchema).parse(raw);
}

export function useDriverPhotos() {
  return useQuery<OpenF1Driver[]>({
    queryKey: ["openf1-driver-photos"],
    queryFn: fetchOpenF1Drivers,
    staleTime: 60 * 60 * 1000, // 1 hour — headshots update mid-season
    retry: 1,
  });
}

/**
 * Maps Jolpica/DB constructor_ref → F1 CDN 2026 team slug.
 * Used to build the season-specific headshot URL format.
 */
const F1_TEAM_SLUG: Record<string, string> = {
  red_bull: "redbullracing",
  mercedes: "mercedes",
  ferrari: "ferrari",
  mclaren: "mclaren",
  aston_martin: "astonmartin",
  alpine: "alpine",
  williams: "williams",
  rb: "racingbulls",
  audi: "audi",
  cadillac: "cadillac",
  haas: "haasf1team",
};

/**
 * Extract the 8-char F1 driver code from an OpenF1 headshot URL.
 * e.g. ".../SERPER01_Sergio_Perez/serper01.png.transform/..." → "serper01"
 */
function extractDriverCode(headshotUrl: string): string | null {
  const match = headshotUrl.match(/\/([a-z]{3,8}\d{2})\.png/);
  return match?.[1] ?? null;
}

/**
 * Build the official F1 CDN 2026 driver headshot URL.
 * These are team-specific and always show the correct season jersey.
 */
function build2026HeadshotUrl(driverCode: string, teamSlug: string): string {
  const base = "https://media.formula1.com/image/upload";
  const opts = "c_lfill,w_592/q_auto";
  const fallback = "d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp";
  const version = "v1740000001";
  const path = `common/f1/2026/${teamSlug}/${driverCode}/2026${teamSlug}${driverCode}right.webp`;
  return `${base}/${opts}/${fallback}/${version}/${path}`;
}

/**
 * Strip Unicode diacritics for accent-insensitive matching.
 * "Hülkenberg" → "hulkenberg", "Pérez" → "perez"
 */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Find a driver headshot URL from the OpenF1 drivers list.
 *
 * When constructorRef is supplied, builds a 2026-specific F1 CDN URL
 * (which shows the correct current-season jersey). Falls back to the
 * raw OpenF1 headshot URL if the team slug or driver code can't be resolved.
 *
 * Match priority:
 *   1. name_acronym (3-letter code e.g. "NOR") — exact, most reliable
 *   2. surname — normalized for diacritics, substring of full_name
 */
export function findHeadshotUrl(
  drivers: OpenF1Driver[] | undefined,
  opts: {
    surname?: string;
    /** 3-letter driver code (e.g. "NOR"). Takes priority over surname. */
    acronym?: string | null;
    /** DB constructor_ref (e.g. "cadillac"). Used to build 2026 team URL. */
    constructorRef?: string | null;
  },
): string | null {
  if (!drivers?.length) return null;

  let matched: OpenF1Driver | undefined;

  // 1. Acronym match — exact and season-safe
  if (opts.acronym) {
    const upper = opts.acronym.toUpperCase();
    matched = drivers.find((d) => d.name_acronym.toUpperCase() === upper);
  }

  // 2. Surname match — normalized to handle diacritics (Hülkenberg, Pérez, etc.)
  if (!matched && opts.surname) {
    const needle = normalizeForMatch(opts.surname);
    matched = drivers.find((d) =>
      normalizeForMatch(d.full_name).includes(needle)
    );
  }

  if (!matched?.headshot_url) return null;

  // Build 2026 team-specific URL when we have the constructor ref.
  // This is the only way to get the correct jersey — the F1 CDN 2026
  // format embeds the team slug in the path.
  if (opts.constructorRef) {
    const teamSlug = F1_TEAM_SLUG[opts.constructorRef];
    const driverCode = extractDriverCode(matched.headshot_url);
    if (teamSlug && driverCode) {
      return build2026HeadshotUrl(driverCode, teamSlug);
    }
  }

  // Fallback: use OpenF1 URL as-is (may show previous team jersey)
  return matched.headshot_url.replace("/1col/", "/4col/").replace("/2col/", "/4col/");
}
