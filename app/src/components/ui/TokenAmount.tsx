import { fmtAmount } from "../../lib/format";

export function TokenAmount({
  amount,
  decimals,
  symbol,
  className = "",
}: {
  amount: bigint;
  decimals: number;
  symbol: string;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {fmtAmount(amount, decimals)}{" "}
      <span className="text-slate-500 text-xs">{symbol}</span>
    </span>
  );
}
