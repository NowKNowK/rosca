import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useProgram } from "../providers/ProgramProvider";
import type { MemberAccount } from "../lib/rosca";
import { PROGRAM_ID } from "../lib/constants";
import { bn } from "../lib/anchor-types";

export type MemberData = {
  address: PublicKey;
  account: MemberAccount;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMember(raw: any): MemberAccount {
  return {
    circle: raw.circle,
    user: raw.user,
    position: raw.position,
    collateral: bn(raw.collateral),
    contributions: raw.contributions,
    surchargePaid: bn(raw.surchargePaid),
    refundDue: bn(raw.refundDue),
    status: raw.status,
    hasReceivedPayout: raw.hasReceivedPayout,
    bump: raw.bump,
  };
}

export function useMembers(circleAddress: string | undefined) {
  const program = useProgram();

  return useQuery<MemberData[]>({
    queryKey: ["members", circleAddress],
    enabled: !!circleAddress,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!circleAddress) return [];
      const circlePk = new PublicKey(circleAddress);

      const accounts = await program.provider.connection.getProgramAccounts(
        PROGRAM_ID,
        {
          filters: [
            { dataSize: 102 },
            {
              memcmp: {
                offset: 8,
                bytes: circlePk.toBase58(),
              },
            },
          ],
        }
      );

      return accounts.map((a) => ({
        address: a.pubkey,
        account: mapMember(
          program.coder.accounts.decode("member", a.account.data)
        ),
      }));
    },
  });
}
