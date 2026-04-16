"use client";

import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { ChampionshipChart } from "@/components/championship-chart";
import type { DriverProgression } from "@/lib/schemas/standings";

interface ChartPreviewProps {
  progressions: DriverProgression[];
}

export function ChartPreview({ progressions }: ChartPreviewProps) {
  return (
    <div className="bg-f1-dark-2 border border-f1-grid">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-f1-grid">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-f1-muted" />
          <span className="text-xs text-f1-muted uppercase tracking-widest">Championship Progression</span>
        </div>
        <Link
          href="/standings"
          className="flex items-center gap-1 text-xs text-f1-cyan font-data hover:text-f1-text transition-colors duration-100 cursor-pointer"
        >
          View Full <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Chart */}
      <div className="p-4">
        <ChampionshipChart progressions={progressions} compact />
      </div>
    </div>
  );
}
