import { TrendingUp, Zap, Shuffle } from "lucide-react";

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Race Predictions",
    description: "LightGBM learning-to-rank model trained on historical qualifying, race pace, weather, and circuit data.",
    status: "Phase 2",
  },
  {
    icon: Zap,
    title: "Qualifying Predictions",
    description: "Predict qualifying order using practice session pace, sector times, and track evolution.",
    status: "Phase 2",
  },
  {
    icon: Shuffle,
    title: "Championship Simulation",
    description: "Monte Carlo simulation projecting championship outcomes across remaining races.",
    status: "Phase 2",
  },
] as const;

export default function PredictionsPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Predictive Intelligence
        </h1>
        <p className="text-f1-muted text-sm mt-1">
          ML-powered race and championship predictions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl">
        {FEATURES.map(({ icon: Icon, title, description, status }) => (
          <div
            key={title}
            className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <Icon className="h-5 w-5 text-f1-muted" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-f1-yellow bg-f1-yellow/10 px-2 py-0.5 rounded-sm">
                {status}
              </span>
            </div>
            <h3 className="font-semibold text-sm mb-1">{title}</h3>
            <p className="text-xs text-f1-muted leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
