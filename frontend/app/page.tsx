import Link from "next/link";
import { Trophy, Calendar, TrendingUp, MessageSquare } from "lucide-react";

const QUICK_LINKS = [
  {
    href: "/standings",
    label: "Standings",
    description: "Championship points",
    icon: Trophy,
  },
  {
    href: "/races",
    label: "Race Calendar",
    description: "2026 schedule & results",
    icon: Calendar,
  },
  {
    href: "/predictions",
    label: "Predictions",
    description: "AI race forecasts",
    icon: TrendingUp,
  },
  {
    href: "/chat",
    label: "Race Companion",
    description: "Ask anything about F1",
    icon: MessageSquare,
  },
] as const;

export default function HomePage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">PitWall</h1>
        <p className="text-f1-muted mt-1 text-sm">
          Your AI race engineer. Predictions, live data, and deep F1 analysis.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-2xl">
        {QUICK_LINKS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group border border-f1-grid bg-f1-dark-2 p-4 rounded-sm transition-colors duration-150 hover:border-f1-red/50"
          >
            <div className="flex items-center gap-3 mb-2">
              <Icon className="h-4 w-4 text-f1-muted group-hover:text-f1-red transition-colors duration-150" />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="text-xs text-f1-muted">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
