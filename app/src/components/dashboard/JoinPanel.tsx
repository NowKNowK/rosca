import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { CircleData } from "../../hooks/useCircle";
import type { MemberData } from "../../hooks/useMembers";
import { TxButton } from "../ui/TxButton";
import { TokenAmount } from "../ui/TokenAmount";
import { Card, Stat } from "../ui/Card";
import { useSendTx } from "../../hooks/useSendTx";
import { useProgram } from "../../providers/ProgramProvider";
import { useTokenBalance } from "../../hooks/useTokenBalance";
import { useMemberHistory } from "../../hooks/useMemberHistory";
import { memberPda, historyPda } from "../../lib/pda";
import { requiredCollateral, isCircleFilling } from "../../lib/rosca";
import { PublicKey } from "@solana/web3.js";

type Props = {
  circle: CircleData;
  members: MemberData[];
};

export function JoinPanel({ circle, members }: Props) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const qc = useQueryClient();
  const { account, mintDecimals, mintSymbol } = circle;

  // Next available position
  const takenPositions = new Set(members.map((m) => m.account.position));
  let nextPos = 1;
  while (nextPos <= account.maxMembers && takenPositions.has(nextPos)) nextPos++;

  const collateralNeeded = requiredCollateral(
    account.contributionAmount,
    account.maxMembers,
    nextPos,
    account.collateralBps
  );

  const mintPk = new PublicKey(account.tokenMint.toBase58());
  const balanceQuery = useTokenBalance(publicKey ? mintPk : null, publicKey);
  const historyQuery = useMemberHistory(publicKey);

  const hasSufficientBalance =
    (balanceQuery.data ?? 0n) >= collateralNeeded;
  const hasCleanHistory =
    !account.requireCleanHistory || (historyQuery.data?.defaults ?? 0) === 0;
  const spotsAvailable = account.memberCount < account.maxMembers;

  const { state, send } = useSendTx({
    action: "Join circle",
    invalidate: [
      ["circle", circle.address.toBase58()],
      ["members", circle.address.toBase58()],
      ["myCircles", publicKey?.toBase58()],
      ["balance", mintPk.toBase58(), publicKey?.toBase58()],
    ],
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["history", publicKey?.toBase58()] });
    },
  });

  async function handleJoin() {
    if (!publicKey) return;

    await send(async () => {
      const memberPk = memberPda(circle.address, publicKey);
      const historyPk = historyPda(publicKey);
      const userToken = await getAta(mintPk, publicKey);

      return program.methods
        .join()
        .accounts({
          user: publicKey,
          circle: circle.address,
          member: memberPk,
          history: historyPk,
          vault: new PublicKey(account.vault.toBase58()),
          userToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();
    });
  }

  if (!isCircleFilling(account)) return null;
  if (!publicKey) return null;
  if (!spotsAvailable) return null;

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-300">Join this circle</h3>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Your position"
          value={`#${nextPos}`}
          sub={`of ${account.maxMembers} total`}
        />
        <Stat
          label="Collateral required"
          value={
            <TokenAmount
              amount={collateralNeeded}
              decimals={mintDecimals}
              symbol={mintSymbol}
            />
          }
          sub="Returned when circle ends"
        />
      </div>

      {account.requireCleanHistory && (
        <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800 rounded px-3 py-2">
          This circle requires a clean history (zero defaults in MemberHistory PDA).
          {historyQuery.data && historyQuery.data.defaults > 0 && (
            <span className="font-medium"> Your history: {historyQuery.data.defaults} default(s).</span>
          )}
        </p>
      )}

      <TxButton
        onClick={handleJoin}
        state={state}
        disabled={!hasSufficientBalance || !hasCleanHistory}
        disabledReason={
          !hasCleanHistory
            ? `This circle requires a clean history (you have ${historyQuery.data?.defaults ?? 0} defaults)`
            : !hasSufficientBalance
            ? `Insufficient balance — need ${mintSymbol} collateral`
            : undefined
        }
      >
        Join → deposit collateral
      </TxButton>
    </Card>
  );
}

async function getAta(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  return getAssociatedTokenAddressSync(mint, owner);
}
