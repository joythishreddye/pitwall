import type { Driver, DriverResult } from "@/lib/types/drivers";

export const MOCK_DRIVERS: Record<string, Driver> = {
  verstappen: {
    driverRef: "verstappen", givenName: "Max", familyName: "Verstappen",
    dateOfBirth: "1997-09-30", nationality: "Dutch", permanentNumber: 1,
    constructorRef: "red_bull", constructorName: "Red Bull Racing",
    championships: 4, wins: 63, podiums: 111, poles: 40, fastestLaps: 33, points: 2926,
  },
  norris: {
    driverRef: "norris", givenName: "Lando", familyName: "Norris",
    dateOfBirth: "1999-11-13", nationality: "British", permanentNumber: 4,
    constructorRef: "mclaren", constructorName: "McLaren",
    championships: 0, wins: 4, podiums: 26, poles: 8, fastestLaps: 9, points: 874,
  },
  leclerc: {
    driverRef: "leclerc", givenName: "Charles", familyName: "Leclerc",
    dateOfBirth: "1997-10-16", nationality: "Monegasque", permanentNumber: 16,
    constructorRef: "ferrari", constructorName: "Ferrari",
    championships: 0, wins: 8, podiums: 39, poles: 25, fastestLaps: 10, points: 1192,
  },
  hamilton: {
    driverRef: "hamilton", givenName: "Lewis", familyName: "Hamilton",
    dateOfBirth: "1985-01-07", nationality: "British", permanentNumber: 44,
    constructorRef: "ferrari", constructorName: "Ferrari",
    championships: 7, wins: 105, podiums: 201, poles: 104, fastestLaps: 67, points: 4829,
  },
  sainz: {
    driverRef: "sainz", givenName: "Carlos", familyName: "Sainz",
    dateOfBirth: "1994-09-01", nationality: "Spanish", permanentNumber: 55,
    constructorRef: "ferrari", constructorName: "Ferrari",
    championships: 0, wins: 4, podiums: 25, poles: 6, fastestLaps: 4, points: 972,
  },
  piastri: {
    driverRef: "piastri", givenName: "Oscar", familyName: "Piastri",
    dateOfBirth: "2001-04-06", nationality: "Australian", permanentNumber: 81,
    constructorRef: "mclaren", constructorName: "McLaren",
    championships: 0, wins: 2, podiums: 12, poles: 3, fastestLaps: 2, points: 382,
  },
  russell: {
    driverRef: "russell", givenName: "George", familyName: "Russell",
    dateOfBirth: "1998-02-15", nationality: "British", permanentNumber: 63,
    constructorRef: "mercedes", constructorName: "Mercedes",
    championships: 0, wins: 3, podiums: 18, poles: 5, fastestLaps: 8, points: 610,
  },
  perez: {
    driverRef: "perez", givenName: "Sergio", familyName: "Perez",
    dateOfBirth: "1990-01-26", nationality: "Mexican", permanentNumber: 11,
    constructorRef: "red_bull", constructorName: "Red Bull Racing",
    championships: 0, wins: 6, podiums: 39, poles: 3, fastestLaps: 11, points: 1498,
  },
  alonso: {
    driverRef: "alonso", givenName: "Fernando", familyName: "Alonso",
    dateOfBirth: "1981-07-29", nationality: "Spanish", permanentNumber: 14,
    constructorRef: "aston_martin", constructorName: "Aston Martin",
    championships: 2, wins: 32, podiums: 106, poles: 22, fastestLaps: 24, points: 2267,
  },
};

export const MOCK_DRIVER_RESULTS: DriverResult[] = [
  { season: 2024, round: 1, raceName: "Bahrain Grand Prix", date: "2024-03-02", grid: 1, position: 1, points: 26, status: "Finished" },
  { season: 2024, round: 2, raceName: "Saudi Arabian Grand Prix", date: "2024-03-09", grid: 1, position: 1, points: 25, status: "Finished" },
  { season: 2024, round: 3, raceName: "Australian Grand Prix", date: "2024-03-24", grid: 1, position: 5, points: 10, status: "Finished" },
  { season: 2024, round: 4, raceName: "Japanese Grand Prix", date: "2024-04-07", grid: 1, position: 1, points: 25, status: "Finished" },
  { season: 2024, round: 5, raceName: "Chinese Grand Prix", date: "2024-04-21", grid: 1, position: 1, points: 26, status: "Finished" },
  { season: 2024, round: 6, raceName: "Miami Grand Prix", date: "2024-05-05", grid: 1, position: 2, points: 18, status: "Finished" },
  { season: 2024, round: 7, raceName: "Emilia Romagna Grand Prix", date: "2024-05-19", grid: 1, position: 1, points: 25, status: "Finished" },
  { season: 2024, round: 8, raceName: "Monaco Grand Prix", date: "2024-05-26", grid: 6, position: 6, points: 8, status: "Finished" },
  { season: 2024, round: 9, raceName: "Canadian Grand Prix", date: "2024-06-09", grid: 1, position: 1, points: 25, status: "Finished" },
  { season: 2024, round: 10, raceName: "Spanish Grand Prix", date: "2024-06-23", grid: 1, position: 1, points: 25, status: "Finished" },
];
