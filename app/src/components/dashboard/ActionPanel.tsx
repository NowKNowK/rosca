import { useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, SYSVAR_RENT_PUBKEY, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { CircleData } from "../../hooks/useCircle";
import type { MemberData } from "../../hooks/useMembers";
import { TxButton } from "../ui/TxButton";
import { TokenAmount } from "../ui/TokenAmount";
import { Card } from "../ui/Card";
import { Countdown } from "../ui/Countdown";
import { useSendTx } from "../../hooks/useSendTx";
import { useProgram } from "../../providers/ProgramProvider";
import { useTokenBalance } from "../../hooks/useTokenBalance";
import {
  isCircleActive,
  isCircleFilling,
  isCircleCompleted,
  isCircleCancelled,
  isMemberActive,
  currentRound,
  effPos,
  surchargeDue,
  contributionWindowEnd,
  isClaimEligible,
  canClaimNow,
  exitEarlyEstimate,
} from "../../lib/rosca";
import { useClock } from "../../hooks/useClock";

type Props = {
  circle: CircleData;
  members: MemberData[];
  myMember?: MemberData;
};

export function ActionPanel({ circle, members, myMember }: Props) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const now = useClock();
  const { account, mintDecimals, mintSymbol } = circle;

  const mintPk = new PublicKey(account.tokenMint.toBase58());
  const balanceQuery = useTokenBalance(publicKey ? mintPk : null, publicKey);
  const myBalance = balanceQuery.data ?? 0n;

  const circleAddr = circle.address.toBase58();
  const invalidateCircle = [
    ["circle", circleAddr],
    ["members", circleAddr],
    ["balance", mintPk.toBase58(), publicKey?.toBase58()],
  ];

  const contributeState = useSendTx({ action: "Contribute", invalidate: invalidateCircle });
  const leaveState = useSendTx({ action: "Leave", invalidate: invalidateCircle });
  const claimState = useSendTx({ action: "Claim payout", invalidate: invalidateCircle });
  const exitState = useSendTx({ action: "Exit early", invalidate: invalidateCircle });
  const cancelState = useSendTx({ action: "Cancel circle", invalidate: [["circle", circleAddr]] });

  if (!publicKey) {
    return (
      <Card className="p-4 text-center">
        <p className="text-xs text-slate-500">Connect wallet to take actions</p>
      </Card>
    );
  }

  const isFilling = isCircleFilling(account);
  const isActive = isCircleActive(account);
  const isCompleted = isCircleCompleted(account);
  const isCancelled = isCircleCancelled(account);

  const cur = isActive
    ? currentRound(now, account.startedAt, account.roundDuration, account.totalRounds)
    : 0;

  const windowEnd = isActive && cur > 0
    ? contributionWindowEnd(account.startedAt, account.roundDuration, account.gracePeriod, cur)
    : 0;

  const myStatus = myMember?.account;
  const isMyMemberActive = myStatus ? isMemberActive(myStatus) : false;

  const hasContributed = myStatus
    ? (myStatus.contributions & (1 << (cur - 1))) !== 0
    : false;

  const surcharge = myStatus ? surchargeDue(account, myStatus) : 0n;
  const contributeTotal = account.contributionAmount + surcharge;
  const canContribute =
    isActive &&
    isMyMemberActive &&
    cur > 0 &&
    !hasContributed &&
    now < windowEnd &&
    myBalance >= contributeTotal;

  const myEffPos = myStatus
    ? effPos(myStatus.position, account.removedPositions)
    : 0;
  const isMyPayoutRound = myEffPos === cur && !myStatus?.hasReceivedPayout;
  const claimEligible = myStatus ? isClaimEligible(myStatus, cur) : false;
  const canClaim = isMyPayoutRound && claimEligible && canClaimNow(account, cur, now);

  const exitAvailable =
    isActive &&
    isMyMemberActive &&
    !myStatus?.hasReceivedPayout &&
    myEffPos > cur &&
    account.totalRounds - cur >= 2;

  const leaveAvailable = isFilling && isMyMemberActive;
  const cancelAvailable = isFilling && now > Number(account.startDeadline);

  const { refundDue: exitRefund, surchargePer } = myStatus
    ? exitEarlyEstimate(account, myStatus)
    : { refundDue: 0n, surchargePer: 0n };

  // ---- handlers ----

  async function handleContribute() {
    if (!publicKey || !myMember) return;
    await contributeState.send(async () => {
      const userToken = getAssociatedTokenAddressSync(mintPk, publicKey);
      return program.methods
        .contribute(cur)
        .accounts({
          user: publicKey,
          circle: circle.address,
          member: myMember.address,
          vault: new PublicKey(account.vault.toBase58()),
          userToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
    });
  }

  async function handleLeave() {
    if (!publicKey || !myMember) return;
    await leaveState.send(async () => {
      const userToken = getAssociatedTokenAddressSync(mintPk, publicKey);
      return program.methods
        .leave()
        .accounts({
          user: publicKey,
          circle: circle.address,
          member: myMember.address,
          vault: new PublicKey(account.vault.toBase58()),
          userToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
    });
  }

  async function handleClaim() {
    if (!publicKey || !myMember) return;
    const recipientToken = getAssociatedTokenAddressSync(mintPk, publicKey);
    await claimState.send(async () =>
      program.methods
        .claimPayout(cur)
        .accounts({
          payer: publicKey,
          circle: circle.address,
          recipientMember: myMember.address,
          recipient: publicKey,
          recipientToken,
          tokenMint: mintPk,
          vault: new PublicKey(account.vault.toBase58()),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc()
    );
  }

  async function handleExitEarly() {
    if (!publicKey || !myMember) return;
    await exitState.send(async () =>
      program.methods
        .exitEarly()
        .accounts({
          user: publicKey,
          circle: circle.address,
          member: myMember.address,
        } as any)
        .rpc()
    );
  }

  async function handleCancel() {
    await cancelState.send(async () =>
      program.methods
        .cancelCircle()
        .accounts({ payer: publicKey, circle: circle.address } as any)
        .rpc()
    );
  }

  const isCompleteOrCancelled = isCompleted || isCancelled;
  if (isCompleteOrCancelled && !myStatus) return null;

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-300">Actions</h3>

      {/* Primary actions for my role */}
      <div className="flex flex-wrap gap-2">
        {/* Contribute */}
        {isActive && isMyMemberActive && cur > 0 && !hasContributed && (
          <TxButton
            onClick={handleContribute}
            state={contributeState.state}
            disabled={!canContribute}
            disabledReason={
              now >= windowEnd
                ? "Contribution window closed — you can now be slashed"
                : myBalance < contributeTotal
                ? `Insufficient balance — need ${mintSymbol}`
                : undefined
            }
          >
            Contribute {surcharge > 0n ? `(+${mintSymbol} surcharge)` : ""}
            {contributeTotal > 0n && (
              <span className="ml-1 text-indigo-300 text-xs">
                <TokenAmount amount={contributeTotal} decimals={mintDecimals} symbol={mintSymbol} className="text-indigo-300" />
              </span>
            )}
          </TxButton>
        )}

        {/* Already contributed indicator */}
        {isActive && isMyMemberActive && hasContributed && (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            ✓ Contributed round {cur}
          </span>
        )}

        {/* Claim payout — primary when it's my round */}
        {isActive && isMyMemberActive && isMyPayoutRound && (
          <TxButton
            onClick={handleClaim}
            state={claimState.state}
            disabled={!canClaim}
            disabledReason={
              !claimEligible
                ? "You missed a contribution — not eligible to claim"
                : !canClaimNow(account, cur, now)
                ? `Pot not full yet — claimable when all contribute or window closes`
                : undefined
            }
            variant="secondary"
          >
            🏆 Claim payout (round {cur})
          </TxButton>
        )}

        {/* Leave — Filling phase */}
        {leaveAvailable && (
          <TxButton onClick={handleLeave} state={leaveState.state} variant="ghost">
            Leave circle
          </TxButton>
        )}
      </div>

      {/* Exit early — show even when disabled so user understands why */}
      {isActive && isMyMemberActive && !myStatus?.hasReceivedPayout && (
        <div className="pt-2 border-t border-slate-800">
          <TxButton
            onClick={handleExitEarly}
            state={exitState.state}
            disabled={!exitAvailable}
            disabledReason={
              myEffPos <= cur
                ? "Your payout round has arrived — claim instead"
                : account.totalRounds - cur < 2
                ? "Too late to exit: fewer than 2 rounds remain"
                : undefined
            }
            variant="ghost"
            size="sm"
          >
            Exit early
          </TxButton>
          {exitAvailable && (
            <p className="text-xs text-slate-500 mt-1">
              Estimated refund:{" "}
              <TokenAmount amount={exitRefund} decimals={mintDecimals} symbol={mintSymbol} className="text-xs" />{" "}
              · surcharge added to others:{" "}
              <TokenAmount amount={surchargePer} decimals={mintDecimals} symbol={mintSymbol} className="text-xs" />
            </p>
          )}
        </div>
      )}

      {/* Countdown to window */}
      {isActive && cur > 0 && windowEnd > 0 && (
        <p className="text-xs text-slate-500">
          Contribution window closes in{" "}
          <Countdown targetSec={windowEnd} className="text-amber-400" />
        </p>
      )}

      {/* Permissionless actions — second row */}
      <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
        {cancelAvailable && (
          <TxButton
            onClick={handleCancel}
            state={cancelState.state}
            variant="ghost"
            size="sm"
          >
            Cancel (deadline passed)
          </TxButton>
        )}
        {!cancelAvailable && isFilling && (
          <p className="text-xs text-slate-500">
            Circle can be cancelled after deadline:{" "}
            <Countdown targetSec={Number(account.startDeadline)} className="text-slate-400" />
          </p>
        )}
      </div>

      {/* Slashable members list */}
      {isActive && (() => {
        const slashable = members.filter((m) => {
          if (!isMemberActive(m.account)) return false;
          for (let r = 1; r <= Math.min(cur, account.totalRounds); r++) {
            const bit = m.account.contributions & (1 << (r - 1));
            const wEnd = contributionWindowEnd(
              account.startedAt,
              account.roundDuration,
              account.gracePeriod,
              r
            );
            if (bit === 0 && now >= wEnd) return true;
          }
          return false;
        });

        if (slashable.length === 0) return null;

        return (
          <div className="pt-2 border-t border-red-900/30">
            <p className="text-xs text-red-400 font-medium mb-1.5">⚡ Slashable members</p>
            <div className="space-y-1">
              {slashable.map((sm) => {
                let missedRound = 1;
                for (let r = 1; r <= Math.min(cur, account.totalRounds); r++) {
                  const bit = sm.account.contributions & (1 << (r - 1));
                  const wEnd = contributionWindowEnd(
                    account.startedAt,
                    account.roundDuration,
                    account.gracePeriod,
                    r
                  );
                  if (bit === 0 && now >= wEnd) {
                    missedRound = r;
                    break;
                  }
                }
                return (
                  <SlashRow
                    key={sm.address.toBase58()}
                    member={sm}
                    missedRound={missedRound}
                    circleAddr={circle.address}
                    historyAddr={new PublicKey(sm.account.user.toBase58())}
                    invalidate={invalidateCircle}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

function SlashRow({
  member,
  missedRound,
  circleAddr,
  historyAddr,
  invalidate,
}: {
  member: MemberData;
  missedRound: number;
  circleAddr: PublicKey;
  historyAddr: PublicKey;
  invalidate: (string | undefined)[][];
}) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const { state, send } = useSendTx({ action: "Slash", invalidate });

  async function doSlash() {
    if (!publicKey) return;
    const { historyPda } = await import("../../lib/pda");
    const hPda = historyPda(new PublicKey(member.account.user.toBase58()));
    await send(() =>
      program.methods
        .slash(missedRound)
        .accounts({
          payer: publicKey,
          circle: circleAddr,
          member: member.address,
          history: hPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc()
    );
  }
  void historyAddr;

  const addr = member.account.user.toBase58();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-xs text-slate-400">
        {addr.slice(0, 4)}…{addr.slice(-4)}
      </span>
      <span className="text-xs text-red-400">missed R{missedRound}</span>
      <TxButton onClick={doSlash} state={state} variant="danger" size="sm">
        Slash
      </TxButton>
    </div>
  );
}
