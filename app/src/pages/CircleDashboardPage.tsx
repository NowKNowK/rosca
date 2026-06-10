import { useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useCircle } from "../hooks/useCircle";
import { useMembers } from "../hooks/useMembers";
import { useProgram } from "../providers/ProgramProvider";
import { useSendTx } from "../hooks/useSendTx";
import { CircleHeader } from "../components/dashboard/CircleHeader";
import { MembersTable } from "../components/dashboard/MembersTable";
import { RoundsMatrix } from "../components/dashboard/RoundsMatrix";
import { ActionPanel } from "../components/dashboard/ActionPanel";
import { JoinPanel } from "../components/dashboard/JoinPanel";
import { CleanupPanel } from "../components/dashboard/CleanupPanel";
import { Card } from "../components/ui/Card";
import { EmptyState, SkeletonRow } from "../components/ui/EmptyState";
import { rememberCircle } from "../hooks/useMyCircles";
import {
  isCircleActive,
  isCircleCompleted,
  isCircleCancelled,
  isCircleFilling,
  effPos,
} from "../lib/rosca";
export function CircleDashboardPage() {
  const { address } = useParams<{ address: string }>();
  const { publicKey } = useWallet();
  const program = useProgram();
  const qc = useQueryClient();

  const circleQuery = useCircle(address);
  const membersQuery = useMembers(address);

  useEffect(() => {
    if (address) rememberCircle(address);
  }, [address]);

  const { send: pushSend } = useSendTx({
    action: "Push payout",
    invalidate: [
      ["circle", address],
      ["members", address],
    ],
  });

  const handlePushPayout = useCallback(
    async (round: number) => {
      if (!publicKey || !circleQuery.data || !membersQuery.data) return;
      const { account } = circleQuery.data;
      const recipient = membersQuery.data.find(
        (m) => effPos(m.account.position, account.removedPositions) === round
      );
      if (!recipient) return;

      const mintPk = new PublicKey(account.tokenMint.toBase58());
      const recipientPk = new PublicKey(recipient.account.user.toBase58());
      const recipientToken = getAssociatedTokenAddressSync(mintPk, recipientPk);

      await pushSend(() =>
        program.methods
          .claimPayout(round)
          .accounts({
            payer: publicKey,
            circle: circleQuery.data!.address,
            recipientMember: recipient.address,
            recipient: recipientPk,
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
    },
    [publicKey, circleQuery.data, membersQuery.data, program, pushSend]
  );

  if (!address) {
    return (
      <EmptyState
        title="No circle address provided"
        action={<Link to="/" className="text-indigo-400 text-sm hover:underline">← Home</Link>}
      />
    );
  }

  if (circleQuery.isError) {
    return (
      <EmptyState
        title="No circle at this address on devnet"
        description={address}
        action={<Link to="/" className="text-indigo-400 text-sm hover:underline">← Home</Link>}
      />
    );
  }

  if (circleQuery.isLoading || !circleQuery.data) {
    return (
      <div className="space-y-4">
        <div className="h-36 bg-slate-900 border border-slate-700 rounded-lg animate-pulse" />
        <div className="h-48 bg-slate-900 border border-slate-700 rounded-lg animate-pulse" />
      </div>
    );
  }

  const circle = circleQuery.data;
  const members = membersQuery.data ?? [];
  const myAddr = publicKey?.toBase58();
  const myMember = members.find((m) => m.account.user.toBase58() === myAddr);
  const isMyMember = !!myMember;
  const isNotMyMember = !isMyMember;
  const isActive = isCircleActive(circle.account);
  const isFilling = isCircleFilling(circle.account);
  const isCompleted = isCircleCompleted(circle.account);
  const isCancelled = isCircleCancelled(circle.account);
  const isEndState = isCompleted || isCancelled;

  const staleMs = Date.now() - (circle.dataUpdatedAt ?? 0);
  const isStale = staleMs > 60_000;

  return (
    <div className="space-y-4">
      {/* Stale warning */}
      {isStale && (
        <div className="flex items-center justify-between bg-amber-950/30 border border-amber-800 rounded-lg px-4 py-2 text-xs text-amber-400">
          <span>Data may be stale — last updated {Math.round(staleMs / 1000)}s ago</span>
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["circle", address] });
              qc.invalidateQueries({ queryKey: ["members", address] });
            }}
            className="font-medium hover:underline"
          >
            Refresh
          </button>
        </div>
      )}

      <CircleHeader circle={circle} />

      {/* Join panel — Filling, not yet a member */}
      {isFilling && isNotMyMember && publicKey && (
        <JoinPanel circle={circle} members={members} />
      )}

      {/* Action panel — member or permissionless actions */}
      {(isMyMember || isFilling || isActive) && (
        <ActionPanel circle={circle} members={members} myMember={myMember} />
      )}

      {/* Rounds matrix — Active circles only */}
      {isActive && members.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-300">Contribution matrix</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ✓ paid · ✗ missed (⚡ slashable) · ★ payout round · push = permissionless claim trigger
            </p>
          </div>
          <div className="p-2">
            <RoundsMatrix
              members={members}
              circle={circle}
              myAddress={myAddr}
              onPushPayout={publicKey ? handlePushPayout : undefined}
            />
          </div>
        </Card>
      )}

      {/* Members table */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            Members ({members.length})
          </h2>
          {circleQuery.dataUpdatedAt && (
            <button
              className="text-xs text-slate-500 font-mono hover:text-indigo-400 transition-colors"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["circle", address] });
                qc.invalidateQueries({ queryKey: ["members", address] });
              }}
            >
              ↻ refresh
            </button>
          )}
        </div>

        {membersQuery.isLoading ? (
          <table className="w-full">
            <tbody>
              <SkeletonRow cols={6} />
              <SkeletonRow cols={6} />
              <SkeletonRow cols={6} />
            </tbody>
          </table>
        ) : members.length === 0 ? (
          <EmptyState title="No members yet" description="Be the first to join this circle" />
        ) : (
          <MembersTable members={members} circle={circle} myAddress={myAddr} />
        )}
      </Card>

      {/* Cleanup panel — Completed or Cancelled */}
      {isEndState && (
        <CleanupPanel circle={circle} members={members} />
      )}
    </div>
  );
}

