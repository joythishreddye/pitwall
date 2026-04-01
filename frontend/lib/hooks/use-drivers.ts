import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  DriverProfileSchema,
  DriverResultsResponseSchema,
  type DriverProfile,
  type DriverResultsResponse,
} from "@/lib/schemas/drivers";

export function useDriverProfile(driverRef: string) {
  return useQuery<DriverProfile>({
    queryKey: ["driver", driverRef],
    queryFn: async () => {
      const data = await api.get(`/api/v1/drivers/${driverRef}`);
      return DriverProfileSchema.parse(data);
    },
    enabled: driverRef.length > 0,
  });
}

export function useDriverResults(
  driverRef: string,
  season?: number,
  limit = 50,
  offset = 0,
) {
  return useQuery<DriverResultsResponse>({
    queryKey: ["driver-results", driverRef, season, limit, offset],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit, offset };
      if (season) params.season = season;
      const data = await api.get(`/api/v1/drivers/${driverRef}/results`, { params });
      return DriverResultsResponseSchema.parse(data);
    },
    enabled: driverRef.length > 0,
  });
}
