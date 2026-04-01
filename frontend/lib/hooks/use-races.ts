import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  RaceCalendarSchema,
  RaceDetailSchema,
  StrategyResponseSchema,
  SeasonsResponseSchema,
  type RaceCalendarItem,
  type RaceDetail,
  type DriverStrategy,
  type Season,
} from "@/lib/schemas/races";

export function useSeasons() {
  return useQuery<Season[]>({
    queryKey: ["seasons"],
    queryFn: async () => {
      const data = await api.get("/api/v1/seasons");
      return SeasonsResponseSchema.parse(data);
    },
  });
}

export function useRaceCalendar(year: number) {
  return useQuery<RaceCalendarItem[]>({
    queryKey: ["races", year],
    queryFn: async () => {
      const data = await api.get(`/api/v1/seasons/${year}/races`);
      return RaceCalendarSchema.parse(data);
    },
  });
}

export function useRaceDetail(raceId: number) {
  return useQuery<RaceDetail>({
    queryKey: ["race", raceId],
    queryFn: async () => {
      const data = await api.get(`/api/v1/races/${raceId}`);
      return RaceDetailSchema.parse(data);
    },
    enabled: raceId > 0,
  });
}

export function useRaceStrategy(raceId: number) {
  return useQuery<DriverStrategy[]>({
    queryKey: ["race-strategy", raceId],
    queryFn: async () => {
      const data = await api.get(`/api/v1/races/${raceId}/strategy`);
      return StrategyResponseSchema.parse(data);
    },
    enabled: raceId > 0,
  });
}
