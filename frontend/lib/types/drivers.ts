export interface Driver {
  driverRef: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string;
  permanentNumber: number;
  constructorRef: string;
  constructorName: string;
  championships: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  points: number;
}

export interface DriverResult {
  season: number;
  round: number;
  raceName: string;
  date: string;
  grid: number;
  position: number;
  points: number;
  status: string;
}
