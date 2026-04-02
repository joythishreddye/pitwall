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
  return z.array(OpenF1DriverSchema).parse(raw);
}

export function useDriverPhotos() {
  return useQuery<OpenF1Driver[]>({
    queryKey: ["openf1-driver-photos"],
    queryFn: fetchOpenF1Drivers,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function findHeadshotUrl(
  drivers: OpenF1Driver[] | undefined,
  opts: { surname?: string; number?: string | null },
): string | null {
  if (!drivers?.length) return null;

  if (opts.number) {
    const match = drivers.find(d => d.driver_number === Number(opts.number));
    if (match?.headshot_url) return match.headshot_url;
  }

  if (opts.surname) {
    const lower = opts.surname.toLowerCase();
    const match = drivers.find(d =>
      d.full_name.toLowerCase().includes(lower)
    );
    if (match?.headshot_url) return match.headshot_url;
  }

  return null;
}
