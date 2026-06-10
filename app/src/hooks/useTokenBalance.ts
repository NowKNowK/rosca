import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";

export function useTokenBalance(
  mint: PublicKey | null | undefined,
  owner: PublicKey | null | undefined
) {
  const { connection } = useConnection();

  return useQuery<bigint>({
    queryKey: ["balance", mint?.toBase58(), owner?.toBase58()],
    enabled: !!mint && !!owner,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!mint || !owner) return 0n;
      try {
        const ata = getAssociatedTokenAddressSync(mint, owner);
        const acct = await getAccount(connection, ata);
        return acct.amount;
      } catch {
        return 0n;
      }
    },
  });
}
