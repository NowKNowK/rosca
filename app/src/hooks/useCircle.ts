import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import { useProgram } from "../providers/ProgramProvider";
import type { CircleAccount } from "../lib/rosca";
import { bn, bnArr } from "../lib/anchor-types";

export type CircleData = {
  address: PublicKey;
  account: CircleAccount;
  mintDecimals: number;
  mintSymbol: string;
  dataUpdatedAt: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCircle(raw: any): CircleAccount {
  return {
    creator: raw.creator,
    circleId: bn(raw.circleId),
    tokenMint: raw.tokenMint,
    vault: raw.vault,
    contributionAmount: bn(raw.contributionAmount),
    roundDuration: bn(raw.roundDuration),
    gracePeriod: bn(raw.gracePeriod),
    startDeadline: bn(raw.startDeadline),
    startedAt: bn(raw.startedAt),
    exitPenaltyBps: raw.exitPenaltyBps,
    collateralBps: raw.collateralBps,
    maxMembers: raw.maxMembers,
    memberCount: raw.memberCount,
    activeMembers: raw.activeMembers,
    openMemberAccounts: raw.openMemberAccounts,
    totalRounds: raw.totalRounds,
    status: raw.status,
    requireCleanHistory: raw.requireCleanHistory,
    occupiedPositions: raw.occupiedPositions,
    removedPositions: raw.removedPositions,
    claimedRounds: raw.claimedRounds,
    contributionCounts: raw.contributionCounts,
    potBonus: bnArr(raw.potBonus),
    surchargeAccrued: bn(raw.surchargeAccrued),
    refundReserve: bn(raw.refundReserve),
    totalCollateral: bn(raw.totalCollateral),
    bump: raw.bump,
  };
}

export function useCircle(address: string | undefined) {
  const program = useProgram();
  const { connection } = useConnection();

  return useQuery<CircleData | null>({
    queryKey: ["circle", address],
    enabled: !!address,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!address) return null;
      let pubkey: PublicKey;
      try {
        pubkey = new PublicKey(address);
      } catch {
        return null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (program.account as any).circle.fetch(pubkey);
      const account = mapCircle(raw);

      let mintDecimals = 6;
      let mintSymbol = "tokens";
      try {
        const mintInfo = await getMint(connection, new PublicKey(account.tokenMint.toBase58()));
        mintDecimals = mintInfo.decimals;
        if (account.tokenMint.toBase58() === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") {
          mintSymbol = "USDC";
        }
      } catch {
        // ignore
      }

      return {
        address: pubkey,
        account,
        mintDecimals,
        mintSymbol,
        dataUpdatedAt: Date.now(),
      };
    },
  });
}
