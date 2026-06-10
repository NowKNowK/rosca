import type { CircleData } from "../../hooks/useCircle";
import { CircleStatusBadge } from "../ui/StatusBadge";
import { TokenAmount } from "../ui/TokenAmount";
import { Countdown } from "../ui/Countdown";
import { Card, Stat } from "../ui/Card";
import { AddressLabel } from "../ui/AddressLabel";
import {
  currentRound,
  roundEnd,
  contributionWindowEnd,
  isCircleActive,
  isCircleFilling,
} from "../../lib/rosca";
import { useClock } from "../../hooks/useClock";
import { fmtTs } from "../../lib/format";

export function CircleHeader({ circle }: { circle: CircleData }) {
  const now = useClock();
  const { account, mintDecimals, mintSymbol, address } = circle;

  const isActive = isCircleActive(account);
  const isFilling = isCircleFilling(account);

  const cur = isActive
    ? currentRound(now, account.startedAt, account.roundDuration, account.totalRounds)
    : 0;

  const windowEndSec = isActive && cur > 0
    ? contributionWindowEnd(account.startedAt, account.roundDuration, account.gracePeriod, cur)
    : 0;

  const roundEndSec = isActive && cur > 0
    ? roundEnd(account.startedAt, account.roundDuration, cur)
    : 0;

  const progress = account.totalRounds > 0
    ? Math.round((cur / account.totalRounds) * 100)
    : 0;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CircleStatusBadge status={
            isFilling ? "Filling"
              : isActive ? "Active"
              : "completed" in account.status ? "Completed"
              : "Cancelled"
          } />
          <AddressLabel address={address.toBase58()} className="text-slate-500" />
        </div>

        {isActive && account.totalRounds > 0 && (
          <div className="text-right">
            <span className="font-mono font-semibold text-slate-300 text-sm tabular-nums">
              Round {cur} / {account.totalRounds}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar — only for Active circles */}
      {isActive && account.totalRounds > 0 && (
        <div className="w-full bg-slate-800 rounded-full h-1.5">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat
          label="Contribution"
          value={
            <TokenAmount
              amount={account.contributionAmount}
              decimals={mintDecimals}
              symbol={mintSymbol}
            />
          }
        />
        <Stat
          label="Members"
          value={
            isFilling
              ? `${account.memberCount} / ${account.maxMembers}`
              : `${account.activeMembers} active`
          }
        />
        <Stat
          label="Round duration"
          value={formatDurationSec(Number(account.roundDuration))}
          sub={`+ ${formatDurationSec(Number(account.gracePeriod))} grace`}
        />
        <Stat
          label="Collateral"
          value={`${(account.collateralBps / 100).toFixed(0)}%`}
          sub={`${(account.exitPenaltyBps / 100).toFixed(0)}% exit penalty`}
        />
      </div>

      {/* Timing info */}
      <div className="flex flex-wrap gap-4 text-sm border-t border-slate-800 pt-3">
        {isFilling && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="text-xs">Start deadline:</span>
            <Countdown targetSec={Number(account.startDeadline)} className="text-amber-400" />
            <span className="text-xs text-slate-500">({fmtTs(Number(account.startDeadline))})</span>
          </div>
        )}

        {isActive && cur > 0 && roundEndSec > 0 && roundEndSec !== windowEndSec && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="text-xs">Round ends:</span>
            <Countdown targetSec={roundEndSec} className="text-amber-400" />
          </div>
        )}

        {isActive && cur > 0 && windowEndSec > 0 && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="text-xs">Slashable after:</span>
            <Countdown targetSec={windowEndSec} className="text-red-400" />
          </div>
        )}
      </div>
    </Card>
  );
}

function formatDurationSec(secs: number): string {
  if (secs >= 86400) return `${Math.floor(secs / 86400)}d`;
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h`;
  if (secs >= 60) return `${Math.floor(secs / 60)}m`;
  return `${secs}s`;
}
