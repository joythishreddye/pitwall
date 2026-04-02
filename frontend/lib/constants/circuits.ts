/** Static circuit metadata for display on race detail pages */
export interface CircuitMeta {
  lengthKm: number;
  turns: number;
  drsZones: number;
  lapRecord?: { time: string; driver: string; year: number };
}

export const CIRCUIT_META: Record<string, CircuitMeta> = {
  "albert_park": { lengthKm: 5.278, turns: 14, drsZones: 4, lapRecord: { time: "1:19.813", driver: "Leclerc", year: 2024 } },
  "bahrain": { lengthKm: 5.412, turns: 15, drsZones: 3, lapRecord: { time: "1:31.447", driver: "de la Rosa", year: 2005 } },
  "jeddah": { lengthKm: 6.174, turns: 27, drsZones: 3, lapRecord: { time: "1:30.734", driver: "Hamilton", year: 2021 } },
  "shanghai": { lengthKm: 5.451, turns: 16, drsZones: 2, lapRecord: { time: "1:32.238", driver: "M. Schumacher", year: 2004 } },
  "miami": { lengthKm: 5.412, turns: 19, drsZones: 3, lapRecord: { time: "1:29.708", driver: "Verstappen", year: 2023 } },
  "imola": { lengthKm: 4.909, turns: 19, drsZones: 2, lapRecord: { time: "1:15.484", driver: "Hamilton", year: 2020 } },
  "monaco": { lengthKm: 3.337, turns: 19, drsZones: 1, lapRecord: { time: "1:12.909", driver: "Hamilton", year: 2021 } },
  "villeneuve": { lengthKm: 4.361, turns: 14, drsZones: 2, lapRecord: { time: "1:13.078", driver: "Bottas", year: 2019 } },
  "catalunya": { lengthKm: 4.675, turns: 16, drsZones: 2, lapRecord: { time: "1:16.330", driver: "Verstappen", year: 2023 } },
  "red_bull_ring": { lengthKm: 4.318, turns: 10, drsZones: 3, lapRecord: { time: "1:05.619", driver: "Sainz", year: 2020 } },
  "silverstone": { lengthKm: 5.891, turns: 18, drsZones: 2, lapRecord: { time: "1:27.097", driver: "Verstappen", year: 2020 } },
  "hungaroring": { lengthKm: 4.381, turns: 14, drsZones: 2, lapRecord: { time: "1:16.627", driver: "Hamilton", year: 2020 } },
  "spa": { lengthKm: 7.004, turns: 19, drsZones: 2, lapRecord: { time: "1:46.286", driver: "Bottas", year: 2018 } },
  "zandvoort": { lengthKm: 4.259, turns: 14, drsZones: 2, lapRecord: { time: "1:11.097", driver: "Hamilton", year: 2021 } },
  "monza": { lengthKm: 5.793, turns: 11, drsZones: 2, lapRecord: { time: "1:21.046", driver: "Barrichello", year: 2004 } },
  "baku": { lengthKm: 6.003, turns: 20, drsZones: 2, lapRecord: { time: "1:43.009", driver: "Leclerc", year: 2019 } },
  "marina_bay": { lengthKm: 4.940, turns: 19, drsZones: 3, lapRecord: { time: "1:35.867", driver: "Hamilton", year: 2023 } },
  "suzuka": { lengthKm: 5.807, turns: 18, drsZones: 2, lapRecord: { time: "1:30.983", driver: "Hamilton", year: 2019 } },
  "losail": { lengthKm: 5.419, turns: 16, drsZones: 2, lapRecord: { time: "1:24.319", driver: "Verstappen", year: 2023 } },
  "americas": { lengthKm: 5.513, turns: 20, drsZones: 2, lapRecord: { time: "1:36.169", driver: "Leclerc", year: 2019 } },
  "rodriguez": { lengthKm: 4.304, turns: 17, drsZones: 3, lapRecord: { time: "1:17.774", driver: "Bottas", year: 2021 } },
  "interlagos": { lengthKm: 4.309, turns: 15, drsZones: 2, lapRecord: { time: "1:10.540", driver: "Bottas", year: 2018 } },
  "vegas": { lengthKm: 6.201, turns: 17, drsZones: 2, lapRecord: { time: "1:35.490", driver: "Piastri", year: 2024 } },
  "yas_marina": { lengthKm: 5.281, turns: 16, drsZones: 2, lapRecord: { time: "1:26.103", driver: "Verstappen", year: 2021 } },
};

/** Match circuit by name substring (e.g. "Albert Park Grand Prix Circuit" matches "albert_park") */
export function getCircuitMeta(circuitName: string): CircuitMeta | undefined {
  const lower = circuitName.toLowerCase();
  for (const [key, meta] of Object.entries(CIRCUIT_META)) {
    const words = key.split("_");
    if (words.every(w => lower.includes(w))) return meta;
  }
  return undefined;
}
