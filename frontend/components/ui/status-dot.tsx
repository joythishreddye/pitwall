import { cn } from "@/lib/utils";

type StatusDotVariant = "live" | "alert" | "caution" | "offline";

const VARIANT_CLASSES: Record<StatusDotVariant, string> = {
  live: "bg-f1-green shadow-[0_0_6px_rgba(0,255,0,0.6)]",
  alert: "bg-f1-red shadow-[0_0_6px_rgba(220,0,0,0.6)]",
  caution: "bg-f1-yellow shadow-[0_0_6px_rgba(255,237,0,0.6)]",
  offline: "bg-f1-muted",
};

interface StatusDotProps {
  variant?: StatusDotVariant;
  /** Enable pulse animation (for live/active states) */
  pulse?: boolean;
  className?: string;
}

export function StatusDot({
  variant = "offline",
  pulse = false,
  className,
}: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        VARIANT_CLASSES[variant],
        pulse && variant !== "offline" && "animate-pulse-dot",
        className
      )}
      aria-hidden="true"
    />
  );
}
