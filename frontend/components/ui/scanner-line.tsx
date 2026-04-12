import { cn } from "@/lib/utils";

interface ScannerLineProps {
  className?: string;
}

export function ScannerLine({ className }: ScannerLineProps) {
  return (
    <div
      className={cn("relative h-px w-full overflow-hidden", className)}
    >
      <div className="scanner-line absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-f1-cyan/80 to-transparent" />
    </div>
  );
}
