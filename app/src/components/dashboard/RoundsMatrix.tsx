import type { MemberData } from "../../hooks/useMembers";
import type { CircleData } from "../../hooks/useCircle";
import { AddressLabel } from "../ui/AddressLabel";
import { TokenAmount } from "../ui/TokenAmount";
import {
  cellState,
  effPos,
  potForRound,
  isCircleActive,
  currentRound,
} from "../../lib/rosca";
import { useClock } from "../../hooks/useClock";

type Props = {
  members: MemberData[];
  circle: CircleData;
  myAddress?: string;
  onContribute?: (round: number) => void;
  onPushPayout?: (round: number) => void;
};

const CELL_STYLES = {
  paid: "bg-emerald-900/60 text-emerald-400 font-bold",
  pending: "border-2 border-amber-500 text-amber-400",
  missed: "bg-red-900/60 text-red-400",
  future: "text-slate-600",
  void: "text-slate-700",
} as const;

const CELL_LABEL = {
  paid: "✓",
  pending: "·",
  missed: "✗",
  future: "·",
  void: "–",
} as const;

export function RoundsMatrix({
  members,
  circle,
  myAddress,
  onContribute,
  onPushPayout,
}: Props) {
  const now = useClock();
  const { account, mintDecimals, mintSymbol } = circle;

  const isActive = isCircleActive(account);
  const cur = isActive
    ? currentRound(now, account.startedAt, account.roundDuration, account.totalRounds)
    : 0;

  const totalRounds = account.totalRounds;
  if (totalRounds === 0) return null;

  const sorted = [...members].sort((a, b) => a.account.position - b.account.position);

  function recipientFor(r: number): MemberData | undefined {
    return sorted.find(
      (m) => effPos(m.account.position, account.removedPositions) === r
    );
  }

  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);
  const claimedMask = account.claimedRounds;

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full min-w-max">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap sticky left-0 bg-slate-900 border-r border-slate-800">
              Member
            </th>
            {rounds.map((r) => {
              const isCurrent = r === cur;
              const isClaimed = (claimedMask & (1 << (r - 1))) !== 0;
              const recipient = recipientFor(r);
              return (
                <th
                  key={r}
                  className={`px-1.5 py-2 text-center font-medium min-w-[36px] ${
                    isCurrent ? "bg-amber-950/50 text-amber-400" : "text-slate-500"
                  }`}
                >
                  <div>R{r}</div>
                  {recipient && (
                    <div
                      className="text-[9px] text-indigo-400 font-normal mt-0.5"
                      title={recipient.account.user.toBase58()}
                    >
                      ★
                    </div>
                  )}
                  {isClaimed && (
                    <div className="text-[9px] text-emerald-500">✓</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-800/50">
          {sorted.map((m) => {
            const addr = m.account.user.toBase58();
            const isMe = addr === myAddress;
            const eff = effPos(m.account.position, account.removedPositions);

            return (
              <tr key={m.address.toBase58()} className={isMe ? "bg-indigo-950/30" : ""}>
                <td className="px-3 py-1.5 sticky left-0 bg-inherit border-r border-slate-800 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {isMe && <span className="text-[10px] text-indigo-400 font-medium">you</span>}
                    <AddressLabel address={addr} />
                    <span className="text-slate-600 text-[10px]">→R{eff}</span>
                  </div>
                </td>

                {rounds.map((r) => {
                  const state = cellState(m.account, r, account, now);
                  const isPayoutRound = effPos(m.account.position, account.removedPositions) === r;
                  const isClickable =
                    isMe && state === "pending" && onContribute !== undefined;

                  return (
                    <td
                      key={r}
                      className={`text-center py-1.5 px-1 ${
                        isPayoutRound ? "ring-1 ring-indigo-700 ring-inset" : ""
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs cursor-default
                          ${CELL_STYLES[state]}
                          ${isClickable ? "cursor-pointer hover:bg-amber-900/50" : ""}`}
                        onClick={isClickable ? () => onContribute?.(r) : undefined}
                        title={
                          state === "missed"
                            ? "Missed — slashable"
                            : state === "pending"
                            ? "Contribute now"
                            : undefined
                        }
                      >
                        {CELL_LABEL[state]}
                        {state === "missed" && "active" in m.account.status && (
                          <span className="ml-0.5 text-[8px]">⚡</span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>

        {/* Pot footer */}
        <tfoot>
          <tr className="border-t-2 border-slate-700">
            <td className="px-3 py-1.5 text-slate-500 text-[10px] sticky left-0 bg-slate-900 border-r border-slate-800 whitespace-nowrap">
              Pot
            </td>
            {rounds.map((r) => {
              const pot = potForRound(account, r);
              const isClaimed = (claimedMask & (1 << (r - 1))) !== 0;
              const bonus = account.potBonus[r - 1] ?? 0n;
              const count = account.contributionCounts[r - 1] ?? 0;
              const isShort =
                isClaimed && count < account.activeMembers && count > 0;
              const canPush =
                !isClaimed &&
                isActive &&
                r <= cur &&
                onPushPayout !== undefined;

              return (
                <td key={r} className="text-center py-1.5 px-0.5">
                  <div className="flex flex-col items-center gap-0.5">
                    {pot > 0n ? (
                      <TokenAmount
                        amount={pot}
                        decimals={mintDecimals}
                        symbol=""
                        className="text-[10px]"
                      />
                    ) : (
                      <span className="text-slate-700 text-[10px]">—</span>
                    )}
                    {bonus > 0n && (
                      <span
                        className="text-[8px] text-amber-500"
                        title="Includes slash bonus"
                      >
                        +slash
                      </span>
                    )}
                    {isShort && (
                      <span className="text-[8px] text-red-400" title={`${count}/${account.activeMembers} contributed`}>
                        {count}/{account.activeMembers}
                      </span>
                    )}
                    {isClaimed && !isShort && (
                      <span className="text-[8px] text-emerald-500">paid</span>
                    )}
                    {canPush && (
                      <button
                        onClick={() => onPushPayout?.(r)}
                        className="text-[8px] text-indigo-400 hover:text-indigo-300 underline"
                        title="Anyone can push the payout — tokens always go to the scheduled recipient"
                      >
                        push
                      </button>
                    )}
                    {mintSymbol && (
                      <span className="text-[8px] text-slate-600">{mintSymbol}</span>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
