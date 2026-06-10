import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { Card } from "../components/ui/Card";
import { TxButton } from "../components/ui/TxButton";
import { useProgram } from "../providers/ProgramProvider";
import { useSendTx } from "../hooks/useSendTx";
import { circlePda, vaultAta } from "../lib/pda";
import { rememberCircle } from "../hooks/useMyCircles";
import { DEVNET_USDC_MINT, DEVNET_USDC_DECIMALS } from "../lib/constants";
import { PublicKey } from "@solana/web3.js";

type FormState = {
  mint: string;
  contributionAmount: string;
  maxMembers: string;
  roundDurationDays: string;
  gracePeriodHours: string;
  startDeadlineDays: string;
  exitPenaltyPct: string;
  collateralPct: string;
  requireCleanHistory: boolean;
};

const DEFAULTS: FormState = {
  mint: DEVNET_USDC_MINT.toBase58(),
  contributionAmount: "10",
  maxMembers: "5",
  roundDurationDays: "7",
  gracePeriodHours: "12",
  startDeadlineDays: "3",
  exitPenaltyPct: "10",
  collateralPct: "50",
  requireCleanHistory: false,
};

function Field({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      {children}
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-1.5 text-sm border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono bg-slate-800 text-slate-100 placeholder:text-slate-500 ${className}`}
    />
  );
}

export function CreateCirclePage() {
  const navigate = useNavigate();
  const { publicKey, connected } = useWallet();
  const program = useProgram();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const { state, send } = useSendTx({
    action: "Create circle",
    invalidate: [["myCircles", publicKey?.toBase58()]],
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};

    let mintPk: PublicKey | null = null;
    try {
      mintPk = new PublicKey(form.mint);
    } catch {
      errs.mint = "Invalid mint address";
    }
    void mintPk;

    const amount = parseFloat(form.contributionAmount);
    if (isNaN(amount) || amount <= 0) errs.contributionAmount = "Must be > 0";

    const members = parseInt(form.maxMembers);
    if (isNaN(members) || members < 2 || members > 16) errs.maxMembers = "2 – 16";

    const days = parseFloat(form.roundDurationDays);
    if (isNaN(days) || days < 1 / 1440) errs.roundDurationDays = "Must be ≥ 1 minute";

    const grace = parseFloat(form.gracePeriodHours);
    const roundSecs = Math.round(days * 86400);
    const graceSecs = Math.round(grace * 3600);
    if (graceSecs < 0 || graceSecs >= roundSecs) errs.gracePeriodHours = "Must be < round duration";

    const deadline = parseFloat(form.startDeadlineDays);
    if (isNaN(deadline) || deadline <= 0) errs.startDeadlineDays = "Must be > 0";

    const penalty = parseFloat(form.exitPenaltyPct);
    if (isNaN(penalty) || penalty < 0 || penalty > 100) errs.exitPenaltyPct = "0 – 100";

    const collateral = parseFloat(form.collateralPct);
    if (isNaN(collateral) || collateral < 0 || collateral > 100) errs.collateralPct = "0 – 100";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleCreate() {
    if (!validate() || !publicKey) return;

    await send(async () => {
      const mintPk = new PublicKey(form.mint);
      const decimals = mintPk.equals(DEVNET_USDC_MINT) ? DEVNET_USDC_DECIMALS : 6;
      const rawAmount = BigInt(Math.round(parseFloat(form.contributionAmount) * 10 ** decimals));
      const roundSecs = Math.round(parseFloat(form.roundDurationDays) * 86400);
      const graceSecs = Math.round(parseFloat(form.gracePeriodHours) * 3600);
      const deadlineSecs = Math.floor(Date.now() / 1000) + Math.round(parseFloat(form.startDeadlineDays) * 86400);
      const exitPenaltyBps = Math.round(parseFloat(form.exitPenaltyPct) * 100);
      const collateralBps = Math.round(parseFloat(form.collateralPct) * 100);
      const maxMembers = parseInt(form.maxMembers);

      const circleId = BigInt(Date.now());
      const circlePk = circlePda(publicKey, circleId);
      const vault = vaultAta(circlePk, mintPk);

      const sig = await program.methods
        .createCircle(
          new BN(circleId.toString()),
          new BN(rawAmount.toString()),
          new BN(roundSecs),
          new BN(graceSecs),
          new BN(deadlineSecs),
          maxMembers,
          exitPenaltyBps,
          collateralBps,
          form.requireCleanHistory
        )
        .accounts({
          creator: publicKey,
          circle: circlePk,
          tokenMint: mintPk,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();

      rememberCircle(circlePk.toBase58());
      navigate(`/circle/${circlePk.toBase58()}`);
      return sig;
    });
  }

  if (!connected) {
    return (
      <Card className="p-8 flex flex-col items-center gap-3 text-center">
        <p className="text-slate-400 text-sm">Connect a wallet to create a circle</p>
        <WalletMultiButton style={{ height: "36px", fontSize: "13px", borderRadius: "6px" }} />
      </Card>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-slate-500 hover:text-slate-300 text-sm">←</Link>
        <h1 className="text-base font-semibold text-slate-100">Create a ROSCA circle</h1>
      </div>

      <Card className="p-5 space-y-4">
        <Field
          label="Token mint"
          sub="Default: Devnet USDC — get tokens at faucet.circle.com"
        >
          <Input
            value={form.mint}
            onChange={(v) => set("mint", v)}
            placeholder="Token mint address"
          />
          {errors.mint && <p className="text-xs text-red-400">{errors.mint}</p>}
        </Field>

        <Field label="Contribution amount (tokens per round)">
          <Input
            type="number"
            value={form.contributionAmount}
            onChange={(v) => set("contributionAmount", v)}
            placeholder="e.g. 10"
          />
          {errors.contributionAmount && <p className="text-xs text-red-400">{errors.contributionAmount}</p>}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Max members" sub="2 – 16">
            <Input
              type="number"
              value={form.maxMembers}
              onChange={(v) => set("maxMembers", v)}
            />
            {errors.maxMembers && <p className="text-xs text-red-400">{errors.maxMembers}</p>}
          </Field>

          <Field label="Round duration (days)">
            <Input
              type="number"
              value={form.roundDurationDays}
              onChange={(v) => set("roundDurationDays", v)}
            />
            {errors.roundDurationDays && <p className="text-xs text-red-400">{errors.roundDurationDays}</p>}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Grace period (hours)" sub="< round duration">
            <Input
              type="number"
              value={form.gracePeriodHours}
              onChange={(v) => set("gracePeriodHours", v)}
            />
            {errors.gracePeriodHours && <p className="text-xs text-red-400">{errors.gracePeriodHours}</p>}
          </Field>

          <Field label="Start deadline (days)">
            <Input
              type="number"
              value={form.startDeadlineDays}
              onChange={(v) => set("startDeadlineDays", v)}
            />
            {errors.startDeadlineDays && <p className="text-xs text-red-400">{errors.startDeadlineDays}</p>}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Exit penalty %"
            sub="Applied to refund on early exit"
          >
            <Input
              type="number"
              value={form.exitPenaltyPct}
              onChange={(v) => set("exitPenaltyPct", v)}
            />
            {errors.exitPenaltyPct && <p className="text-xs text-red-400">{errors.exitPenaltyPct}</p>}
          </Field>

          <Field
            label="Collateral %"
            sub="Scaled by position: earlier = more"
          >
            <Input
              type="number"
              value={form.collateralPct}
              onChange={(v) => set("collateralPct", v)}
            />
            {errors.collateralPct && <p className="text-xs text-red-400">{errors.collateralPct}</p>}
          </Field>
        </div>

        <Field label="Require clean history">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requireCleanHistory}
              onChange={(e) => set("requireCleanHistory", e.target.checked)}
              className="rounded border-slate-600 bg-slate-700"
            />
            <span className="text-sm text-slate-400">
              Only allow members with zero defaults (MemberHistory.defaults == 0)
            </span>
          </label>
        </Field>

        <div className="pt-2 border-t border-slate-800">
          <TxButton
            onClick={handleCreate}
            state={state}
            disabled={!connected}
          >
            Create circle →
          </TxButton>
          <p className="text-xs text-slate-500 mt-2">
            This creates a circle PDA + vault ATA. The circle starts Filling — members join before the start deadline.
          </p>
        </div>
      </Card>
    </div>
  );
}
