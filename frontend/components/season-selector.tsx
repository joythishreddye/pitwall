"use client";

import { useSeasons } from "@/lib/hooks/use-races";

export function SeasonSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (year: number) => void;
}) {
  const { data: seasons } = useSeasons();

  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Select season"
      className="bg-f1-dark-2 border border-f1-grid text-f1-text text-sm font-mono px-3 py-1.5 rounded-sm cursor-pointer hover:border-f1-muted/50 transition-colors duration-150 focus:outline-none focus:border-f1-red"
    >
      {seasons
        ? seasons.map((s) => (
            <option key={s.year} value={s.year}>
              {s.year} ({s.race_count} races)
            </option>
          ))
        : <option value={value}>{value}</option>
      }
    </select>
  );
}
