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

// ---------------------------------------------------------------------------
// Circuit SVG path data for DrawPath animations
// Each path is a single-stroke, single <path> element tracing the circuit
// layout. Used as ambient backgrounds at low opacity — recognisable shape
// is the goal, not cartographic accuracy.
// ---------------------------------------------------------------------------

export interface CircuitPath {
  /** SVG path data — a single continuous stroke */
  d: string;
  /** SVG viewBox string */
  viewBox: string;
  /** Human-readable circuit name */
  name: string;
}

export const circuitPaths: Record<string, CircuitPath> = {
  // ── Suzuka — figure-of-eight with tight esses ──────────────────────────
  suzuka: {
    name: "Suzuka Circuit",
    viewBox: "0 0 220 180",
    d: "M110,90 C120,85 140,80 155,75 C170,70 185,72 192,82 C200,95 195,112 185,120 C175,128 160,130 148,124 C136,118 128,104 118,100 C108,96 92,96 82,100 C72,104 62,112 55,122 C48,132 45,145 50,155 C56,165 70,170 84,168 C98,166 108,158 112,148 C116,138 112,126 108,118 C104,110 98,104 95,96 C92,88 93,76 100,70 C107,64 118,64 126,70 C134,76 136,86 130,92 C124,98 112,98 108,94 C104,90 106,84 110,82",
  },

  // ── Spa-Francorchamps — long lap with Eau Rouge ────────────────────────
  spa: {
    name: "Circuit de Spa-Francorchamps",
    viewBox: "0 0 240 160",
    d: "M30,80 L60,60 C70,52 80,48 92,48 C104,48 116,54 120,64 C124,74 118,86 108,90 C98,94 86,90 78,84 C70,78 68,68 72,60 C76,52 88,48 100,52 L140,68 C155,75 168,82 178,78 C188,74 196,62 200,50 C204,38 202,24 194,16 C186,8 174,8 164,14 C154,20 148,32 146,44 L144,80 C143,92 148,104 158,110 C168,116 180,116 190,110 L210,96 C220,88 224,76 218,66",
  },

  // ── Monza — fast oval with chicanes ───────────────────────────────────
  monza: {
    name: "Autodromo Nazionale Monza",
    viewBox: "0 0 200 180",
    d: "M40,90 C40,60 55,30 80,20 C105,10 135,20 150,40 C165,60 162,90 148,108 C140,118 128,124 114,124 C108,124 102,122 98,118 C94,114 92,108 96,104 C100,100 108,100 112,104 C116,108 114,116 108,118 C102,120 94,116 90,110 C86,104 88,96 94,92 L130,75 C145,68 155,58 154,46 C153,34 142,26 130,26 C118,26 108,34 104,44 C100,54 104,66 112,72 L160,90 C168,94 172,104 168,114 C164,124 154,130 142,130 C130,130 120,122 116,112 C112,102 116,90 124,84",
  },

  // ── Monaco — tight street circuit ─────────────────────────────────────
  monaco: {
    name: "Circuit de Monaco",
    viewBox: "0 0 180 200",
    d: "M90,20 C110,20 130,28 140,44 C150,60 148,80 138,94 C128,108 112,116 96,120 L80,124 C68,128 58,136 54,148 C50,160 54,174 64,182 C74,190 88,192 100,188 C112,184 120,174 122,162 C124,150 118,138 108,132 L90,122 C78,115 70,104 68,92 C66,80 70,68 78,60 C86,52 98,48 108,52 C118,56 124,66 122,76 C120,86 112,93 102,94 C92,95 83,88 82,78 C81,68 88,60 96,58 C104,56 112,62 114,70",
  },

  // ── Silverstone — classic British layout ──────────────────────────────
  silverstone: {
    name: "Silverstone Circuit",
    viewBox: "0 0 240 200",
    d: "M60,100 C60,70 70,45 90,30 C110,15 136,15 155,28 C174,41 182,65 180,88 L178,120 C177,136 184,150 196,158 C208,166 220,162 226,152 C232,142 228,128 218,122 C208,116 196,120 190,130 L178,155 C170,170 155,180 138,182 C121,184 106,176 96,164 C86,152 83,136 88,122 C93,108 104,98 116,94 C128,90 140,94 148,102 C156,110 158,122 152,132 C146,142 134,146 124,142 C114,138 108,128 110,118 C112,108 120,102 128,103",
  },

  // ── Circuit of the Americas — US circuit ──────────────────────────────
  americas: {
    name: "Circuit of the Americas",
    viewBox: "0 0 220 200",
    d: "M110,20 L140,20 C158,20 172,32 176,48 C180,64 172,80 158,87 L130,98 C118,104 110,116 110,130 C110,144 118,156 130,162 L160,172 C172,178 180,190 178,202 C176,214 164,220 152,218 C140,216 132,206 130,194 L126,170 C124,158 116,148 104,145 C92,142 80,148 74,158 C68,168 70,182 78,190 C86,198 98,200 108,196 C118,192 124,182 122,172 L116,140 C115,128 120,116 130,110 C140,104 152,108 158,118 C164,128 160,140 150,146",
  },

  // ── Interlagos (Brazil) — flowing left-handers ─────────────────────────
  interlagos: {
    name: "Autódromo José Carlos Pace",
    viewBox: "0 0 200 180",
    d: "M100,20 C120,18 140,26 150,42 C160,58 158,78 146,90 C134,102 116,106 100,102 C84,98 72,86 68,72 L60,48 C56,36 48,26 36,22 C24,18 12,24 8,36 C4,48 10,62 22,68 C34,74 48,70 56,60 L80,34 C88,24 98,18 110,18 L140,24 C155,28 166,40 168,54 C170,68 162,82 150,88 L120,100 C108,106 100,118 100,132 C100,146 108,158 120,164 L150,172 C162,178 168,190 164,202",
  },

  // ── Baku — long straight street circuit ───────────────────────────────
  baku: {
    name: "Baku City Circuit",
    viewBox: "0 0 200 220",
    d: "M100,20 L160,20 C172,20 180,28 180,40 C180,52 172,60 160,62 L130,64 C118,66 110,74 108,86 L104,130 C102,142 108,154 118,160 C128,166 140,164 148,156 C156,148 158,136 152,126 C146,116 134,112 124,116 C114,120 108,130 110,142 L116,165 C120,178 116,192 106,200 C96,208 82,208 72,200 C62,192 58,178 62,166 L70,140 C74,128 70,114 60,108 C50,102 38,106 32,116 C26,126 28,140 38,146 C48,152 60,148 66,138 L80,112 C86,100 84,86 76,78 C68,70 56,68 46,72",
  },

  // ── Yas Marina — modern Gulf circuit ──────────────────────────────────
  yas_marina: {
    name: "Yas Marina Circuit",
    viewBox: "0 0 240 180",
    d: "M30,90 L80,40 C90,30 104,26 118,28 C132,30 144,38 150,50 L170,88 C176,100 186,108 198,110 C210,112 220,104 222,92 C224,80 216,68 204,66 L176,64 C164,64 154,72 150,84 L142,110 C138,122 128,130 116,132 C104,134 92,128 86,118 L68,96 C60,84 46,78 32,80 C18,82 8,92 8,106 C8,120 18,130 32,132 C46,134 58,126 62,114",
  },

  // ── Marina Bay (Singapore) — night street circuit ──────────────────────
  marina_bay: {
    name: "Marina Bay Street Circuit",
    viewBox: "0 0 220 200",
    d: "M110,20 L160,20 C174,20 184,30 184,44 C184,58 174,68 160,70 L130,72 C118,73 108,80 104,92 L96,120 C92,132 82,140 70,142 C58,144 46,136 42,124 C38,112 42,98 52,92 L80,78 C90,72 96,62 94,50 C92,38 82,30 70,30 C58,30 48,38 44,50 L36,80 C32,92 34,106 42,116 C50,126 62,130 74,128 C86,126 95,118 98,106 L106,76 C110,64 120,56 132,54 L162,50 C176,48 185,58 184,72 C183,86 172,95 158,96 L130,98 C118,100 110,108 106,120 L98,152 C94,164 84,172 72,174 C60,176 48,170 42,160",
  },

  // ── Bahrain — desert circuit ───────────────────────────────────────────
  bahrain: {
    name: "Bahrain International Circuit",
    viewBox: "0 0 220 180",
    d: "M110,20 C130,18 152,26 162,44 C172,62 168,84 154,96 L130,112 C118,120 112,132 114,146 C116,160 126,170 138,172 C150,174 162,166 164,154 C166,142 158,130 146,128 C134,126 122,134 120,146 L118,165 C116,178 106,188 92,190 C78,192 64,182 60,168 C56,154 62,138 74,130 L100,118 C112,110 118,96 114,82 C110,68 98,58 84,56 C70,54 56,60 50,72 C44,84 46,100 56,108 C66,116 80,114 88,104 C96,94 94,80 84,74 C74,68 62,72 56,80",
  },

  // ── Jeddah — high-speed Saudi street circuit ───────────────────────────
  jeddah: {
    name: "Jeddah Corniche Circuit",
    viewBox: "0 0 180 240",
    d: "M90,20 L140,20 C152,20 160,28 160,40 C160,52 152,60 140,62 L110,64 C98,66 90,74 88,86 L82,130 C80,142 72,152 60,156 C48,160 36,154 30,142 C24,130 28,116 38,110 L70,94 C80,88 86,78 84,66 C82,54 72,46 60,46 C48,46 38,54 36,66 L32,100 C30,112 36,124 46,130 C56,136 68,132 74,122 L88,100 C94,90 94,78 88,70 C82,62 72,60 64,64",
  },

  // ── Shanghai — unique layout with long back straight ──────────────────
  shanghai: {
    name: "Shanghai International Circuit",
    viewBox: "0 0 230 190",
    d: "M115,20 C138,18 162,28 172,50 C182,72 174,98 154,108 L120,120 C105,127 96,142 98,158 C100,174 112,184 126,184 C140,184 152,174 154,160 L158,130 C162,116 174,106 188,104 C202,102 214,112 216,126 C218,140 210,154 196,158 L165,165 C150,169 140,180 140,196 M100,96 C88,90 78,78 76,64 C74,50 80,36 92,28 C104,20 120,20 130,28 C140,36 144,50 138,62 C132,74 120,80 108,78 C96,76 88,66 90,54",
  },

  // ── Albert Park — Melbourne street/park circuit ────────────────────────
  albert_park: {
    name: "Albert Park Circuit",
    viewBox: "0 0 210 190",
    d: "M105,20 C128,18 150,30 158,52 C166,74 156,98 136,108 L108,118 C92,124 82,138 82,154 C82,170 92,182 106,184 C120,186 133,177 136,163 L142,140 C146,126 156,116 168,112 C180,108 192,114 196,126 C200,138 194,152 182,156 L155,162 C142,167 132,178 130,192 M80,106 C68,98 60,84 62,70 C64,56 74,44 88,40 C102,36 116,42 122,54 C128,66 124,80 114,86 C104,92 92,88 86,78 C80,68 82,56 90,50",
  },

  // ── Red Bull Ring — compact Austrian layout ───────────────────────────
  red_bull_ring: {
    name: "Red Bull Ring",
    viewBox: "0 0 180 160",
    d: "M90,20 C110,18 130,28 136,48 C142,68 132,90 112,98 L80,106 C64,112 56,126 60,142 C64,158 78,168 94,166 C110,164 120,150 118,134 C116,118 104,108 90,110 C76,112 66,124 68,138 L72,158 C74,172 66,186 52,190 C38,194 24,184 20,170 C16,156 22,140 34,134 L60,122 C72,115 78,102 74,88 C70,74 58,64 44,64 C30,64 18,74 16,88 C14,102 22,116 34,120",
  },

  // ── Zandvoort — Dutch banking circuit ─────────────────────────────────
  zandvoort: {
    name: "Circuit Zandvoort",
    viewBox: "0 0 190 180",
    d: "M95,20 C116,18 138,28 146,50 C154,72 142,96 120,104 L90,112 C72,118 62,134 64,152 C66,170 80,182 96,180 C112,178 122,164 120,148 C118,132 106,122 92,124 C78,126 68,138 70,154 L74,172 C76,186 68,200 54,204 C40,208 26,198 22,184 C18,170 24,154 36,148 L62,136 C74,129 80,116 76,102 C72,88 60,78 46,78 C32,78 20,88 18,102 C16,116 24,130 36,134",
  },

  // ── Hungaroring — twisty Hungarian circuit ────────────────────────────
  hungaroring: {
    name: "Hungaroring",
    viewBox: "0 0 210 180",
    d: "M105,20 C128,18 150,32 156,56 C162,80 148,104 124,112 L90,120 C72,126 62,142 66,160 C70,178 86,188 104,184 C122,180 130,163 124,146 L110,120 C104,108 108,94 120,88 C132,82 146,88 150,100 C154,112 148,126 136,130 L108,136 C94,140 86,152 88,166 C90,180 100,190 112,190 C124,190 134,182 136,170 L140,148 C144,134 154,124 166,120 C178,116 190,122 194,134 C198,146 192,160 180,164",
  },

  // ── Losail (Qatar) — floodlit desert circuit ──────────────────────────
  losail: {
    name: "Lusail International Circuit",
    viewBox: "0 0 200 190",
    d: "M100,20 C122,18 144,30 152,52 C160,74 150,98 128,106 L95,114 C76,120 66,138 70,158 C74,178 92,190 112,186 C132,182 142,162 136,142 L126,118 C122,106 128,92 140,88 C152,84 164,92 166,104 C168,116 160,128 148,130 L120,134 C106,137 96,148 94,162 C92,176 98,190 110,195",
  },

  // ── Rodriguez (Mexico City) — high-altitude circuit ───────────────────
  rodriguez: {
    name: "Autodromo Hermanos Rodriguez",
    viewBox: "0 0 220 180",
    d: "M110,20 C133,18 156,30 162,54 C168,78 154,102 130,110 L95,118 C76,124 65,140 68,158 C71,176 88,186 106,182 C124,178 132,161 126,144 L115,118 C110,106 115,92 128,88 C141,84 154,92 156,105 C158,118 150,130 137,132 L108,136 C93,139 83,152 84,167 C85,182 96,192 110,192 C124,192 134,183 136,169 L140,145 C144,131 156,121 170,119 C184,117 196,127 198,141 C200,155 190,167 176,169",
  },

  // ── Vegas — night street circuit on the strip ─────────────────────────
  vegas: {
    name: "Las Vegas Street Circuit",
    viewBox: "0 0 210 200",
    d: "M35,100 L35,40 C35,28 43,20 55,20 L155,20 C167,20 175,28 175,40 L175,160 C175,172 167,180 155,180 L100,180 C88,180 80,172 80,160 L80,120 C80,108 88,100 100,100 L155,100",
  },

  // ── Imola — classic Italian circuit ───────────────────────────────────
  imola: {
    name: "Autodromo Enzo e Dino Ferrari",
    viewBox: "0 0 200 190",
    d: "M100,20 C122,18 144,30 150,52 C156,74 144,96 122,104 L90,112 C72,118 62,132 64,148 C66,164 78,174 92,172 C106,170 114,156 110,142 L98,118 C92,106 96,92 108,88 C120,84 132,92 134,104 C136,116 128,128 116,130 L86,134 C70,138 60,152 62,168 C64,184 78,195 94,193",
  },

  // ── Villeneuve (Canada) — island circuit ──────────────────────────────
  villeneuve: {
    name: "Circuit Gilles Villeneuve",
    viewBox: "0 0 200 190",
    d: "M100,20 L160,20 C172,20 180,28 180,40 L180,150 C180,162 172,170 160,170 L120,170 C108,170 100,162 100,150 L100,100 L40,100 C28,100 20,92 20,80 L20,40 C20,28 28,20 40,20 L100,20",
  },

  // ── Catalunya (Spain) — testing circuit ───────────────────────────────
  catalunya: {
    name: "Circuit de Barcelona-Catalunya",
    viewBox: "0 0 220 180",
    d: "M110,20 C134,18 158,30 164,54 C170,78 156,104 132,110 L95,118 C76,124 65,140 68,158 C71,176 88,187 107,183 C126,179 134,162 128,145 L117,118 C112,106 118,92 131,88 C144,84 157,93 158,107 C159,121 149,133 135,134 L105,136 C90,138 80,150 82,164 C84,178 96,188 110,187",
  },

  // ── Miami — stadium-wrapped temporary circuit ─────────────────────────
  miami: {
    name: "Miami International Autodrome",
    viewBox: "0 0 220 200",
    d: "M30,100 L30,45 C30,32 38,24 50,22 L80,20 C92,18 102,26 104,38 L106,58 C108,70 118,78 130,78 L170,78 C184,78 192,88 190,102 L188,130 C186,144 174,152 160,150 L140,148 C126,146 116,136 116,122 C116,108 126,98 140,98 L165,98 C177,98 185,106 183,118 L178,145 C174,160 160,168 145,165 L80,158 C60,155 44,140 36,122 L30,100",
  },
};

// ---------------------------------------------------------------------------

/** Match circuit by name substring (e.g. "Albert Park Grand Prix Circuit" matches "albert_park") */
export function getCircuitMeta(circuitName: string): (CircuitMeta & { key: string }) | undefined {
  const lower = circuitName.toLowerCase();
  for (const [key, meta] of Object.entries(CIRCUIT_META)) {
    const words = key.split("_");
    if (words.every(w => lower.includes(w))) return { ...meta, key };
  }
  return undefined;
}
