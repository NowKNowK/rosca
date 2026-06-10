import * as anchor from "@coral-xyz/anchor";
import { BN, web3 } from "@coral-xyz/anchor";
import { startAnchor, BankrunProvider } from "anchor-bankrun";
import { Clock } from "solana-bankrun";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { Rosca } from "../target/types/rosca";
import roscaIdl from "../target/idl/rosca.json";

// ─── Program ID (matches declare_id!) ───────────────────────────────────────

const PROGRAM_ID = new web3.PublicKey(
  "A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj"
);

// ─── PDA helpers ────────────────────────────────────────────────────────────

function circlePda(
  creator: web3.PublicKey,
  circleId: bigint
): [web3.PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(circleId);
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("circle"), creator.toBuffer(), buf],
    PROGRAM_ID
  );
}

function memberPda(
  circle: web3.PublicKey,
  user: web3.PublicKey
): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("member"), circle.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
}

function historyPda(user: web3.PublicKey): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("history"), user.toBuffer()],
    PROGRAM_ID
  );
}

function vaultAta(circle: web3.PublicKey, mint: web3.PublicKey) {
  return getAssociatedTokenAddressSync(mint, circle, true);
}

function userAta(user: web3.PublicKey, mint: web3.PublicKey) {
  return getAssociatedTokenAddressSync(mint, user, false);
}

// ─── Bankrun helpers ────────────────────────────────────────────────────────

async function sendTx(
  context: any,
  instructions: web3.TransactionInstruction[],
  signers: web3.Keypair[]
) {
  const tx = new web3.Transaction();
  tx.recentBlockhash = context.lastBlockhash;
  tx.feePayer = context.payer.publicKey;
  tx.add(...instructions);
  const allSigners = [context.payer, ...signers];
  tx.sign(...allSigners);
  await context.banksClient.processTransaction(tx);
}

async function createTestMint(
  context: any,
  decimals = 6
): Promise<web3.PublicKey> {
  const mintKp = web3.Keypair.generate();
  const rent = await context.banksClient.getRent();
  const lamports = rent.minimumBalance(BigInt(MINT_SIZE));
  await sendTx(
    context,
    [
      web3.SystemProgram.createAccount({
        fromPubkey: context.payer.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: MINT_SIZE,
        lamports: Number(lamports),
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKp.publicKey,
        decimals,
        context.payer.publicKey,
        null
      ),
    ],
    [mintKp]
  );
  return mintKp.publicKey;
}

async function fundUserToken(
  context: any,
  mint: web3.PublicKey,
  user: web3.PublicKey,
  amount: bigint
): Promise<web3.PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, user);
  await sendTx(
    context,
    [
      createAssociatedTokenAccountInstruction(
        context.payer.publicKey,
        ata,
        user,
        mint
      ),
      createMintToInstruction(mint, ata, context.payer.publicKey, amount),
    ],
    []
  );
  return ata;
}

async function getTokenBalance(
  context: any,
  ata: web3.PublicKey
): Promise<bigint> {
  const info = await context.banksClient.getAccount(ata);
  if (!info) return BigInt(0);
  // Parse SPL token account amount (bytes 64-72)
  const data = Buffer.from(info.data);
  return data.readBigUInt64LE(64);
}

async function setTime(context: any, unixTimestamp: bigint) {
  const current = await context.banksClient.getClock();
  context.setClock(
    new Clock(
      current.slot,
      current.epochStartTimestamp,
      current.epoch,
      current.leaderScheduleEpoch,
      unixTimestamp
    )
  );
}

// ─── Vault invariant ────────────────────────────────────────────────────────

