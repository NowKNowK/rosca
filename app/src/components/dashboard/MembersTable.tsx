import type { MemberData } from "../../hooks/useMembers";
import type { CircleData } from "../../hooks/useCircle";
import { MemberStatusBadge } from "../ui/StatusBadge";
import { AddressLabel } from "../ui/AddressLabel";
import { TokenAmount } from "../ui/TokenAmount";
import {
  effPos,
  surchargeDue,
  memberStatusLabel,
  requiredCollateral,
} from "../../lib/rosca";

type Props = {
  members: MemberData[];
  circle: CircleData;
  myAddress?: string;
};

export function MembersTable({ members, circle, myAddress }: Props) {
  const { account, mintDecimals, mintSymbol } = circle;

  const sorted = [...members].sort((a, b) => a.account.position - b.account.position);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-left">
            <th className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Address</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Pos</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Eff</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Collateral</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Surcharge due</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {sorted.map((m) => {
            const addr = m.account.user.toBase58();
            const isMe = addr === myAddress;
            const eff = effPos(m.account.position, account.removedPositions);
            const surcharge = surchargeDue(account, m.account);
            const collateral = requiredCollateral(
              account.contributionAmount,
              account.maxMembers,
              m.account.position,
              account.collateralBps
            );
            const status = memberStatusLabel(m.account);

            return (
              <tr
                key={m.address.toBase58()}
                className={`${isMe ? "bg-indigo-950/50" : "hover:bg-slate-800/50"} transition-colors`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {isMe && (
                      <span className="text-xs text-indigo-400 font-medium">you</span>
                    )}
                    <AddressLabel address={addr} />
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-slate-400">{m.account.position}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{eff}</td>
                <td className="px-3 py-2">
                  <TokenAmount
                    amount={collateral}
                    decimals={mintDecimals}
                    symbol={mintSymbol}
                  />
                </td>
                <td className="px-3 py-2">
                  {surcharge > 0n ? (
                    <span className="text-amber-400 font-mono tabular-nums text-xs">
                      +{(Number(surcharge) / 10 ** mintDecimals).toFixed(2)} {mintSymbol}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <MemberStatusBadge status={status as "Active" | "Exited" | "Defaulted" | "Completed"} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
