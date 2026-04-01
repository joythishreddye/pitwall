export interface DriverStanding {
  position: number;
  driverRef: string;
  givenName: string;
  familyName: string;
  constructorRef: string;
  constructorName: string;
  points: number;
  wins: number;
}

export interface ConstructorStanding {
  position: number;
  constructorRef: string;
  constructorName: string;
  points: number;
  wins: number;
}
