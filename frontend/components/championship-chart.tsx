"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getTeamColor } from "@/lib/constants/teams";
import type { DriverProgression } from "@/lib/schemas/standings";

interface ChartDataPoint {
  round: number;
  [driverRef: string]: number;
}

function buildChartData(progressions: DriverProgression[]): ChartDataPoint[] {
  if (progressions.length === 0) return [];

  const maxRound = Math.max(...progressions.flatMap(p => p.rounds));
  const data: ChartDataPoint[] = [];

  for (let r = 1; r <= maxRound; r++) {
    const point: ChartDataPoint = { round: r };
    for (const p of progressions) {
      const idx = p.rounds.indexOf(r);
      point[p.driver_ref] = idx >= 0 ? p.points[idx] : (data[data.length - 1]?.[p.driver_ref] ?? 0);
    }
    data.push(point);
  }

  return data;
}

export function ChampionshipChart({
  progressions,
}: {
  progressions: DriverProgression[];
}) {
  const data = buildChartData(progressions);

  if (data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-f1-muted text-sm">
        No progression data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 10, right: 60, bottom: 5, left: 5 }}>
        <CartesianGrid stroke="var(--color-f1-grid)" strokeDasharray="3 3" />
        <XAxis
          dataKey="round"
          tick={{ fill: "var(--color-f1-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--color-f1-grid)" }}
          tickLine={false}
          label={{ value: "Round", position: "insideBottomRight", offset: -5, fill: "var(--color-f1-muted)", fontSize: 10 }}
        />
        <YAxis
          tick={{ fill: "var(--color-f1-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--color-f1-grid)" }}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-f1-dark-2)",
            border: "1px solid var(--color-f1-grid)",
            borderRadius: "2px",
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-f1-muted)", fontFamily: "var(--font-mono)" }}
          itemStyle={{ fontFamily: "var(--font-mono)" }}
          labelFormatter={(label) => `Round ${label}`}
        />
        {progressions.map((p) => (
          <Line
            key={p.driver_ref}
            type="monotone"
            dataKey={p.driver_ref}
            name={p.surname}
            stroke={getTeamColor(p.constructor_ref)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
