import { describe, it, expect } from "vitest";
import {
  effPos,
  requiredCollateral,
  currentRound,
  roundStart,
  roundEnd,
  contributionWindowEnd,
  claimEligibilityMask,
  isClaimEligible,
  exitEarlyEstimate,
  popcount,
} from "./rosca";
import type { CircleAccount, MemberAccount } from "./rosca";

// Helper to build a minimal CircleAccount for tests
function makeCircle(overrides: Partial<CircleAccount> = {}): CircleAccount {
  return {
    creator: { toBase58: () => "creator" },
    circleId: 1n,
    tokenMint: { toBase58: () => "mint" },
    vault: { toBase58: () => "vault" },
    contributionAmount: 100n,
    roundDuration: 3600n,
    gracePeriod: 300n,
    startDeadline: 9999999999n,
    startedAt: 1_000_000n,
    exitPenaltyBps: 1000, // 10%
    collateralBps: 5000,  // 50%
    maxMembers: 5,
    memberCount: 5,
    activeMembers: 5,
    openMemberAccounts: 5,
    totalRounds: 5,
    status: { active: {} },
    requireCleanHistory: false,
    occupiedPositions: 0b11111,
    removedPositions: 0,
    claimedRounds: 0,
    contributionCounts: [5, 5, 0, 0, 0],
    potBonus: [0n, 0n, 0n, 0n, 0n],
    surchargeAccrued: 0n,
    refundReserve: 0n,
    totalCollateral: 0n,
    bump: 0,
    ...overrides,
  };
}

function makeMember(overrides: Partial<MemberAccount> = {}): MemberAccount {
  return {
    circle: { toBase58: () => "circle" },
    user: { toBase58: () => "user" },
    position: 1,
    collateral: 200n,
    contributions: 0b11, // contributed rounds 1 and 2
    surchargePaid: 0n,
    refundDue: 0n,
    status: { active: {} },
    hasReceivedPayout: false,
    bump: 0,
    ...overrides,
  };
}

// --- effPos ---
describe("effPos", () => {
  it("returns original position when nothing removed", () => {
    expect(effPos(1, 0)).toBe(1);
    expect(effPos(3, 0)).toBe(3);
    expect(effPos(5, 0)).toBe(5);
  });

  it("shifts down when lower position is removed", () => {
    // Remove position 1 (bit 0): position 2 → eff 1, position 3 → eff 2
    const removed = 0b0001;
    expect(effPos(2, removed)).toBe(1);
    expect(effPos(3, removed)).toBe(2);
    expect(effPos(5, removed)).toBe(4);
  });

  it("does not shift for removed positions above own", () => {
    // Remove position 5 (bit 4): positions 1-4 unaffected
    const removed = 0b10000;
    expect(effPos(1, removed)).toBe(1);
    expect(effPos(4, removed)).toBe(4);
  });

  it("handles multiple removals", () => {
    // Remove positions 1 and 3 (bits 0 and 2)
    const removed = 0b00101;
    expect(effPos(2, removed)).toBe(1); // 1 removed below → 2-1=1
    expect(effPos(4, removed)).toBe(2); // 2 removed below → 4-2=2
    expect(effPos(5, removed)).toBe(3); // 2 removed below → 5-2=3
  });

  it("mirrors on-chain formula: position=0 returns 0", () => {
    expect(effPos(0, 0)).toBe(0);
    expect(effPos(0, 0b11111)).toBe(0);
  });
});

// --- requiredCollateral ---
describe("requiredCollateral", () => {
  it("matches README table for N=5, amount=100, bps=5000 (50%)", () => {
    // position 1: (5-1)*100*5000/10000 = 200
    expect(requiredCollateral(100n, 5, 1, 5000)).toBe(200n);
    // position 2: (5-2)*100*5000/10000 = 150
    expect(requiredCollateral(100n, 5, 2, 5000)).toBe(150n);
    // position 3: (5-3)*100*5000/10000 = 100
    expect(requiredCollateral(100n, 5, 3, 5000)).toBe(100n);
    // position 4: (5-4)*100*5000/10000 = 50
    expect(requiredCollateral(100n, 5, 4, 5000)).toBe(50n);
    // position 5: (5-5)*100*5000/10000 = 0
    expect(requiredCollateral(100n, 5, 5, 5000)).toBe(0n);
  });

  it("returns 0 when collateralBps=0", () => {
    expect(requiredCollateral(1000n, 10, 1, 0)).toBe(0n);
  });
});

