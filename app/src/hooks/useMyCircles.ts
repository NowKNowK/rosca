import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useProgram } from "../providers/ProgramProvider";
import { PROGRAM_ID, KNOWN_CIRCLES_KEY } from "../lib/constants";
import type { CircleAccount, MemberAccount } from "../lib/rosca";
import { bn, bnArr } from "../lib/anchor-types";

export type CircleSummary = {
  address: string;
  account: CircleAccount;
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

export function useMyCircles(wallet: PublicKey | null | undefined) {
  const program = useProgram();

  return useQuery<CircleSummary[]>({
    queryKey: ["myCircles", wallet?.toBase58()],
    enabled: !!wallet,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!wallet) return [];

      const circleAddresses = new Set<string>();

      try {
        const memberAccounts = await program.provider.connection.getProgramAccounts(
          PROGRAM_ID,
          {
            filters: [
              { dataSize: 102 },
              { memcmp: { offset: 40, bytes: wallet.toBase58() } },
            ],
          }
        );
        for (const a of memberAccounts) {
          const member = program.coder.accounts.decode("member", a.account.data) as MemberAccount;
          circleAddresses.add(member.circle.toBase58());
        }
      } catch {
        // GPA may be disabled on some RPC endpoints
      }

      try {
        const stored = localStorage.getItem(KNOWN_CIRCLES_KEY);
        if (stored) {
          const known: string[] = JSON.parse(stored);
          for (const addr of known) circleAddresses.add(addr);
        }
      } catch {
        // ignore
      }

      if (circleAddresses.size === 0) return [];

      const results: CircleSummary[] = [];
      for (const addr of circleAddresses) {
        try {
          const pk = new PublicKey(addr);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = await (program.account as any).circle.fetch(pk);
          results.push({ address: addr, account: mapCircle(raw) });
        } catch {
          // Circle may have been closed
        }
      }

      return results.sort((a, b) => {
        const statusOrder = (c: CircleAccount) => {
          if ("active" in c.status) return 0;
          if ("filling" in c.status) return 1;
          return 2;
        };
        return statusOrder(a.account) - statusOrder(b.account);
      });
    },
  });
}

export function rememberCircle(address: string) {
  try {
    const stored = localStorage.getItem(KNOWN_CIRCLES_KEY);
    const known: string[] = stored ? JSON.parse(stored) : [];
    if (!known.includes(address)) {
      known.push(address);
      localStorage.setItem(KNOWN_CIRCLES_KEY, JSON.stringify(known.slice(-50)));
    }
  } catch {
    // ignore
  }
}
