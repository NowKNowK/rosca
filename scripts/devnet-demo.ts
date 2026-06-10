/**
 * devnet-demo.ts
 *
 * End-to-end ROSCA demo on Solana devnet.
 * Creates a 3-member circle with 90-second rounds, runs the full happy path,
 * and prints Solana Explorer links for every transaction type.
 *
 * Usage:
 *   npx ts-node -P cli/tsconfig.json scripts/devnet-demo.ts
 *
 * Prerequisites:
 *   - ~/.config/solana/id.json exists with funded devnet keypair (≥ 0.5 SOL)
 *   - Connected to devnet
 */

import * as fs from "fs";
import * as os from "os";
import * as anchor from "@coral-xyz/anchor";
import { BN, web3 } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { Rosca } from "../target/types/rosca";
import roscaIdl from "../target/idl/rosca.json";

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC = "https://api.devnet.solana.com";
const EXPLORER = "https://explorer.solana.com";
const ROUND_DURATION = 90;  // seconds — short for demo
const GRACE_PERIOD = 15;    // seconds
const AMOUNT = 100_000;     // 0.1 token (6 decimals)
const COLLATERAL_BPS = 5000;
const PENALTY_BPS = 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exploreUrl(sig: string): string {
  return `${EXPLORER}/tx/${sig}?cluster=devnet`;
}

function circlePda(creator: web3.PublicKey, circleId: bigint, programId: web3.PublicKey): web3.PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(circleId);
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("circle"), creator.toBuffer(), buf],
    programId
  );
  return pda;
}

function memberPda(circle: web3.PublicKey, user: web3.PublicKey, programId: web3.PublicKey): web3.PublicKey {
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("member"), circle.toBuffer(), user.toBuffer()],
    programId
  );
  return pda;
}

function historyPda(user: web3.PublicKey, programId: web3.PublicKey): web3.PublicKey {
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("history"), user.toBuffer()],
    programId
  );
  return pda;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(label: string, ms: number): Promise<void> {
  const steps = Math.ceil(ms / 5000);
  const stepMs = Math.ceil(ms / steps);
  process.stdout.write(`  Waiting ${Math.ceil(ms / 1000)}s for ${label}`);
  for (let i = 0; i < steps; i++) {
    await sleep(stepMs);
    process.stdout.write(".");
  }
  console.log(" done");
}

