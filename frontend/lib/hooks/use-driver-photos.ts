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
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
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
 * Returns the OpenF1 headshot URL directly (head-and-shoulders shot),
 * upgraded to 4-column resolution for better quality.
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

  // Upgrade to 4-column resolution for better quality
  return matched.headshot_url.replace("/1col/", "/4col/").replace("/2col/", "/4col/");
}
