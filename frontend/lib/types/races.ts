export interface Race {
  id: number;
  season: number;
  round: number;
  raceName: string;
  circuitName: string;
  country: string;
  locality: string;
  date: string;
  time?: string;
  winnerId?: string;
  winnerName?: string;
  winnerConstructor?: string;
}

export interface RaceResult {
  position: number;
  driverRef: string;
  givenName: string;
  familyName: string;
  constructorRef: string;
  constructorName: string;
  grid: number;
  laps: number;
  status: string;
  time?: string;
  points: number;
  fastestLapRank?: number;
  fastestLapTime?: string;
}

export interface LapTime {
  lap: number;
  driverRef: string;
  position: number;
  time: string;
}

export interface PitStop {
  lap: number;
  driverRef: string;
  driverName: string;
  duration: string;
  stop: number;
}