// --- currentRound ---
describe("currentRound", () => {
  it("returns 0 when not started", () => {
    expect(currentRound(500, 0n, 3600n, 5)).toBe(0);
    expect(currentRound(999, 1000n, 3600n, 5)).toBe(0);
  });

  it("round 1 at start", () => {
    expect(currentRound(1000, 1000n, 3600n, 5)).toBe(1);
    expect(currentRound(4599, 1000n, 3600n, 5)).toBe(1);
  });

  it("round 2 after first round_duration", () => {
    expect(currentRound(4600, 1000n, 3600n, 5)).toBe(2);
  });

  it("caps at total_rounds", () => {
    expect(currentRound(999999, 1000n, 3600n, 5)).toBe(5);
  });
});

// --- roundStart / roundEnd ---
describe("round timing", () => {
  const startedAt = 1000n;
  const duration = 3600n;

  it("round 1 starts at startedAt", () => {
    expect(roundStart(startedAt, duration, 1)).toBe(1000);
  });

  it("round 2 starts after one duration", () => {
    expect(roundStart(startedAt, duration, 2)).toBe(4600);
  });

  it("round end = start + duration", () => {
    expect(roundEnd(startedAt, duration, 1)).toBe(4600);
  });

  it("contribution window end = roundEnd + gracePeriod", () => {
    expect(contributionWindowEnd(startedAt, duration, 300n, 1)).toBe(4900);
  });
});

// --- claimEligibilityMask ---
describe("claimEligibilityMask", () => {
  it("r=1 requires only round 1 paid", () => {
    expect(claimEligibilityMask(1)).toBe(0b01);
  });

  it("r=3 requires rounds 1,2,3 paid (mask = 0b0111)", () => {
    expect(claimEligibilityMask(3)).toBe(0b111);
  });

  it("r=16 requires all 16 rounds", () => {
    expect(claimEligibilityMask(16)).toBe(0xffff);
  });

  it("isClaimEligible returns true when all required bits set", () => {
    const member = makeMember({ contributions: 0b111 }); // rounds 1,2,3
    expect(isClaimEligible(member, 3)).toBe(true);
    expect(isClaimEligible(member, 4)).toBe(false); // missing round 4
  });

  it("isClaimEligible false when any required round missed", () => {
    const member = makeMember({ contributions: 0b101 }); // rounds 1,3 (missing 2)
    expect(isClaimEligible(member, 3)).toBe(false);
  });
});

// --- exitEarlyEstimate ---
describe("exitEarlyEstimate", () => {
  it("computes refund and per-member surcharge", () => {
    // Member contributed rounds 1 and 2, no prior surcharge
    // gross = 100 * 2 = 200
    // refund_gross = 200 * (10000 - 1000) / 10000 = 180
    // owed_surcharge = 0 - 0 = 0
    // refund_due = 180
    // surchargePer = ceil(180 / 4) = 45
    const circle = makeCircle();
    const member = makeMember({ contributions: 0b11, surchargePaid: 0n });
    const { refundDue, surchargePer } = exitEarlyEstimate(circle, member);
    expect(refundDue).toBe(180n);
    expect(surchargePer).toBe(45n);
  });

  it("ceiling division: ceil(181/4) = 46", () => {
    // Tweak amount to get 181 refundDue: amount=201, 2 contributions
    // gross=402, refundGross=402*9000/10000=361 (floor), refundDue=361
    // Actually let me use simpler numbers: amount=100, 2 contributions, penalty=500bps
    // gross=200, refundGross=200*9500/10000=190, refundDue=190, 190/4=47.5 → ceil=48
    const circle = makeCircle({ exitPenaltyBps: 500 });
    const member = makeMember({ contributions: 0b11 });
    const { surchargePer } = exitEarlyEstimate(circle, member);
    expect(surchargePer).toBe(48n); // ceil(190/4) = 48
  });

  it("deducts owed surcharge from refund before computing surchargePer", () => {
    // surchargeAccrued=50, surchargePaid=0 → owedSurcharge=50
    // gross=200, refundGross=180, refundDue=180-50=130
    // surchargePer = ceil(130/4) = 33
    const circle = makeCircle({ surchargeAccrued: 50n });
    const member = makeMember({ contributions: 0b11, surchargePaid: 0n });
    const { refundDue, surchargePer } = exitEarlyEstimate(circle, member);
    expect(refundDue).toBe(130n);
    expect(surchargePer).toBe(33n);
  });
});

// --- popcount ---
describe("popcount", () => {
  it("counts set bits correctly", () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(0b11111)).toBe(5);
    expect(popcount(0b10101)).toBe(3);
    expect(popcount(0xffff)).toBe(16);
  });
});
