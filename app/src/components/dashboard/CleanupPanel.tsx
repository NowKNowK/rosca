import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, SYSVAR_RENT_PUBKEY, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CircleData } from "../../hooks/useCircle";
import type { MemberData } from "../../hooks/useMembers";
import { Card } from "../ui/Card";
import { TxButton } from "../ui/TxButton";
import { useProgram } from "../../providers/ProgramProvider";
import { explorerTx } from "../../lib/constants";
import { historyPda } from "../../lib/pda";

type Props = {
  circle: CircleData;
  members: MemberData[];
};

export function CleanupPanel({ circle, members }: Props) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [isClosingMembers, setIsClosingMembers] = useState(false);
  const [isClosingCircle, setIsClosingCircle] = useState(false);

  const { account } = circle;
  const mintPk = new PublicKey(account.tokenMint.toBase58());
  const circleAddr = circle.address.toBase58();

  const canCloseCircle = account.openMemberAccounts === 0;

  async function handleCloseMembers() {
    if (!publicKey || isClosingMembers) return;
    setIsClosingMembers(true);
    setProgress(0);

    const total = members.length;
    let done = 0;
    let failed = false;

    for (const m of members) {
      try {
        const memberOwner = new PublicKey(m.account.user.toBase58());
        const memberToken = getAssociatedTokenAddressSync(mintPk, memberOwner);
        const hPda = historyPda(memberOwner);

        const toastId = toast.loading(`Closing member ${done + 1}/${total}…`);
        const sig = await program.methods
          .closeMember()
          .accounts({
            payer: publicKey,
            circle: circle.address,
            member: m.address,
            memberOwner,
            history: hPda,
            tokenMint: mintPk,
            vault: new PublicKey(account.vault.toBase58()),
            memberToken,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          } as any)
          .rpc();

        done++;
        setProgress(done);
        toast.success(`Member ${done}/${total} closed`, {
          id: toastId,
          action: { label: "Explorer ↗", onClick: () => window.open(explorerTx(sig), "_blank") },
          duration: 4000,
        });
      } catch (err) {
        failed = true;
        toast.error(`Failed closing member account: ${String(err).slice(0, 80)}`);
        break;
      }
    }

    setIsClosingMembers(false);
    if (!failed) {
      await qc.invalidateQueries({ queryKey: ["circle", circleAddr] });
      await qc.invalidateQueries({ queryKey: ["members", circleAddr] });
    }
  }

  async function handleCloseCircle() {
    if (!publicKey || !canCloseCircle || isClosingCircle) return;
    setIsClosingCircle(true);

    const toastId = toast.loading("Closing circle…");
    try {
      const creator = new PublicKey(account.creator.toBase58());
      const creatorToken = getAssociatedTokenAddressSync(mintPk, creator);
      const sig = await program.methods
        .closeCircle()
        .accounts({
          payer: publicKey,
          circle: circle.address,
          creator,
          tokenMint: mintPk,
          creatorToken,
          vault: new PublicKey(account.vault.toBase58()),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();
      toast.success("Circle closed — rent recovered", {
        id: toastId,
        action: { label: "Explorer ↗", onClick: () => window.open(explorerTx(sig), "_blank") },
      });
      await qc.invalidateQueries({ queryKey: ["circle", circleAddr] });
    } catch (err) {
      toast.error(`Close circle failed: ${String(err).slice(0, 80)}`, { id: toastId });
    } finally {
      setIsClosingCircle(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium text-slate-300">Cleanup</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Close member accounts to recover rent (~0.002 SOL each), then close the circle vault.
          Anyone can call these — permissionless.
        </p>
      </div>

      <div className="space-y-2">
        {members.length > 0 && (
          <div className="flex items-center gap-3">
            <TxButton
              onClick={handleCloseMembers}
              state={isClosingMembers ? "confirming" : "idle"}
              variant="ghost"
            >
              Close member accounts ({account.openMemberAccounts} open)
            </TxButton>
            {isClosingMembers && (
              <span className="text-xs text-slate-500 font-mono">
                {progress}/{members.length}
              </span>
            )}
          </div>
        )}

        <TxButton
          onClick={handleCloseCircle}
          state={isClosingCircle ? "confirming" : "idle"}
          disabled={!canCloseCircle}
          disabledReason={`Close all ${account.openMemberAccounts} member account(s) first`}
          variant="ghost"
        >
          Close circle vault
        </TxButton>
      </div>
    </Card>
  );
}
