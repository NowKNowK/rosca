import { useEffect, useRef, useState } from "react";

// Returns current Unix timestamp (seconds), updated every second.
// All round windows and countdowns are derived from this locally — no RPC calls.
export function useClock(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    interval.current = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => {
      if (interval.current !== null) clearInterval(interval.current);
    };
  }, []);

  return now;
}
