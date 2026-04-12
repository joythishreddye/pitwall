import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Team color for left accent border (CSS variable string, e.g. "var(--color-team-ferrari)") */
  teamColor?: string;
  /** Compact padding (12px instead of 16px) */
  compact?: boolean;
}

export function Card({
  className,
  teamColor,
  compact,
  style,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-f1-dark-2 border border-f1-grid",
        "transition-[background-color,box-shadow] duration-100 ease-out",
        "hover:bg-f1-dark-3 hover:shadow-[inset_0_0_20px_rgba(229,229,229,0.03)]",
        compact ? "p-3" : "p-4",
        className
      )}
      style={{
        borderLeftWidth: teamColor ? 2 : undefined,
        borderLeftColor: teamColor ?? undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