async function assertVaultInvariant(
  program: anchor.Program<Rosca>,
  circlePubkey: web3.PublicKey
) {
  const circle = await program.account.circle.fetch(circlePubkey);
  const vaultBalance = await getTokenBalance(
    (program.provider as BankrunProvider).context,
    circle.vault
  );

  const totalCollateral = BigInt(circle.totalCollateral.toString());
  const refundReserve = BigInt(circle.refundReserve.toString());
  const contributionAmount = BigInt(circle.contributionAmount.toString());

  let unclaimedPots = BigInt(0);
  const totalRounds = circle.totalRounds as number;
  const claimedRounds = circle.claimedRounds as number;
  for (let r = 1; r <= totalRounds; r++) {
    if ((claimedRounds & (1 << (r - 1))) === 0) {
      const count = BigInt((circle.contributionCounts as number[])[r - 1]);
      const bonus = BigInt((circle.potBonus as BN[])[r - 1].toString());
      unclaimedPots += contributionAmount * count + bonus;
    }
  }

  const expected = totalCollateral + unclaimedPots + refundReserve;
  assert.equal(
    vaultBalance,
    expected,
    `Vault invariant violated: actual=${vaultBalance} expected=${expected} ` +
      `(collateral=${totalCollateral} pots=${unclaimedPots} reserve=${refundReserve})`
  );
}

// ─── Test setup helpers ──────────────────────────────────────────────────────

type TestSetup = {
  context: any;
  provider: BankrunProvider;
  program: anchor.Program<Rosca>;
  mint: web3.PublicKey;
};

async function setupTest(): Promise<TestSetup> {
  const context = await startAnchor(".", [], []);
  const provider = new BankrunProvider(context);
  // Create a fresh program instance per test — do NOT use anchor.workspace
  // because it caches the program with the first provider.
  const program = new anchor.Program<Rosca>(roscaIdl as any, provider);

  const mint = await createTestMint(context);
  return { context, provider, program, mint };
}

// ─── create_circle helper ────────────────────────────────────────────────────

const DAY = BigInt(86400);
const GRACE = BigInt(3600); // 1 hour grace

