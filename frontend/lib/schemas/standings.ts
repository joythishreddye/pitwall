import { z } from "zod/v4";

export const DriverStandingSchema = z.object({
  position: z.number(),
  points: z.number(),
  wins: z.number(),
  driver_id: z.number(),
  driver_ref: z.string(),
  forename: z.string(),
  surname: z.string(),
  nationality: z.string().nullable(),
  constructor_name: z.string().nullable(),
});

export const ConstructorStandingSchema = z.object({
  position: z.number(),
  points: z.number(),
  wins: z.number(),
  constructor_id: z.number(),
  constructor_ref: z.string(),
  name: z.string(),
  nationality: z.string().nullable(),
});

export const StandingsResponseSchema = z.object({
  season: z.number(),
  round: z.number(),
  driver_standings: z.array(DriverStandingSchema).nullable().optional(),
  constructor_standings: z.array(ConstructorStandingSchema).nullable().optional(),
});

export type DriverStanding = z.infer<typeof DriverStandingSchema>;
export type ConstructorStanding = z.infer<typeof ConstructorStandingSchema>;
export type StandingsResponse = z.infer<typeof StandingsResponseSchema>;
