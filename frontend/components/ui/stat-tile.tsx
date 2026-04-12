import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string | number;
  /** Positive = green with +, negative = red with -, zero/undefined = hidden */
  delta?: number;
  /** Format function for delta display */
  formatDelta?: (value: number) => string;
  className?: string;
}

export function StatTile({
  label,
  value,
  delta,
  formatDelta,
  className,
}: StatTileProps) {
  const showDelta = delta !== undefined && delta !== 0;
  const deltaPositive = delta !== undefined && delta > 0;

  return (
    <div className={cn("min-w-[80px]", className)}>
      <span className="block text-xs uppercase tracking-widest text-f1-muted font-sans">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="font-data text-base text-f1-text">{value}</span>
        {showDelta && (
          <span
            className={cn(
              "font-data text-xs",
              deltaPositive ? "text-f1-green" : "text-f1-red"
            )}
          >
            {deltaPositive ? "+" : ""}
            {formatDelta ? formatDelta(delta!) : delta}
          </span>
        )}
      </div>
    </div>
  );
}