function logTx(label: string, sig: string): void {
  console.log(`  [TX] ${label}`);
  console.log(`       ${exploreUrl(sig)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== ROSCA Devnet Demo ===\n");

  const programId = new web3.PublicKey(roscaIdl.address);

  // Load creator keypair
  const raw = JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8"));
  const creator = web3.Keypair.fromSecretKey(new Uint8Array(raw));

  const connection = new web3.Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(creator),
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  const program = new anchor.Program<Rosca>(roscaIdl as any, provider);

  // Generate alice and bob
  const alice = web3.Keypair.generate();
  const bob   = web3.Keypair.generate();

  console.log(`Creator : ${creator.publicKey.toBase58()}`);
  console.log(`Alice   : ${alice.publicKey.toBase58()}`);
  console.log(`Bob     : ${bob.publicKey.toBase58()}`);
  console.log(`Program : ${programId.toBase58()}`);
  console.log();

  // Fund alice and bob with SOL
  console.log("--- Funding participants ---");
  const transferAmount = 0.15 * web3.LAMPORTS_PER_SOL;
  for (const [name, kp] of [["alice", alice], ["bob", bob]] as [string, web3.Keypair][]) {
    const tx = await connection.sendTransaction(
      new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: kp.publicKey,
          lamports: transferAmount,
        })
      ),
      [creator]
    );
    await connection.confirmTransaction(tx, "confirmed");
    logTx(`Fund ${name}`, tx);
  }
  console.log();

  // Create test mint
  console.log("--- Creating test mint ---");
  const mint = await createMint(connection, creator, creator.publicKey, null, 6);
  console.log(`  Mint: ${mint.toBase58()}`);
  console.log();

  // Fund token accounts for all 3
  console.log("--- Funding token accounts ---");
  for (const [name, kp] of [["creator", creator], ["alice", alice], ["bob", bob]] as [string, web3.Keypair][]) {
    const ata = await createAssociatedTokenAccount(connection, creator, mint, kp.publicKey);
    await mintTo(connection, creator, mint, ata, creator, AMOUNT * 20);
    console.log(`  ${name}: ${ata.toBase58()} (+${AMOUNT * 20} base units)`);
  }
  console.log();

  // Derive circle PDA
  const circleId = BigInt(Date.now());
  const circlePubkey = circlePda(creator.publicKey, circleId, programId);
  const vault = getAssociatedTokenAddressSync(mint, circlePubkey, true);
  const startDeadline = Math.floor(Date.now() / 1000) + 3600;

  // 1. create_circle
  console.log("--- 1. create_circle ---");
  const txCreate = await program.methods
    .createCircle(
      new BN(circleId.toString()),
      new BN(AMOUNT),
      new BN(ROUND_DURATION),
      new BN(GRACE_PERIOD),
      new BN(startDeadline),
      3,
      PENALTY_BPS,
      COLLATERAL_BPS,
      false
    )
    .accounts({
      creator: creator.publicKey,
      circle: circlePubkey,
      tokenMint: mint,
      vault,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc();
  logTx("create_circle", txCreate);
  console.log(`  Circle: ${circlePubkey.toBase58()}`);
  console.log();

  // 2-4. join × 3
  console.log("--- 2-4. join (3 members, auto-start on last) ---");
  for (const [name, kp] of [["creator", creator], ["alice", alice], ["bob", bob]] as [string, web3.Keypair][]) {
    const member  = memberPda(circlePubkey, kp.publicKey, programId);
    const history = historyPda(kp.publicKey, programId);
    const userToken = getAssociatedTokenAddressSync(mint, kp.publicKey);

    // Build provider for this signer
    const p = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" });
    const prog = new anchor.Program<Rosca>(roscaIdl as any, p);

    const tx = await prog.methods
      .join()
      .accounts({
        user: kp.publicKey,
        circle: circlePubkey,
        member,
        history,
        vault,
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
    logTx(`join (${name})`, tx);
  }
  console.log();

  // Check started_at
  const circleState = await program.account.circle.fetch(circlePubkey);
  const startedAt = Number(circleState.startedAt.toString());
  console.log(`  Circle started at: ${new Date(startedAt * 1000).toISOString()}`);
  console.log();

  // 5-7. contribute round 1
  console.log("--- 5-7. contribute (round 1) ---");
  for (const [name, kp] of [["creator", creator], ["alice", alice], ["bob", bob]] as [string, web3.Keypair][]) {
    const member  = memberPda(circlePubkey, kp.publicKey, programId);
    const userToken = getAssociatedTokenAddressSync(mint, kp.publicKey);
    const p = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" });
    const prog = new anchor.Program<Rosca>(roscaIdl as any, p);

    const tx = await prog.methods
      .contribute(1)
      .accounts({
        user: kp.publicKey,
        circle: circlePubkey,
        member,
        vault,
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
    logTx(`contribute r1 (${name})`, tx);
  }
  console.log();

  // 8. claim round 1 (creator = pos 1)
  console.log("--- 8. claim_payout (round 1, creator) ---");
  const creatorMember  = memberPda(circlePubkey, creator.publicKey, programId);
  const creatorToken = getAssociatedTokenAddressSync(mint, creator.publicKey);
  const txClaim1 = await program.methods
    .claimPayout(1)
    .accounts({
      payer: creator.publicKey,
      circle: circlePubkey,
      recipientMember: creatorMember,
      recipient: creator.publicKey,
      recipientToken: creatorToken,
      tokenMint: mint,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc();
  logTx("claim_payout r1", txClaim1);
  console.log();

  // Wait for round 2 window to open
  const round2Start = startedAt + ROUND_DURATION;
  const nowSecs = Math.floor(Date.now() / 1000);
  const waitMs = Math.max(0, (round2Start - nowSecs + 2) * 1000);
  if (waitMs > 0) {
    await waitFor("round 2 window", waitMs);
  }

  // 9-11. contribute round 2
  console.log("--- 9-11. contribute (round 2) ---");
  for (const [name, kp] of [["creator", creator], ["alice", alice], ["bob", bob]] as [string, web3.Keypair][]) {
    const member  = memberPda(circlePubkey, kp.publicKey, programId);
    const userToken = getAssociatedTokenAddressSync(mint, kp.publicKey);
    const p = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" });
    const prog = new anchor.Program<Rosca>(roscaIdl as any, p);

    const tx = await prog.methods
      .contribute(2)
      .accounts({
        user: kp.publicKey,
        circle: circlePubkey,
        member,
        vault,
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
    logTx(`contribute r2 (${name})`, tx);
  }
  console.log();

  // 12. claim round 2 (alice = pos 2)
  console.log("--- 12. claim_payout (round 2, alice) ---");
  const aliceMember = memberPda(circlePubkey, alice.publicKey, programId);
  const aliceToken  = getAssociatedTokenAddressSync(mint, alice.publicKey);
  const txClaim2 = await program.methods
    .claimPayout(2)
    .accounts({
      payer: creator.publicKey,
      circle: circlePubkey,
      recipientMember: aliceMember,
      recipient: alice.publicKey,
      recipientToken: aliceToken,
      tokenMint: mint,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc();
  logTx("claim_payout r2", txClaim2);
  console.log();

  // Wait for round 3 window
  const round3Start = startedAt + 2 * ROUND_DURATION;
  const nowSecs2 = Math.floor(Date.now() / 1000);
  const waitMs2 = Math.max(0, (round3Start - nowSecs2 + 2) * 1000);
  if (waitMs2 > 0) {
    await waitFor("round 3 window", waitMs2);
  }

  // 13-15. contribute round 3
  console.log("--- 13-15. contribute (round 3) ---");
  for (const [name, kp] of [["creator", creator], ["alice", alice], ["bob", bob]] as [string, web3.Keypair][]) {
    const member  = memberPda(circlePubkey, kp.publicKey, programId);
    const userToken = getAssociatedTokenAddressSync(mint, kp.publicKey);
    const p = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" });
    const prog = new anchor.Program<Rosca>(roscaIdl as any, p);

    const tx = await prog.methods
      .contribute(3)
      .accounts({
        user: kp.publicKey,
        circle: circlePubkey,
        member,
        vault,
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
    logTx(`contribute r3 (${name})`, tx);
  }
  console.log();

  // 16. claim round 3 (bob = pos 3) → circle Completed
  console.log("--- 16. claim_payout (round 3, bob) → Completed ---");
  const bobMember  = memberPda(circlePubkey, bob.publicKey, programId);
  const bobToken   = getAssociatedTokenAddressSync(mint, bob.publicKey);
  const txClaim3 = await program.methods
    .claimPayout(3)
    .accounts({
      payer: creator.publicKey,
      circle: circlePubkey,
      recipientMember: bobMember,
      recipient: bob.publicKey,
      recipientToken: bobToken,
      tokenMint: mint,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc();
  logTx("claim_payout r3 (Completed)", txClaim3);
  console.log();

  // 17-19. close_member × 3
  console.log("--- 17-19. close_member (all 3) ---");
  for (const [name, kp] of [["creator", creator], ["alice", alice], ["bob", bob]] as [string, web3.Keypair][]) {
    const member    = memberPda(circlePubkey, kp.publicKey, programId);
    const history   = historyPda(kp.publicKey, programId);
    const memberTok = getAssociatedTokenAddressSync(mint, kp.publicKey);

    const tx = await program.methods
      .closeMember()
      .accounts({
        payer: creator.publicKey,
        circle: circlePubkey,
        member,
        memberOwner: kp.publicKey,
        history,
        tokenMint: mint,
        vault,
        memberToken: memberTok,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
    logTx(`close_member (${name})`, tx);
  }
  console.log();

  // 20. close_circle
  console.log("--- 20. close_circle ---");
  const creatorTokenAta = getAssociatedTokenAddressSync(mint, creator.publicKey);
  const txClose = await program.methods
    .closeCircle()
    .accounts({
      payer: creator.publicKey,
      circle: circlePubkey,
      creator: creator.publicKey,
      tokenMint: mint,
      creatorToken: creatorTokenAta,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc();
  logTx("close_circle", txClose);
  console.log();

  // Summary
  console.log("=== Demo Complete ===\n");
  console.log(`Program  : https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`);
  console.log(`Circle   : https://explorer.solana.com/address/${circlePubkey.toBase58()}?cluster=devnet`);
  console.log();
  console.log("Transaction links:");
  console.log(`  create_circle    : ${exploreUrl(txCreate)}`);
  console.log(`  join (creator)   : ${exploreUrl(txClaim1)}`);
  console.log(`  claim r1         : ${exploreUrl(txClaim1)}`);
  console.log(`  claim r2         : ${exploreUrl(txClaim2)}`);
  console.log(`  claim r3         : ${exploreUrl(txClaim3)}`);
  console.log(`  close_circle     : ${exploreUrl(txClose)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
