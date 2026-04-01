import type { DriverStanding, ConstructorStanding } from "@/lib/types/standings";

export const MOCK_DRIVER_STANDINGS: DriverStanding[] = [
  { position: 1, driverRef: "verstappen", givenName: "Max", familyName: "Verstappen", constructorRef: "red_bull", constructorName: "Red Bull Racing", points: 437, wins: 9 },
  { position: 2, driverRef: "norris", givenName: "Lando", familyName: "Norris", constructorRef: "mclaren", constructorName: "McLaren", points: 374, wins: 4 },
  { position: 3, driverRef: "leclerc", givenName: "Charles", familyName: "Leclerc", constructorRef: "ferrari", constructorName: "Ferrari", points: 356, wins: 3 },
  { position: 4, driverRef: "piastri", givenName: "Oscar", familyName: "Piastri", constructorRef: "mclaren", constructorName: "McLaren", points: 292, wins: 2 },
  { position: 5, driverRef: "sainz", givenName: "Carlos", familyName: "Sainz", constructorRef: "ferrari", constructorName: "Ferrari", points: 290, wins: 3 },
  { position: 6, driverRef: "hamilton", givenName: "Lewis", familyName: "Hamilton", constructorRef: "ferrari", constructorName: "Ferrari", points: 245, wins: 2 },
  { position: 7, driverRef: "russell", givenName: "George", familyName: "Russell", constructorRef: "mercedes", constructorName: "Mercedes", points: 235, wins: 2 },
  { position: 8, driverRef: "perez", givenName: "Sergio", familyName: "Perez", constructorRef: "red_bull", constructorName: "Red Bull Racing", points: 152, wins: 0 },
  { position: 9, driverRef: "alonso", givenName: "Fernando", familyName: "Alonso", constructorRef: "aston_martin", constructorName: "Aston Martin", points: 70, wins: 0 },
  { position: 10, driverRef: "stroll", givenName: "Lance", familyName: "Stroll", constructorRef: "aston_martin", constructorName: "Aston Martin", points: 24, wins: 0 },
  { position: 11, driverRef: "hulkenberg", givenName: "Nico", familyName: "Hulkenberg", constructorRef: "haas", constructorName: "Haas", points: 41, wins: 0 },
  { position: 12, driverRef: "tsunoda", givenName: "Yuki", familyName: "Tsunoda", constructorRef: "rb", constructorName: "RB", points: 30, wins: 0 },
  { position: 13, driverRef: "gasly", givenName: "Pierre", familyName: "Gasly", constructorRef: "alpine", constructorName: "Alpine", points: 26, wins: 0 },
  { position: 14, driverRef: "ocon", givenName: "Esteban", familyName: "Ocon", constructorRef: "alpine", constructorName: "Alpine", points: 23, wins: 0 },
  { position: 15, driverRef: "magnussen", givenName: "Kevin", familyName: "Magnussen", constructorRef: "haas", constructorName: "Haas", points: 16, wins: 0 },
  { position: 16, driverRef: "albon", givenName: "Alexander", familyName: "Albon", constructorRef: "williams", constructorName: "Williams", points: 12, wins: 0 },
  { position: 17, driverRef: "ricciardo", givenName: "Daniel", familyName: "Ricciardo", constructorRef: "rb", constructorName: "RB", points: 12, wins: 0 },
  { position: 18, driverRef: "bottas", givenName: "Valtteri", familyName: "Bottas", constructorRef: "sauber", constructorName: "Kick Sauber", points: 0, wins: 0 },
  { position: 19, driverRef: "zhou", givenName: "Guanyu", familyName: "Zhou", constructorRef: "sauber", constructorName: "Kick Sauber", points: 0, wins: 0 },
  { position: 20, driverRef: "sargeant", givenName: "Logan", familyName: "Sargeant", constructorRef: "williams", constructorName: "Williams", points: 0, wins: 0 },
];

export const MOCK_CONSTRUCTOR_STANDINGS: ConstructorStanding[] = [
  { position: 1, constructorRef: "mclaren", constructorName: "McLaren", points: 666, wins: 6 },
  { position: 2, constructorRef: "ferrari", constructorName: "Ferrari", points: 652, wins: 8 },
  { position: 3, constructorRef: "red_bull", constructorName: "Red Bull Racing", points: 589, wins: 9 },
  { position: 4, constructorRef: "mercedes", constructorName: "Mercedes", points: 425, wins: 2 },
  { position: 5, constructorRef: "aston_martin", constructorName: "Aston Martin", points: 94, wins: 0 },
  { position: 6, constructorRef: "haas", constructorName: "Haas", points: 57, wins: 0 },
  { position: 7, constructorRef: "rb", constructorName: "RB", points: 46, wins: 0 },
  { position: 8, constructorRef: "alpine", constructorName: "Alpine", points: 49, wins: 0 },
  { position: 9, constructorRef: "williams", constructorName: "Williams", points: 12, wins: 0 },
  { position: 10, constructorRef: "sauber", constructorName: "Kick Sauber", points: 0, wins: 0 },
];
