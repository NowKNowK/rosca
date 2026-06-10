import { useWallet } from "@solana/wallet-adapter-react";
import { useMemberHistory } from "../../hooks/useMemberHistory";

export function HistoryBadge() {
  const { publicKey } = useWallet();
  const { data: history } = useMemberHistory(publicKey);

  if (!publicKey || !history) return null;

  const hasDefaults = history.defaults > 0;

  return (
    <div
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800/50 font-mono"
      title="On-chain reputation: MemberHistory PDA never closes"
    >
      <span className={hasDefaults ? "text-red-400" : "text-slate-500"}>
        {history.defaults} default{history.defaults !== 1 ? "s" : ""}
      </span>
      <span className="text-slate-600">·</span>
      <span className="text-emerald-400">
        {history.completed} completed
      </span>
    </div>
  );
}
