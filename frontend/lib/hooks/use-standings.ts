import { useQuery } from "@tanstack/react-query";
import { z } from "zod/v4";
import { api } from "@/lib/api-client";
import {
  StandingsResponseSchema,
  DriverProgressionSchema,
  type StandingsResponse,
  type DriverProgression,
} from "@/lib/schemas/standings";

export function useStandings(year: number, type?: "driver" | "constructor") {
  return useQuery<StandingsResponse>({
    queryKey: ["standings", year, type],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (type) params.type = type;
      const data = await api.get(`/api/v1/standings/${year}`, { params });
      return StandingsResponseSchema.parse(data);
    },
  });
}

export function useStandingsProgression(year: number) {
  return useQuery<DriverProgression[]>({
    queryKey: ["standings-progression", year],
    queryFn: async () => {
      const data = await api.get(`/api/v1/standings/${year}/progression`);
      return z.array(DriverProgressionSchema).parse(data);
    },
  });
}
