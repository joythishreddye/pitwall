import { z } from "zod/v4";

const ConstructorBriefSchema = z.object({
  id: z.number(),
  ref: z.string(),
  name: z.string(),
  nationality: z.string().nullable(),
});

const CareerStatsSchema = z.object({
  races: z.number(),
  wins: z.number(),
  podiums: z.number(),
  poles: z.number(),
  points: z.number(),
  championships: z.number(),
});

export const DriverProfileSchema = z.object({
  id: z.number(),
  ref: z.string(),
  number: z.string().nullable(),
  code: z.string().nullable(),
  forename: z.string(),
  surname: z.string(),
  dob: z.string().nullable(),
  nationality: z.string().nullable(),
  url: z.string().nullable(),
  current_constructor: ConstructorBriefSchema.nullable(),
  career_stats: CareerStatsSchema,
});

export const DriverResultSchema = z.object({
  race_id: z.number(),
  race_name: z.string(),
  season: z.number(),
  round: z.number(),
  date: z.string().nullable(),
  constructor_name: z.string().nullable(),
  grid: z.number().nullable(),
  position: z.number().nullable(),
  position_text: z.string().nullable(),
  points: z.number().nullable(),
  laps: z.number().nullable(),
  status: z.string().nullable(),
  time_millis: z.number().nullable(),
  fastest_lap_rank: z.number().nullable(),
});

export const DriverResultsResponseSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  results: z.array(DriverResultSchema),
});

export type DriverProfile = z.infer<typeof DriverProfileSchema>;
export type DriverResult = z.infer<typeof DriverResultSchema>;
export type DriverResultsResponse = z.infer<typeof DriverResultsResponseSchema>;
