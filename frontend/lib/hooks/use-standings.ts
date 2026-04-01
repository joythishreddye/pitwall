import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { StandingsResponseSchema, type StandingsResponse } from "@/lib/schemas/standings";

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
