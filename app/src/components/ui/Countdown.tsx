import { fmtCountdown } from "../../lib/format";
import { useClock } from "../../hooks/useClock";

export function Countdown({
  targetSec,
  label,
  className = "",
}: {
  targetSec: number;
  label?: string;
  className?: string;
}) {
  const now = useClock();
  const remaining = Math.max(0, targetSec - now);

  return (
    <span className={`font-mono tabular-nums text-sm ${className}`}>
      {label && <span className="text-slate-400 text-xs mr-1">{label}</span>}
      {fmtCountdown(remaining)}
    </span>
  );
}
