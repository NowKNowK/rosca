import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useProgram } from "../providers/ProgramProvider";
import { historyPda } from "../lib/pda";
import type { HistoryAccount } from "../lib/rosca";

export function useMemberHistory(wallet: PublicKey | null | undefined) {
  const program = useProgram();

  return useQuery<HistoryAccount | null>({
    queryKey: ["history", wallet?.toBase58()],
    enabled: !!wallet,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!wallet) return null;
      const pda = historyPda(wallet);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await (program.account as any).memberHistory.fetch(pda);
        return {
          user: raw.user,
          defaults: raw.defaults,
          completed: raw.completed,
          bump: raw.bump,
        } as HistoryAccount;
      } catch {
        return null;
      }
    },
  });
}
