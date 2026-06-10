import * as anchor from "@coral-xyz/anchor";
import { BN, Program, web3 } from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BankrunProvider } from "anchor-bankrun";
import { Rosca } from "../target/types/rosca";

// ─── PDA helpers ────────────────────────────────────────────────────────────

export function circlePda(
  programId: web3.PublicKey,
  creator: web3.PublicKey,
  circleId: bigint
): [web3.PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(circleId);
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("circle"), creator.toBuffer(), buf],
    programId
  );
}

export function memberPda(
  programId: web3.PublicKey,
  circle: web3.PublicKey,
  user: web3.PublicKey
): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("member"), circle.toBuffer(), user.toBuffer()],
    programId
  );
}

export function historyPda(
  programId: web3.PublicKey,
  user: web3.PublicKey
): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("history"), user.toBuffer()],
    programId
  );
}

export function vaultAddress(
  circle: web3.PublicKey,
  mint: web3.PublicKey
): web3.PublicKey {
  return getAssociatedTokenAddressSync(mint, circle, true);
}

export function userAta(
  user: web3.PublicKey,
  mint: web3.PublicKey
): web3.PublicKey {
  return getAssociatedTokenAddressSync(mint, user, false);
}

// ─── Vault invariant check ───────────────────────────────────────────────────

export async function assertVaultInvariant(
  program: Program<Rosca>,
  circlePubkey: web3.PublicKey
): Promise<void> {
  const circle = await program.account.circle.fetch(circlePubkey);
  const vault = await getAccount(
    program.provider.connection,
    circle.vault
  );

  const totalCollateral = BigInt(circle.totalCollateral.toString());
  const refundReserve = BigInt(circle.refundReserve.toString());
  const contributionAmount = BigInt(circle.contributionAmount.toString());

  // Sum unclaimed pots
  let unclaimedPots = BigInt(0);
  const totalRounds = circle.totalRounds as number;
  const claimedRounds = circle.claimedRounds as number;
  for (let r = 1; r <= totalRounds; r++) {
    const bit = 1 << (r - 1);
    if ((claimedRounds & bit) === 0) {
      // unclaimed
      const count = BigInt((circle.contributionCounts as number[])[r - 1]);
      const bonus = BigInt((circle.potBonus as BN[])[r - 1].toString());
      unclaimedPots += contributionAmount * count + bonus;
    }
  }

  const expected = totalCollateral + unclaimedPots + refundReserve;
  const actual = BigInt(vault.amount.toString());

  if (actual !== expected) {
    throw new Error(
      `Vault invariant VIOLATED!\n` +
        `  vault.amount    = ${actual}\n` +
        `  expected        = ${expected}\n` +
        `  totalCollateral = ${totalCollateral}\n` +
        `  unclaimedPots   = ${unclaimedPots}\n` +
        `  refundReserve   = ${refundReserve}`
    );
  }
}

// ─── Time helpers ───────────────────────────────────────────────────────────

export function warpTo(
  context: any,
  unixTimestamp: bigint
): void {
  context.setClock(
    new (require("solana-bankrun").Clock)(
      BigInt(0),
      BigInt(0),
      BigInt(0),
      BigInt(0),
      unixTimestamp
    )
  );
}

// ─── Token helpers ──────────────────────────────────────────────────────────

export async function createTestMint(
  context: any,
  payer: web3.Keypair
): Promise<web3.PublicKey> {
  const mint = web3.Keypair.generate();
  const client = context.banksClient;
  // Use @solana/spl-token functions against BanksClient connection
  return await createMint(
    context.banksClient,
    payer,
    payer.publicKey,
    null,
    6
  );
}

export async function fundTokenAccount(
  context: any,
  payer: web3.Keypair,
  mint: web3.PublicKey,
  owner: web3.PublicKey,
  amount: bigint
): Promise<web3.PublicKey> {
  const ata = await createAssociatedTokenAccount(
    context.banksClient,
    payer,
    mint,
    owner
  );
  await mintTo(
    context.banksClient,
    payer,
    mint,
    ata,
    payer,
    amount
  );
  return ata;
}
