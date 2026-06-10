// Token amount formatting — all arithmetic on BigInt, no floats
export function fmtAmount(raw: bigint | number | string, decimals: number): string {
  const n = BigInt(raw.toString());
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = n % base;
  if (frac === 0n) return whole.toLocaleString("en-US");
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}.${fracStr}`;
}

// Parse decimal string to raw bigint (e.g. "1.5" with decimals=6 -> 1500000n)
export function parseAmount(input: string, decimals: number): bigint {
  const [wholeStr, fracStr = ""] = input.split(".");
  const wholePart = BigInt(wholeStr || "0") * 10n ** BigInt(decimals);
  const paddedFrac = fracStr.slice(0, decimals).padEnd(decimals, "0");
  const fracPart = BigInt(paddedFrac);
  return wholePart + fracPart;
}

export function fmtDuration(secs: number): string {
  if (secs >= 86400) return `${Math.floor(secs / 86400)}d`;
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h`;
  if (secs >= 60) return `${Math.floor(secs / 60)}m`;
  return `${secs}s`;
}

export function fmtCountdown(secs: number): string {
  if (secs <= 0) return "closing now…";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

export function fmtTs(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function short(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