async function createCircle(
  program: anchor.Program<Rosca>,
  context: any,
  creator: web3.Keypair,
  mint: web3.PublicKey,
  opts: {
    circleId?: bigint;
    amount?: bigint;
    maxMembers?: number;
    roundDuration?: bigint;
    grace?: bigint;
    startDeadline?: bigint;
    penaltyBps?: number;
    collateralBps?: number;
    requireCleanHistory?: boolean;
  } = {}
): Promise<{ circlePubkey: web3.PublicKey; vault: web3.PublicKey }> {
  const circleId = opts.circleId ?? BigInt(1);
  const amount = opts.amount ?? BigInt(1_000_000); // 1 USDC (6 decimals)
  const maxMembers = opts.maxMembers ?? 3;
  const roundDuration = opts.roundDuration ?? DAY;
  const grace = opts.grace ?? GRACE;
  const nowClock = await context.banksClient.getClock();
  const startDeadline =
    opts.startDeadline ?? nowClock.unixTimestamp + BigInt(3600);

  const [circle] = circlePda(creator.publicKey, circleId);
  const vault = vaultAta(circle, mint);

  await program.methods
    .createCircle(
      new BN(circleId.toString()),
      new BN(amount.toString()),
      new BN(roundDuration.toString()),
      new BN(grace.toString()),
      new BN(startDeadline.toString()),
      maxMembers,
      opts.penaltyBps ?? 1000, // 10%
      opts.collateralBps ?? 5000, // 50%
      opts.requireCleanHistory ?? false
    )
    .accounts({
      creator: creator.publicKey,
      circle,
      tokenMint: mint,
      vault,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .signers([creator])
    .rpc();

  return { circlePubkey: circle, vault };
}

// ─── join helper ─────────────────────────────────────────────────────────────

async function joinCircle(
  program: anchor.Program<Rosca>,
  context: any,
  user: web3.Keypair,
  circle: web3.PublicKey,
  mint: web3.PublicKey
) {
  const [member] = memberPda(circle, user.publicKey);
  const [history] = historyPda(user.publicKey);
  const vault = vaultAta(circle, mint);
  const userToken = userAta(user.publicKey, mint);

  // Ensure user has a token account
  const existing = await context.banksClient.getAccount(userToken);
  if (!existing) {
    await sendTx(
      context,
      [
        createAssociatedTokenAccountInstruction(
          context.payer.publicKey,
          userToken,
          user.publicKey,
          mint
        ),
      ],
      []
    );
  }

  await program.methods
    .join()
    .accounts({
      user: user.publicKey,
      circle,
      member,
      history,
      vault,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .signers([user])
    .rpc();
}

// ─── contribute helper ───────────────────────────────────────────────────────

async function contribute(
  program: anchor.Program<Rosca>,
  user: web3.Keypair,
  circle: web3.PublicKey,
  mint: web3.PublicKey,
  round: number
) {
  const [member] = memberPda(circle, user.publicKey);
  const vault = vaultAta(circle, mint);
  const userToken = userAta(user.publicKey, mint);

  await program.methods
    .contribute(round)
    .accounts({
      user: user.publicKey,
      circle,
      member,
      vault,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .signers([user])
    .rpc();
}

// ─── claimPayout helper ───────────────────────────────────────────────────────

async function claimPayout(
  program: anchor.Program<Rosca>,
  context: any,
  payer: web3.Keypair,
  circle: web3.PublicKey,
  mint: web3.PublicKey,
  recipientUser: web3.PublicKey,
  round: number
) {
  const [recipientMember] = memberPda(circle, recipientUser);
  const recipientToken = userAta(recipientUser, mint);

  await program.methods
    .claimPayout(round)
    .accounts({
      payer: payer.publicKey,
      circle,
      recipientMember,
      recipient: recipientUser,
      recipientToken,
      tokenMint: mint,
      vault: vaultAta(circle, mint),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .signers([payer])
    .rpc();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("rosca", () => {
  // ─── 1. Happy path N=3 ────────────────────────────────────────────────────
  it("happy path: 3 members, full cycle", async () => {
    const { context, program, mint } = await setupTest();

    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate(); // pos 2
    const bob = web3.Keypair.generate();   // pos 3

    // Fund users (need SOL for fees and tokens for contributions)
    for (const u of [creator, alice, bob]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000,
        data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId,
        executable: false,
      });
    }

    const AMOUNT = BigInt(1_000_000);
    const COLLATERAL_BPS = 5000;
    // collateral(1) = 2 * 1_000_000 * 5000 / 10000 = 1_000_000
    // collateral(2) = 1 * 1_000_000 * 5000 / 10000 = 500_000
    // collateral(3) = 0

    // Fund token accounts
    for (const u of [creator, alice, bob]) {
      await fundUserToken(context, mint, u.publicKey, AMOUNT * BigInt(10));
    }

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(1), amount: AMOUNT, maxMembers: 3,
        roundDuration: DAY, grace: GRACE, collateralBps: COLLATERAL_BPS }
    );

    // Join — creator gets pos 1, alice pos 2, bob pos 3 (auto-start on bob's join)
    await joinCircle(program, context, creator, circlePubkey, mint);
    await joinCircle(program, context, alice, circlePubkey, mint);
    await joinCircle(program, context, bob, circlePubkey, mint);
    await assertVaultInvariant(program, circlePubkey);

    const circleState = await program.account.circle.fetch(circlePubkey);
    assert.property(circleState.status, "active");
    assert.equal(circleState.totalRounds, 3);

    const startedAt = BigInt(circleState.startedAt.toString());

    // Round 1: everyone contributes, then creator (pos 1) claims
    await setTime(context, startedAt + BigInt(100));
    await contribute(program, creator, circlePubkey, mint, 1);
    await contribute(program, alice, circlePubkey, mint, 1);
    await contribute(program, bob, circlePubkey, mint, 1);
    await assertVaultInvariant(program, circlePubkey);

    // Early claim (pot full before window ends)
    await claimPayout(program, context, creator, circlePubkey, mint, creator.publicKey, 1);
    await assertVaultInvariant(program, circlePubkey);

    const creatorBalAfterClaim = await getTokenBalance(context, userAta(creator.publicKey, mint));
    // creator paid collateral 1_000_000, contributed 1_000_000, received pot 3_000_000
    // net = initial - 1_000_000 (collateral) - 1_000_000 (contribution) + 3_000_000 (pot)
    //     = 10_000_000 + 1_000_000 = 11_000_000 (collateral still locked)
    // Actually: initial=10M, -1M(collateral)-1M(contrib)+3M(payout) = 11M
    assert.equal(creatorBalAfterClaim, BigInt(11_000_000));

    // Round 2: after grace, alice (pos 2) claims
    await setTime(context, startedAt + DAY + GRACE + BigInt(1));
    await contribute(program, creator, circlePubkey, mint, 2);
    await contribute(program, alice, circlePubkey, mint, 2);
    await contribute(program, bob, circlePubkey, mint, 2);
    await assertVaultInvariant(program, circlePubkey);

    await claimPayout(program, context, alice, circlePubkey, mint, alice.publicKey, 2);
    await assertVaultInvariant(program, circlePubkey);

    // Round 3: bob (pos 3) claims
    await setTime(context, startedAt + DAY * BigInt(2) + GRACE + BigInt(1));
    await contribute(program, creator, circlePubkey, mint, 3);
    await contribute(program, alice, circlePubkey, mint, 3);
    await contribute(program, bob, circlePubkey, mint, 3);
    await assertVaultInvariant(program, circlePubkey);

    await claimPayout(program, context, bob, circlePubkey, mint, bob.publicKey, 3);

    const circleAfter = await program.account.circle.fetch(circlePubkey);
    assert.property(circleAfter.status, "completed");

    // close_member for all three
    for (const user of [creator, alice, bob]) {
      const [member] = memberPda(circlePubkey, user.publicKey);
      const [history] = historyPda(user.publicKey);
      await program.methods
        .closeMember()
        .accounts({
          payer: context.payer.publicKey,
          circle: circlePubkey,
          member,
          memberOwner: user.publicKey,
          history,
          tokenMint: mint,
          vault: vaultAta(circlePubkey, mint),
          memberToken: userAta(user.publicKey, mint),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([context.payer])
        .rpc();
    }

    // close_circle
    const [circle] = circlePda(creator.publicKey, BigInt(1));
    await program.methods
      .closeCircle()
      .accounts({
        payer: context.payer.publicKey,
        circle,
        creator: creator.publicKey,
        tokenMint: mint,
        creatorToken: userAta(creator.publicKey, mint),
        vault: vaultAta(circle, mint),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([context.payer])
      .rpc();

    // Vault should be closed (no balance)
    const vaultInfo = await context.banksClient.getAccount(vaultAta(circle, mint));
    assert.isNull(vaultInfo, "vault should be closed after close_circle");
  });

  // ─── 2. Cancel before start ───────────────────────────────────────────────
  it("cancel: circle not full by start_deadline", async () => {
    const { context, program, mint } = await setupTest();

    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate();
    const bob = web3.Keypair.generate();

    for (const u of [creator, alice, bob]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000,
        data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId,
        executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(10_000_000));
    }

    const nowClock = await context.banksClient.getClock();
    const startDeadline = nowClock.unixTimestamp + BigInt(3600);

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(2), maxMembers: 5, startDeadline }
    );

    // Only 3 of 5 join
    await joinCircle(program, context, creator, circlePubkey, mint);
    await joinCircle(program, context, alice, circlePubkey, mint);
    await joinCircle(program, context, bob, circlePubkey, mint);

    // Warp past deadline
    await setTime(context, startDeadline + BigInt(1));

    // Anyone can cancel
    await program.methods
      .cancelCircle()
      .accounts({ payer: context.payer.publicKey, circle: circlePubkey } as any)
      .rpc();

    const circleState = await program.account.circle.fetch(circlePubkey);
    assert.property(circleState.status, "cancelled");

    // close_member returns full collateral to each
    for (const user of [creator, alice, bob]) {
      const balBefore = await getTokenBalance(context, userAta(user.publicKey, mint));
      const [member] = memberPda(circlePubkey, user.publicKey);
      const [history] = historyPda(user.publicKey);
      await program.methods
        .closeMember()
        .accounts({
          payer: context.payer.publicKey,
          circle: circlePubkey,
          member,
          memberOwner: user.publicKey,
          history,
          tokenMint: mint,
          vault: vaultAta(circlePubkey, mint),
          memberToken: userAta(user.publicKey, mint),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();
      const balAfter = await getTokenBalance(context, userAta(user.publicKey, mint));
      // Must have gotten collateral back
      assert.isTrue(balAfter >= balBefore, "collateral returned on cancel");
    }

    // close_circle
    const [circle] = circlePda(creator.publicKey, BigInt(2));
    await program.methods
      .closeCircle()
      .accounts({
        payer: context.payer.publicKey,
        circle,
        creator: creator.publicKey,
        tokenMint: mint,
        creatorToken: userAta(creator.publicKey, mint),
        vault: vaultAta(circle, mint),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
  });

  // ─── 3. Slash non-recipient ───────────────────────────────────────────────
  it("slash: non-recipient misses round, schedule shrinks", async () => {
    const { context, program, mint } = await setupTest();

    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate();
    const bob = web3.Keypair.generate();
    const charlie = web3.Keypair.generate(); // will default

    for (const u of [creator, alice, bob, charlie]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000,
        data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId,
        executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(20_000_000));
    }

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(3), maxMembers: 4, amount: BigInt(1_000_000) }
    );

    await joinCircle(program, context, creator, circlePubkey, mint);
    await joinCircle(program, context, alice, circlePubkey, mint);
    await joinCircle(program, context, bob, circlePubkey, mint);
    await joinCircle(program, context, charlie, circlePubkey, mint); // auto-start

    const circleState0 = await program.account.circle.fetch(circlePubkey);
    const startedAt = BigInt(circleState0.startedAt.toString());

    // Round 1: all contribute, creator claims
    await setTime(context, startedAt + BigInt(100));
    for (const u of [creator, alice, bob, charlie]) {
      await contribute(program, u, circlePubkey, mint, 1);
    }
    await claimPayout(program, context, creator, circlePubkey, mint, creator.publicKey, 1);
    await assertVaultInvariant(program, circlePubkey);

    // Round 2: charlie (pos 4) doesn't pay. Others do.
    await setTime(context, startedAt + DAY + BigInt(100));
    for (const u of [creator, alice, bob]) {
      await contribute(program, u, circlePubkey, mint, 2);
    }
    // Charlie misses → slash after grace
    await setTime(context, startedAt + DAY + GRACE + BigInt(100) + DAY);

    const [charlieMember] = memberPda(circlePubkey, charlie.publicKey);
    const [charlieHistory] = historyPda(charlie.publicKey);
    await program.methods
      .slash(2)
      .accounts({
        payer: context.payer.publicKey,
        circle: circlePubkey,
        member: charlieMember,
        history: charlieHistory,
      } as any)
      .rpc();

    const circleAfterSlash = await program.account.circle.fetch(circlePubkey);
    assert.equal(circleAfterSlash.totalRounds, 3, "total_rounds shrinks to 3");
    await assertVaultInvariant(program, circlePubkey);

    // Verify history
    const history = await program.account.memberHistory.fetch(charlieHistory);
    assert.equal(history.defaults, 1);

    // Round 2: creator/alice/bob already contributed before the slash.
    // Current time is past round_end(2)+grace — window is closed, claim immediately.
    await claimPayout(
      program, context, context.payer,
      circlePubkey, mint, alice.publicKey, 2
    );
    await assertVaultInvariant(program, circlePubkey);

    // Round 3: current time is still in the round-3 window ([startedAt+2*DAY, startedAt+3*DAY+GRACE)).
    // Contribute then wait for window to close before claiming.
    for (const u of [creator, alice, bob]) {
      await contribute(program, u, circlePubkey, mint, 3);
    }
    await setTime(context, startedAt + DAY * BigInt(3) + GRACE + BigInt(1));
    await claimPayout(
      program, context, context.payer,
      circlePubkey, mint, bob.publicKey, 3
    );
    await assertVaultInvariant(program, circlePubkey);

    const circleFinal = await program.account.circle.fetch(circlePubkey);
    assert.property(circleFinal.status, "completed");
  });

  // ─── 4. Leave before start ────────────────────────────────────────────────
  it("leave: full collateral returned before start", async () => {
    const { context, program, mint } = await setupTest();

    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate();

    for (const u of [creator, alice]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000,
        data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId,
        executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(10_000_000));
    }

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(4), maxMembers: 3 }
    );

    await joinCircle(program, context, creator, circlePubkey, mint);
    const balBefore = await getTokenBalance(context, userAta(alice.publicKey, mint));
    await joinCircle(program, context, alice, circlePubkey, mint);

    const [aliceMember] = memberPda(circlePubkey, alice.publicKey);
    await program.methods
      .leave()
      .accounts({
        user: alice.publicKey,
        circle: circlePubkey,
        member: aliceMember,
        vault: vaultAta(circlePubkey, mint),
        userToken: userAta(alice.publicKey, mint),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      } as any)
      .signers([alice])
      .rpc();

    const balAfter = await getTokenBalance(context, userAta(alice.publicKey, mint));
    assert.equal(balAfter, balBefore, "full balance restored after leave");

    const circleState = await program.account.circle.fetch(circlePubkey);
    assert.equal(circleState.memberCount, 1, "member count back to 1");
  });

  // ─── 5. Illegal transitions ───────────────────────────────────────────────
  it("illegal: join after circle is active", async () => {
    const { context, program, mint } = await setupTest();

    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate();
    const intruder = web3.Keypair.generate();

    for (const u of [creator, alice, intruder]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000,
        data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId,
        executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(10_000_000));
    }

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(5), maxMembers: 2 }
    );

    await joinCircle(program, context, creator, circlePubkey, mint);
    await joinCircle(program, context, alice, circlePubkey, mint); // auto-starts

    const circleState = await program.account.circle.fetch(circlePubkey);
    assert.property(circleState.status, "active");

    // intruder tries to join active circle
    let threw = false;
    try {
      await joinCircle(program, context, intruder, circlePubkey, mint);
    } catch (e: any) {
      threw = true;
      assert.include(e.message, "CircleNotFilling");
    }
    assert.isTrue(threw, "should throw CircleNotFilling");
  });

  it("illegal: claim_payout too early (window not closed, pot not full)", async () => {
    const { context, program, mint } = await setupTest();

    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate();

    for (const u of [creator, alice]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000,
        data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId,
        executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(10_000_000));
    }

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(6), maxMembers: 2 }
    );

    await joinCircle(program, context, creator, circlePubkey, mint);
    await joinCircle(program, context, alice, circlePubkey, mint); // auto-start

    const circleState = await program.account.circle.fetch(circlePubkey);
    const startedAt = BigInt(circleState.startedAt.toString());

    // Move to mid-round, only creator contributes (pot not full, window not closed)
    await setTime(context, startedAt + BigInt(100));
    await contribute(program, creator, circlePubkey, mint, 1);

    let threw = false;
    try {
      await claimPayout(program, context, creator, circlePubkey, mint, creator.publicKey, 1);
    } catch (e: any) {
      threw = true;
      assert.include(e.message, "ClaimTooEarly");
    }
    assert.isTrue(threw, "should throw ClaimTooEarly");
  });

  it("illegal: cancel before deadline", async () => {
    const { context, program, mint } = await setupTest();
    const creator = web3.Keypair.generate();
    context.setAccount(creator.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: web3.SystemProgram.programId,
      executable: false,
    });

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(7), maxMembers: 3 }
    );

    let threw = false;
    try {
      await program.methods
        .cancelCircle()
        .accounts({ payer: context.payer.publicKey, circle: circlePubkey } as any)
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(e.message, "StartDeadlineNotPassed");
    }
    assert.isTrue(threw, "should throw StartDeadlineNotPassed");
  });

  it("illegal: leave after circle is active", async () => {
    const { context, program, mint } = await setupTest();
    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate();

    for (const u of [creator, alice]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000, data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId, executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(10_000_000));
    }

    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(8), maxMembers: 2 }
    );

    await joinCircle(program, context, creator, circlePubkey, mint);
    await joinCircle(program, context, alice, circlePubkey, mint); // auto-start

    const [creatorMember] = memberPda(circlePubkey, creator.publicKey);
    let threw = false;
    try {
      await program.methods
        .leave()
        .accounts({
          user: creator.publicKey,
          circle: circlePubkey,
          member: creatorMember,
          vault: vaultAta(circlePubkey, mint),
          userToken: userAta(creator.publicKey, mint),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(e.message, "CircleNotFilling");
    }
    assert.isTrue(threw, "should throw CircleNotFilling");
  });

  // ─── 6. Exit early + rescheduling ────────────────────────────────────────
  it("exit_early: surcharge collected, refund returned at close", async () => {
    const { context, program, mint } = await setupTest();

    // N=4: creator pos1, alice pos2, bob pos3, carol pos4
    // carol (pos4, collateral=0) exits after round 1: eff_pos=4 > current_round=1 ✓
    const creator = web3.Keypair.generate();
    const alice = web3.Keypair.generate();
    const bob = web3.Keypair.generate();
    const carol = web3.Keypair.generate();

    for (const u of [creator, alice, bob, carol]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000, data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId, executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(20_000_000));
    }

    const AMOUNT = BigInt(1_000_000);
    const { circlePubkey } = await createCircle(
      program, context, creator, mint,
      {
        circleId: BigInt(9), maxMembers: 4, amount: AMOUNT,
        collateralBps: 5000, penaltyBps: 1000 // 10% exit penalty
      }
    );

    await joinCircle(program, context, creator, circlePubkey, mint);
    await joinCircle(program, context, alice, circlePubkey, mint);
    await joinCircle(program, context, bob, circlePubkey, mint);
    await joinCircle(program, context, carol, circlePubkey, mint); // auto-start

    // collateral(4) = 1M * (4-4) * 5000/10000 = 0

    const circleState0 = await program.account.circle.fetch(circlePubkey);
    const startedAt = BigInt(circleState0.startedAt.toString());

    // Round 1: all 4 contribute, creator claims (pot full → early claim)
    await setTime(context, startedAt + BigInt(100));
    for (const u of [creator, alice, bob, carol]) {
      await contribute(program, u, circlePubkey, mint, 1);
    }
    await claimPayout(program, context, creator, circlePubkey, mint, creator.publicKey, 1);
    await assertVaultInvariant(program, circlePubkey);

    // Carol exits: eff_pos=4 > current_round=1, total_rounds-current_round=3>=2
    // refund_due = 1 * 1M * (10000-1000)/10000 = 900_000
    // surcharge_per_member = ceil(900_000 / 3) = 300_000
    const [carolMember] = memberPda(circlePubkey, carol.publicKey);
    await program.methods
      .exitEarly()
      .accounts({
        user: carol.publicKey,
        circle: circlePubkey,
        member: carolMember,
      } as any)
      .signers([carol])
      .rpc();

    await assertVaultInvariant(program, circlePubkey);

    const circleAfterExit = await program.account.circle.fetch(circlePubkey);
    assert.equal(circleAfterExit.totalRounds, 3, "total_rounds shrinks to 3");
    assert.equal(circleAfterExit.activeMembers, 3, "active_members shrinks to 3");

    const carolMemberState = await program.account.member.fetch(carolMember);
    assert.equal(carolMemberState.refundDue.toString(), "900000", "carol refund_due = 900_000");

    // Round 2: creator, alice, bob each pay 1M + 300K surcharge = 1.3M
    // refund_reserve accumulates 3 * 300K = 900K
    await setTime(context, startedAt + DAY + BigInt(100));
    for (const u of [creator, alice, bob]) {
      await contribute(program, u, circlePubkey, mint, 2);
    }
    await assertVaultInvariant(program, circlePubkey);

    // alice (eff_pos=2) claims round 2 — pot is full (3/3 active members)
    await claimPayout(program, context, creator, circlePubkey, mint, alice.publicKey, 2);
    await assertVaultInvariant(program, circlePubkey);

    // Round 3: no additional surcharge, each pays 1M
    await setTime(context, startedAt + DAY * BigInt(2) + BigInt(100));
    for (const u of [creator, alice, bob]) {
      await contribute(program, u, circlePubkey, mint, 3);
    }
    await assertVaultInvariant(program, circlePubkey);

    // bob (eff_pos=3) claims round 3 → circle Completed
    await claimPayout(program, context, creator, circlePubkey, mint, bob.publicKey, 3);
    await assertVaultInvariant(program, circlePubkey);

    const circleFinal = await program.account.circle.fetch(circlePubkey);
    assert.property(circleFinal.status, "completed");

    // close_member for all; capture carol's balance before the loop
    const carolBalBefore = await getTokenBalance(context, userAta(carol.publicKey, mint));
    for (const user of [creator, alice, bob, carol]) {
      const [member] = memberPda(circlePubkey, user.publicKey);
      const [history] = historyPda(user.publicKey);
      await program.methods
        .closeMember()
        .accounts({
          payer: context.payer.publicKey,
          circle: circlePubkey,
          member,
          memberOwner: user.publicKey,
          history,
          tokenMint: mint,
          vault: vaultAta(circlePubkey, mint),
          memberToken: userAta(user.publicKey, mint),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([context.payer])
        .rpc();
    }

    // carol: collateral=0 returned, refund_due=900K from refund_reserve=900K → gets 900K
    const carolBalAfter = await getTokenBalance(context, userAta(carol.publicKey, mint));
    assert.equal(carolBalAfter - carolBalBefore, BigInt(900_000), "carol receives full refund");
    await assertVaultInvariant(program, circlePubkey);

    // close_circle — vault should be empty
    await program.methods
      .closeCircle()
      .accounts({
        payer: context.payer.publicKey,
        circle: circlePubkey,
        creator: creator.publicKey,
        tokenMint: mint,
        creatorToken: userAta(creator.publicKey, mint),
        vault: vaultAta(circlePubkey, mint),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([context.payer])
      .rpc();

    const vaultInfo = await context.banksClient.getAccount(vaultAta(circlePubkey, mint));
    assert.isNull(vaultInfo, "vault closed after close_circle");
  });

  // ─── 7. Require clean history ────────────────────────────────────────────
  it("require_clean_history: defaulter blocked from strict circle", async () => {
    const { context, program, mint } = await setupTest();

    const creator = web3.Keypair.generate();
    const badActor = web3.Keypair.generate();
    const innocent = web3.Keypair.generate();

    for (const u of [creator, badActor, innocent]) {
      context.setAccount(u.publicKey, {
        lamports: 10_000_000_000, data: Buffer.alloc(0),
        owner: web3.SystemProgram.programId, executable: false,
      });
      await fundUserToken(context, mint, u.publicKey, BigInt(20_000_000));
    }

    // First circle: badActor defaults
    const { circlePubkey: circle1 } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(10), maxMembers: 2, requireCleanHistory: false }
    );
    await joinCircle(program, context, creator, circle1, mint);
    await joinCircle(program, context, badActor, circle1, mint); // auto-start

    const state1 = await program.account.circle.fetch(circle1);
    const startedAt1 = BigInt(state1.startedAt.toString());

    // badActor misses round 1 → warp past grace → slash
    await setTime(context, startedAt1 + DAY + GRACE + BigInt(1));
    const [badMember] = memberPda(circle1, badActor.publicKey);
    const [badHistory] = historyPda(badActor.publicKey);
    await program.methods
      .slash(1)
      .accounts({
        payer: context.payer.publicKey,
        circle: circle1,
        member: badMember,
        history: badHistory,
      } as any)
      .rpc();

    const history = await program.account.memberHistory.fetch(badHistory);
    assert.equal(history.defaults, 1, "defaults incremented");

    // Strict circle: badActor cannot join
    const { circlePubkey: circle2 } = await createCircle(
      program, context, creator, mint,
      { circleId: BigInt(11), maxMembers: 3, requireCleanHistory: true }
    );

    let threw = false;
    try {
      await joinCircle(program, context, badActor, circle2, mint);
    } catch (e: any) {
      threw = true;
      assert.include(e.message, "HistoryNotClean");
    }
    assert.isTrue(threw, "defaulter blocked from strict circle");

    // innocent can still join the strict circle
    await joinCircle(program, context, innocent, circle2, mint);
    const state2 = await program.account.circle.fetch(circle2);
    assert.equal(state2.memberCount, 1, "innocent joined successfully");
  });
});
