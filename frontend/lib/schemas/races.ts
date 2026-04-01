import { z } from "zod/v4";

// --- Race Calendar ---
const CircuitSchema = z.object({
  name: z.string(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});

export const RaceCalendarItemSchema = z.object({
  id: z.number(),
  season: z.number(),
  round: z.number(),
  name: z.string(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  url: z.string().nullable(),
  circuit: CircuitSchema,
});

export const RaceCalendarSchema = z.array(RaceCalendarItemSchema);

// --- Race Detail ---
const DriverBriefSchema = z.object({
  id: z.number(),
  ref: z.string(),
  forename: z.string(),
  surname: z.string(),
  code: z.string().nullable(),
  number: z.string().nullable(),
  nationality: z.string().nullable(),
});

const ConstructorBriefSchema = z.object({
  id: z.number(),
  ref: z.string(),
  name: z.string(),
  nationality: z.string().nullable(),
});

const RaceResultSchema = z.object({
  driver: DriverBriefSchema,
  constructor: ConstructorBriefSchema,
  grid: z.number().nullable(),
  position: z.number().nullable(),
  position_text: z.string().nullable(),
  points: z.number().nullable(),
  laps: z.number().nullable(),
  status: z.string().nullable(),
  time_millis: z.number().nullable(),
  fastest_lap_rank: z.number().nullable(),
});

const RaceDetailCircuitSchema = z.object({
  id: z.number(),
  name: z.string(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});

export const RaceDetailSchema = z.object({
  id: z.number(),
  season: z.number(),
  round: z.number(),
  name: z.string(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  url: z.string().nullable(),
  circuit: RaceDetailCircuitSchema,
  results: z.array(RaceResultSchema),
});

// --- Pit Stops / Strategy ---
const PitStopSchema = z.object({
  stop_number: z.number(),
  lap: z.number(),
  duration_ms: z.number().nullable(),
});

export const DriverStrategySchema = z.object({
  driver: DriverBriefSchema,
  pit_stops: z.array(PitStopSchema),
});

export const StrategyResponseSchema = z.array(DriverStrategySchema);

// --- Seasons ---
export const SeasonSchema = z.object({
  year: z.number(),
  race_count: z.number(),
});

export const SeasonsResponseSchema = z.array(SeasonSchema);

// Inferred types
export type RaceCalendarItem = z.infer<typeof RaceCalendarItemSchema>;
export type RaceDetail = z.infer<typeof RaceDetailSchema>;
export type RaceResult = z.infer<typeof RaceResultSchema>;
export type DriverStrategy = z.infer<typeof DriverStrategySchema>;
export type Season = z.infer<typeof SeasonSchema>;
