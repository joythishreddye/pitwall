import { Radio, Timer, Gauge, ThermometerSun } from "lucide-react";

const PANELS = [
  {
    icon: Radio,
    title: "Live Timing",
    description: "Real-time gaps, sector times, and position changes via F1 SignalR feed.",
    emptyState: "Connects to F1 SignalR during live sessions — next race data will appear here automatically",
  },
  {
    icon: Timer,
    title: "Lap-by-Lap",
    description: "Lap time progression for all drivers with stint and tyre compound indicators.",
    emptyState: "Lap time charts populate once a session starts — historical data viewable on race detail pages",
  },
  {
    icon: Gauge,
    title: "Tyre Strategy",
    description: "Current tyre age, compound, and predicted pit windows.",
    emptyState: "Tyre compound and degradation data stream in during race sessions",
  },
  {
    icon: ThermometerSun,
    title: "Weather & Track",
    description: "Live weather data, track temperature, and rain probability overlay.",
    emptyState: "Weather telemetry activates 2 hours before each session start",
  },
] as const;

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Live Dashboard
          </h1>
          <span className="flex items-center gap-1.5 text-xs font-mono text-f1-muted bg-f1-dark-2 border border-f1-grid px-2 py-0.5 rounded-sm">
            <span className="h-1.5 w-1.5 rounded-sm bg-f1-muted animate-pulse" />
            No session active
          </span>
        </div>
        <p className="text-f1-muted text-sm mt-1">
          Real-time race data and AI-generated insights
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-3xl">
        {PANELS.map(({ icon: Icon, title, description, emptyState }) => (
          <div
            key={title}
            className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4 text-f1-cyan" />
              <h3 className="font-semibold text-sm">{title}</h3>
            </div>
            <p className="text-xs text-f1-muted leading-relaxed">{description}</p>
            <div className="mt-4 h-24 border border-f1-grid/50 bg-f1-dark-3 rounded-sm flex items-center justify-center px-4">
              <span className="text-[11px] text-f1-muted/50 text-center leading-relaxed">
                {emptyState}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
