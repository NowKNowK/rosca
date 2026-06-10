#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Command } from "commander";
import * as anchor from "@coral-xyz/anchor";
import { BN, web3 } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import type { Rosca } from "../../target/types/rosca";
import roscaIdl from "../../target/idl/rosca.json";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROGRAM_ID = new web3.PublicKey(roscaIdl.address);

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function circlePda(creator: web3.PublicKey, circleId: bigint): web3.PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(circleId);
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("circle"), creator.toBuffer(), buf],
    PROGRAM_ID
  );
  return pda;
}

function memberPda(circle: web3.PublicKey, user: web3.PublicKey): web3.PublicKey {
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("member"), circle.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function historyPda(user: web3.PublicKey): web3.PublicKey {
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("history"), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function vaultAta(circle: web3.PublicKey, mint: web3.PublicKey): web3.PublicKey {
  return getAssociatedTokenAddressSync(mint, circle, true);
}

function userAta(user: web3.PublicKey, mint: web3.PublicKey): web3.PublicKey {
  return getAssociatedTokenAddressSync(mint, user, false);
}

// ─── Config ──────────────────────────────────────────────────────────────────

function loadKeypair(keypairPath: string): web3.Keypair {
  const raw = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return web3.Keypair.fromSecretKey(new Uint8Array(raw));
}

function makeProgram(rpc: string, keypairPath: string): {
  program: anchor.Program<Rosca>;
  wallet: web3.Keypair;
  connection: web3.Connection;
} {
  const wallet = loadKeypair(keypairPath);
  const connection = new web3.Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  const program = new anchor.Program<Rosca>(roscaIdl as any, provider);
  return { program, wallet, connection };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtAmount(raw: { toString(): string } | bigint | number, decimals: number): string {
  const n = BigInt(raw.toString());
  const d = BigInt(10 ** decimals);
  const whole = n / d;
  const frac = n % d;
  return `${whole}.${frac.toString().padStart(decimals, "0")}`;
}

function fmtDuration(secs: number): string {
  if (secs >= 86400) return `${Math.floor(secs / 86400)}d`;
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 60)}m`;
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return "expired";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

function fmtTs(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function short(pk: web3.PublicKey | string): string {
  const s = pk.toString();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function statusLabel(status: any): string {
  if ("filling" in status) return "Filling";
  if ("active" in status) return "Active";
  if ("completed" in status) return "Completed";
  if ("cancelled" in status) return "Cancelled";
  return "Unknown";
}

function memberStatusLabel(status: any): string {
  if ("active" in status) return "Active";
  if ("exited" in status) return "Exited";
  if ("defaulted" in status) return "Defaulted";
  if ("completed" in status) return "Completed";
  return "?";
}

function popcount(n: number): number {
  let c = 0;
  while (n) { c += n & 1; n >>= 1; }
  return c;
}

function effPos(position: number, removedPositions: number): number {
  const mask = (1 << (position - 1)) - 1;
  return position - popcount(removedPositions & mask);
}

// ─── Status display ───────────────────────────────────────────────────────────

async function printStatus(
  program: anchor.Program<Rosca>,
  connection: web3.Connection,
  circlePubkey: web3.PublicKey
): Promise<void> {
  const circle = await program.account.circle.fetch(circlePubkey);
  const now = Math.floor(Date.now() / 1000);

  // Fetch token decimals
  let decimals = 6;
  try {
    const mintInfo = await getMint(connection, circle.tokenMint);
    decimals = mintInfo.decimals;
  } catch {}

  const statusStr = statusLabel(circle.status);
  const isActive = "active" in circle.status;
  const startedAt = Number(circle.startedAt.toString());
  const roundDuration = Number(circle.roundDuration.toString());
  const gracePeriod = Number(circle.gracePeriod.toString());
  const totalRounds = circle.totalRounds as number;

  let currentRound = 0;
  if (isActive && startedAt > 0) {
    currentRound = Math.floor((now - startedAt) / roundDuration) + 1;
    currentRound = Math.min(currentRound, totalRounds);
  }

  // Header
  console.log();
  console.log(`ROSCA Circle Status`);
  console.log(`${"─".repeat(72)}`);
  console.log(`Address    : ${circlePubkey.toBase58()}`);
  if (isActive) {
    const roundEnd = startedAt + currentRound * roundDuration;
    const windowEnd = roundEnd + gracePeriod;
    const timeLeft = windowEnd - now;
    console.log(`Status     : ${statusStr} | Round ${currentRound}/${totalRounds} | Window ${timeLeft > 0 ? "closes in " + fmtCountdown(timeLeft) : "CLOSED"}`);
  } else {
    console.log(`Status     : ${statusStr}`);
  }
  console.log(`Token      : ${short(circle.tokenMint)}  Amount: ${fmtAmount(circle.contributionAmount, decimals)} per round`);
  console.log(`Config     : Duration ${fmtDuration(roundDuration)}  Grace ${fmtDuration(gracePeriod)}  Penalty ${circle.exitPenaltyBps / 100}%  Collateral ${circle.collateralBps / 100}%`);
  if ("filling" in circle.status) {
    const deadline = Number(circle.startDeadline.toString());
    const secsLeft = deadline - now;
    console.log(`Filling    : ${circle.memberCount}/${circle.maxMembers} joined | Deadline: ${fmtTs(deadline)} (${fmtCountdown(secsLeft)})`);
  }
  if (circle.refundReserve.gt(new BN(0))) {
    console.log(`Reserve    : ${fmtAmount(circle.refundReserve, decimals)} (exit refunds)`);
  }

  // Fetch all members for this circle
  const members = await program.account.member.all([
    {
      memcmp: {
        offset: 8, // discriminator (8 bytes), then circle field
        bytes: circlePubkey.toBase58(),
      },
    },
  ]);

  // Sort by position
  members.sort((a, b) => a.account.position - b.account.position);

  if (members.length === 0) {
    console.log("\nNo member accounts found.");
    return;
  }

  // Round header row
  const roundCols = totalRounds;
  const nameWidth = 14;
  const colWidth = 6;

  console.log();
  console.log("Member Matrix");

  // Build round headers
  let header = `  ${"Pos / Address".padEnd(nameWidth + 8)} `;
  for (let r = 1; r <= roundCols; r++) {
    const claimed = (circle.claimedRounds as number) & (1 << (r - 1));
    const label = claimed ? `R${r}[✓]` : `R${r}   `;
    header += label.padEnd(colWidth + 1);
  }
  header += "  Status";
  console.log(header);
  console.log("  " + "─".repeat(nameWidth + 8 + (colWidth + 1) * roundCols + 10));

  const removedPositions = circle.removedPositions as number;
  const claimedRounds = circle.claimedRounds as number;
  const contributionCounts = circle.contributionCounts as number[];
  const activeMembers = circle.activeMembers as number;

  for (const m of members) {
    const acc = m.account;
    const pos = acc.position;
    const eff = effPos(pos, removedPositions);
    const contributions = acc.contributions as number;
    const mStatus = memberStatusLabel(acc.status);
    const isExited = "exited" in acc.status;
    const isDefaulted = "defaulted" in acc.status;

    const recipientMarker = !isExited && !isDefaulted && !acc.hasReceivedPayout ? `[pos${pos}]` : `(${mStatus.slice(0, 3)})`;
    const label = `${short(acc.user)} ${recipientMarker}`.padEnd(nameWidth + 8);

    let row = `  ${label} `;

    for (let r = 1; r <= roundCols; r++) {
      const contributed = (contributions & (1 << (r - 1))) !== 0;
      const roundEnd = startedAt + r * roundDuration + gracePeriod;
      const windowClosed = now >= roundEnd;
      const roundClaimed = (claimedRounds & (1 << (r - 1))) !== 0;

      let cell: string;
      if (isDefaulted) {
        cell = contributed ? " ✓  " : (windowClosed ? " ✗  " : " ·  ");
      } else if (isExited) {
        cell = contributed ? " ✓  " : " ·  ";
      } else if (contributed) {
        cell = " ✓  ";
      } else if (!isActive || r > currentRound) {
        cell = " ·  ";
      } else if (windowClosed) {
        cell = " ✗  ";
      } else {
        cell = " ?  ";
      }

      // Mark the recipient round
      if (eff === r && !isExited && !isDefaulted) {
        if (acc.hasReceivedPayout) {
          cell = "[★✓]";
        } else if (roundClaimed) {
          cell = "[★!]";
        } else {
          cell = `[★${cell.trim()}]`.slice(0, 4);
        }
      }

      row += cell.padEnd(colWidth + 1);
    }

    row += `  ${mStatus}`;
    if (isExited && acc.refundDue.gtn(0)) {
      row += `  refund: ${fmtAmount(acc.refundDue, decimals)}`;
    }
    console.log(row);
  }

  // Legend
  console.log();
  console.log("  Legend: ✓ contributed  ✗ missed (slashable)  · future  [★] payout slot");
  console.log();

  // Pending actions
  const actions: string[] = [];
  if (isActive) {
    // Claimable rounds
    for (let r = 1; r <= totalRounds; r++) {
      const claimed = (claimedRounds & (1 << (r - 1))) !== 0;
      if (!claimed) {
        const roundEnd = startedAt + r * roundDuration;
        const windowEnd = roundEnd + gracePeriod;
        const potFull = contributionCounts[r - 1] === activeMembers;
        if (now >= windowEnd || potFull) {
          actions.push(`  rosca-cli claim ${circlePubkey.toBase58()} ${r}   (round ${r} pot ready)`);
        }
      }
    }
    // Slashable members
    for (const m of members) {
      if (!("active" in m.account.status)) continue;
      for (let r = 1; r <= currentRound; r++) {
        const contributed = (m.account.contributions as number) & (1 << (r - 1));
        if (contributed) continue;
        const roundEnd = startedAt + r * roundDuration + gracePeriod;
        if (now < roundEnd) continue;
        const slashed = !("active" in m.account.status);
        if (!slashed) {
          actions.push(`  rosca-cli slash ${circlePubkey.toBase58()} ${m.publicKey.toBase58()} ${r}   (${short(m.account.user)} missed round ${r})`);
        }
      }
    }
  }
  if (actions.length > 0) {
    console.log("Pending actions:");
    actions.forEach(a => console.log(a));
    console.log();
  }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name("rosca-cli")
  .description("CLI for the on-chain ROSCA (Rotating Savings and Credit Association)")
  .version("0.1.0")
  .option("--rpc <url>", "Solana RPC endpoint", "https://api.devnet.solana.com")
  .option("--keypair <path>", "Path to keypair JSON", `${os.homedir()}/.config/solana/id.json`);

// ─── create ──────────────────────────────────────────────────────────────────

program
  .command("create")
  .description("Create a new ROSCA circle")
  .requiredOption("--mint <pubkey>", "SPL token mint address")
  .requiredOption("--amount <n>", "Contribution amount per round (in base units)")
  .requiredOption("--members <n>", "Number of members (2-16)")
  .option("--id <n>", "Circle ID (u64, default: Unix timestamp)", String(Date.now()))
  .option("--round-duration <secs>", "Round duration in seconds (min 60)", "86400")
  .option("--grace <secs>", "Grace period in seconds", "3600")
  .option("--deadline <secs>", "Seconds from now until start deadline", "86400")
  .option("--penalty-bps <bps>", "Exit penalty basis points (0-10000)", "1000")
  .option("--collateral-bps <bps>", "Collateral fraction basis points (0-10000)", "5000")
  .option("--strict", "Require clean history (no defaults) to join", false)
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const mint = new web3.PublicKey(opts.mint);
    const circleId = BigInt(opts.id);
    const deadline = Math.floor(Date.now() / 1000) + Number(opts.deadline);

    const circle = circlePda(wallet.publicKey, circleId);
    const vault = vaultAta(circle, mint);

    console.log(`Creating circle ${circle.toBase58()} …`);

    const tx = await anchorProg.methods
      .createCircle(
        new BN(circleId.toString()),
        new BN(opts.amount),
        new BN(opts.roundDuration),
        new BN(opts.grace),
        new BN(deadline),
        Number(opts.members),
        Number(opts.penaltyBps),
        Number(opts.collateralBps),
        !!opts.strict
      )
      .accounts({
        creator: wallet.publicKey,
        circle,
        tokenMint: mint,
        vault,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    console.log(`Circle created: ${circle.toBase58()}`);
    console.log(`TX: ${tx}`);
  });

// ─── join ─────────────────────────────────────────────────────────────────────

program
  .command("join <circle>")
  .description("Join a filling circle (transfers collateral)")
  .action(async (circleAddr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);
    const circle = await anchorProg.account.circle.fetch(circlePubkey);
    const member = memberPda(circlePubkey, wallet.publicKey);
    const history = historyPda(wallet.publicKey);
    const vault = vaultAta(circlePubkey, circle.tokenMint);
    const userToken = userAta(wallet.publicKey, circle.tokenMint);

    console.log(`Joining circle ${circleAddr} …`);

    const tx = await anchorProg.methods
      .join()
      .accounts({
        user: wallet.publicKey,
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

    const memberAcc = await anchorProg.account.member.fetch(member);
    console.log(`Joined at position ${memberAcc.position}`);
    console.log(`TX: ${tx}`);
  });

// ─── leave ────────────────────────────────────────────────────────────────────

program
  .command("leave <circle>")
  .description("Leave a filling circle (full collateral refund)")
  .action(async (circleAddr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);
    const circle = await anchorProg.account.circle.fetch(circlePubkey);
    const member = memberPda(circlePubkey, wallet.publicKey);
    const vault = vaultAta(circlePubkey, circle.tokenMint);
    const userToken = userAta(wallet.publicKey, circle.tokenMint);

    console.log(`Leaving circle ${circleAddr} …`);

    const tx = await anchorProg.methods
      .leave()
      .accounts({
        user: wallet.publicKey,
        circle: circlePubkey,
        member,
        vault,
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      } as any)
      .rpc();

    console.log(`Left circle. Collateral returned.`);
    console.log(`TX: ${tx}`);
  });

// ─── pay (contribute) ─────────────────────────────────────────────────────────

program
  .command("pay <circle>")
  .description("Contribute to the current round (auto-adds surcharge if any)")
  .option("--round <n>", "Override round number (default: auto-detect current)")
  .action(async (circleAddr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet, connection } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);
    const circle = await anchorProg.account.circle.fetch(circlePubkey);
    const member = memberPda(circlePubkey, wallet.publicKey);
    const memberAcc = await anchorProg.account.member.fetch(member);

    const now = Math.floor(Date.now() / 1000);
    const startedAt = Number(circle.startedAt.toString());
    const roundDuration = Number(circle.roundDuration.toString());

    let round: number;
    if (opts.round) {
      round = Number(opts.round);
    } else {
      round = Math.floor((now - startedAt) / roundDuration) + 1;
      round = Math.min(round, circle.totalRounds as number);
    }

    const surchargeAccrued = BigInt(circle.surchargeAccrued.toString());
    const surchargePaid = BigInt(memberAcc.surchargePaid.toString());
    const surchargedue = surchargeAccrued > surchargePaid ? surchargeAccrued - surchargePaid : BigInt(0);
    const amount = BigInt(circle.contributionAmount.toString());

    let decimals = 6;
    try {
      const mintInfo = await getMint(connection, circle.tokenMint);
      decimals = mintInfo.decimals;
    } catch {}

    console.log(`Paying round ${round}:`);
    console.log(`  Base contribution : ${fmtAmount(amount, decimals)}`);
    if (surchargedue > 0) {
      console.log(`  Surcharge         : ${fmtAmount(surchargedue, decimals)}  (covers exited member refund)`);
    }
    console.log(`  Total             : ${fmtAmount(amount + surchargedue, decimals)}`);

    const vault = vaultAta(circlePubkey, circle.tokenMint);
    const userToken = userAta(wallet.publicKey, circle.tokenMint);

    const tx = await anchorProg.methods
      .contribute(round)
      .accounts({
        user: wallet.publicKey,
        circle: circlePubkey,
        member,
        vault,
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    console.log(`Contributed to round ${round}.`);
    console.log(`TX: ${tx}`);
  });

// ─── claim ────────────────────────────────────────────────────────────────────

program
  .command("claim <circle> <round>")
  .description("Claim the payout for a round (permissionless — sends to scheduled recipient)")
  .action(async (circleAddr, roundStr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);
    const round = Number(roundStr);
    const circle = await anchorProg.account.circle.fetch(circlePubkey);

    // Find the recipient: member with eff_pos == round
    const allMembers = await anchorProg.account.member.all([
      { memcmp: { offset: 8, bytes: circlePubkey.toBase58() } },
    ]);
    const removedPositions = circle.removedPositions as number;
    const recipient = allMembers.find(
      m => effPos(m.account.position, removedPositions) === round && !("exited" in m.account.status) && !("defaulted" in m.account.status)
    );
    if (!recipient) {
      console.error(`No eligible recipient found for round ${round}`);
      process.exit(1);
    }

    const recipientUser = recipient.account.user;
    const recipientMember = memberPda(circlePubkey, recipientUser);
    const recipientToken = userAta(recipientUser, circle.tokenMint);
    const vault = vaultAta(circlePubkey, circle.tokenMint);

    console.log(`Claiming round ${round} payout for ${short(recipientUser)} …`);

    const tx = await anchorProg.methods
      .claimPayout(round)
      .accounts({
        payer: wallet.publicKey,
        circle: circlePubkey,
        recipientMember,
        recipient: recipientUser,
        recipientToken,
        tokenMint: circle.tokenMint,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    console.log(`Round ${round} payout claimed.`);
    console.log(`TX: ${tx}`);
  });

// ─── exit ─────────────────────────────────────────────────────────────────────

program
  .command("exit <circle>")
  .description("Exit the circle early (refund deferred to close; surcharge distributed to remaining members)")
  .action(async (circleAddr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet, connection } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);
    const circle = await anchorProg.account.circle.fetch(circlePubkey);
    const member = memberPda(circlePubkey, wallet.publicKey);
    const memberAcc = await anchorProg.account.member.fetch(member);

    let decimals = 6;
    try { decimals = (await getMint(connection, circle.tokenMint)).decimals; } catch {}

    const k = popcount(memberAcc.contributions as number);
    const amount = Number(circle.contributionAmount.toString());
    const penalty = Number(circle.exitPenaltyBps);
    const refundEstimate = Math.floor(k * amount * (10000 - penalty) / 10000);

    console.log(`Exiting circle ${circleAddr} …`);
    console.log(`  Contributed rounds: ${k}`);
    console.log(`  Estimated refund  : ~${fmtAmount(refundEstimate, decimals)} (paid at circle close)`);

    const tx = await anchorProg.methods
      .exitEarly()
      .accounts({
        user: wallet.publicKey,
        circle: circlePubkey,
        member,
      } as any)
      .rpc();

    console.log(`Exited. Refund will be released at circle close.`);
    console.log(`TX: ${tx}`);
  });

// ─── slash ────────────────────────────────────────────────────────────────────

program
  .command("slash <circle> <member> <round>")
  .description("Slash a member who missed a round (permissionless)")
  .action(async (circleAddr, memberAddr, roundStr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);
    const memberPubkey = new web3.PublicKey(memberAddr);
    const round = Number(roundStr);

    const memberAcc = await anchorProg.account.member.fetch(memberPubkey);
    const history = historyPda(memberAcc.user);

    console.log(`Slashing ${short(memberAcc.user)} for round ${round} …`);

    const tx = await anchorProg.methods
      .slash(round)
      .accounts({
        payer: wallet.publicKey,
        circle: circlePubkey,
        member: memberPubkey,
        history,
      } as any)
      .rpc();

    console.log(`Slashed. Collateral redistributed to round pot.`);
    console.log(`TX: ${tx}`);
  });

// ─── cancel ───────────────────────────────────────────────────────────────────

program
  .command("cancel <circle>")
  .description("Cancel a filling circle that missed its start deadline (permissionless)")
  .action(async (circleAddr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);

    console.log(`Cancelling circle ${circleAddr} …`);

    const tx = await anchorProg.methods
      .cancelCircle()
      .accounts({ payer: wallet.publicKey, circle: circlePubkey } as any)
      .rpc();

    console.log(`Circle cancelled. Members can now call: rosca-cli close ${circleAddr}`);
    console.log(`TX: ${tx}`);
  });

// ─── close ────────────────────────────────────────────────────────────────────

program
  .command("close <circle>")
  .description("Close your member account; if all members are closed, closes the circle too")
  .option("--member <pubkey>", "Close a specific member account (permissionless)")
  .action(async (circleAddr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, wallet } = makeProgram(globalOpts.rpc, globalOpts.keypair);

    const circlePubkey = new web3.PublicKey(circleAddr);
    const circle = await anchorProg.account.circle.fetch(circlePubkey);

    const memberPubkey = opts.member
      ? new web3.PublicKey(opts.member)
      : memberPda(circlePubkey, wallet.publicKey);

    const memberAcc = await anchorProg.account.member.fetch(memberPubkey);
    const memberOwner = memberAcc.user;
    const history = historyPda(memberOwner);
    const vault = vaultAta(circlePubkey, circle.tokenMint);
    const memberToken = userAta(memberOwner, circle.tokenMint);

    console.log(`Closing member account for ${short(memberOwner)} …`);

    const tx1 = await anchorProg.methods
      .closeMember()
      .accounts({
        payer: wallet.publicKey,
        circle: circlePubkey,
        member: memberPubkey,
        memberOwner,
        history,
        tokenMint: circle.tokenMint,
        vault,
        memberToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    console.log(`Member account closed. TX: ${tx1}`);

    // Re-fetch circle to check if all members are closed
    const circleUpdated = await anchorProg.account.circle.fetch(circlePubkey);
    if (circleUpdated.openMemberAccounts === 0) {
      console.log(`All member accounts closed. Closing circle …`);
      const creatorToken = userAta(circleUpdated.creator, circle.tokenMint);
      const tx2 = await anchorProg.methods
        .closeCircle()
        .accounts({
          payer: wallet.publicKey,
          circle: circlePubkey,
          creator: circleUpdated.creator,
          tokenMint: circle.tokenMint,
          creatorToken,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();
      console.log(`Circle closed. Creator received any remaining dust. TX: ${tx2}`);
    } else {
      console.log(`${circleUpdated.openMemberAccounts} member account(s) still open.`);
    }
  });

// ─── status ───────────────────────────────────────────────────────────────────

program
  .command("status <circle>")
  .description("Display circle status and member contribution matrix")
  .action(async (circleAddr, opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    const { program: anchorProg, connection } = makeProgram(globalOpts.rpc, globalOpts.keypair);
    const circlePubkey = new web3.PublicKey(circleAddr);
    await printStatus(anchorProg, connection, circlePubkey);
  });

program.parse(process.argv);
