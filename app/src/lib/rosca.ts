// Off-chain mirrors of on-chain formulas from programs/rosca/src/state.rs and instructions/*.rs
// All token arithmetic uses BigInt to avoid float precision loss.

export type CircleAccount = {
  creator: { toBase58(): string };
  circleId: bigint;
  tokenMint: { toBase58(): string };
  vault: { toBase58(): string };
  contributionAmount: bigint;
  roundDuration: bigint;
  gracePeriod: bigint;
  startDeadline: bigint;
  startedAt: bigint;
  exitPenaltyBps: number;
  collateralBps: number;
  maxMembers: number;
  memberCount: number;
  activeMembers: number;
  openMemberAccounts: number;
  totalRounds: number;
  status: { filling?: Record<string, never>; active?: Record<string, never>; completed?: Record<string, never>; cancelled?: Record<string, never> };
  requireCleanHistory: boolean;
  occupiedPositions: number;
  removedPositions: number;
  claimedRounds: number;
  contributionCounts: number[];
  potBonus: bigint[];
  surchargeAccrued: bigint;
  refundReserve: bigint;
  totalCollateral: bigint;
  bump: number;
};

export type MemberAccount = {
  circle: { toBase58(): string };
  user: { toBase58(): string };
  position: number;
  collateral: bigint;
  contributions: number;
  surchargePaid: bigint;
  refundDue: bigint;
  status: { active?: Record<string, never>; exited?: Record<string, never>; defaulted?: Record<string, never>; completed?: Record<string, never> };
  hasReceivedPayout: boolean;
  bump: number;
};

export type HistoryAccount = {
  user: { toBase58(): string };
  defaults: number;
  completed: number;
  bump: number;
};

// Mirror of state.rs:170-182
export function effPos(position: number, removedPositions: number): number {
  const mask = position === 0 ? 0 : ((1 << (position - 1)) - 1);
  const removedBelow = popcount(removedPositions & mask);
  return Math.max(0, position - removedBelow);
}

// Mirror of state.rs:106-115
export function requiredCollateral(
  contributionAmount: bigint,
  maxMembers: number,
  position: number,
  collateralBps: number
): bigint {
  const remaining = BigInt(Math.max(0, maxMembers - position));
  return (contributionAmount * remaining * BigInt(collateralBps)) / 10_000n;
}

// Mirror of state.rs:84-94
export function currentRound(
  nowSec: number,
  startedAt: bigint,
  roundDuration: bigint,
  totalRounds: number
): number {
  if (startedAt === 0n || BigInt(nowSec) < startedAt) return 0;
  const elapsed = BigInt(nowSec) - startedAt;
  const round = Number(elapsed / roundDuration) + 1;
  return Math.min(round, totalRounds);
}

export function roundStart(startedAt: bigint, roundDuration: bigint, r: number): number {
  return Number(startedAt + BigInt(r - 1) * roundDuration);
}

export function roundEnd(startedAt: bigint, roundDuration: bigint, r: number): number {
  return Number(startedAt + BigInt(r) * roundDuration);
}

export function contributionWindowEnd(
  startedAt: bigint,
  roundDuration: bigint,
  gracePeriod: bigint,
  r: number
): number {
  return Number(startedAt + BigInt(r) * roundDuration + gracePeriod);
}

// surcharge owed by a member right now (mirror of contribute.rs:70-71)
export function surchargeDue(circle: CircleAccount, member: MemberAccount): bigint {
  return circle.surchargeAccrued > member.surchargePaid
    ? circle.surchargeAccrued - member.surchargePaid
    : 0n;
}

// pot for round r (mirror of claim_payout.rs:100-110)
export function potForRound(circle: CircleAccount, r: number): bigint {
  const count = BigInt(circle.contributionCounts[r - 1] ?? 0);
  const bonus = circle.potBonus[r - 1] ?? 0n;
  return circle.contributionAmount * count + bonus;
}

// projected (estimated) pot if all active members contribute
export function projectedPot(circle: CircleAccount): bigint {
  const slashBonusTotal = circle.potBonus.reduce((a, b) => a + b, 0n);
  return circle.contributionAmount * BigInt(circle.activeMembers) + slashBonusTotal;
}

// eligibility mask: member must have contributed rounds 1..r (mirror of claim_payout.rs:84-92)
export function claimEligibilityMask(r: number): number {
  if (r >= 16) return 0xffff;
  return (1 << r) - 1;
}

export function isClaimEligible(member: MemberAccount, r: number): boolean {
  const mask = claimEligibilityMask(r);
  return (member.contributions & mask) === mask;
}

// Whether the payout for round r can be claimed right now
export function canClaimNow(
  circle: CircleAccount,
  r: number,
  nowSec: number
): boolean {
  const windowClosed =
    nowSec >= contributionWindowEnd(circle.startedAt, circle.roundDuration, circle.gracePeriod, r);
  const potFull = circle.contributionCounts[r - 1] === circle.activeMembers;
  return windowClosed || potFull;
}

// exit_early estimates (mirror of exit_early.rs:47-85)
export function exitEarlyEstimate(
  circle: CircleAccount,
  member: MemberAccount
): { refundDue: bigint; surchargePer: bigint } {
  const contributionsPaid = BigInt(popcount(member.contributions));
  const gross = circle.contributionAmount * contributionsPaid;
  const refundGross = (gross * BigInt(10_000 - circle.exitPenaltyBps)) / 10_000n;
  const owedSurcharge = surchargeDue(circle, member);
  const refundDue = refundGross > owedSurcharge ? refundGross - owedSurcharge : 0n;
  const remainingActive = BigInt(Math.max(0, circle.activeMembers - 1));
  const surchargePer =
    remainingActive > 0n ? (refundDue + remainingActive - 1n) / remainingActive : 0n;
  return { refundDue, surchargePer };
}

export type CellState = "paid" | "pending" | "missed" | "future" | "void";

export function cellState(
  member: MemberAccount,
  r: number,
  circle: CircleAccount,
  nowSec: number
): CellState {
  const memberExitedOrDefaulted =
    "exited" in member.status || "defaulted" in member.status;

  // Rounds after exit/slash removal are void for that member
  if (memberExitedOrDefaulted) {
    const eff = effPos(member.position, circle.removedPositions);
    // If removed from schedule: any round after their removal is void
    const posRemoved = (circle.removedPositions & (1 << (member.position - 1))) !== 0;
    if (posRemoved && r > 0) {
      // Still show historical contributions as paid/missed
      if (r > currentRound(nowSec, circle.startedAt, circle.roundDuration, circle.totalRounds)) {
        return "void";
      }
    }
    // If they haven't received payout and their eff_pos round hasn't started, void
    if (!member.hasReceivedPayout && eff > 0 && r >= eff && posRemoved) {
      return "void";
    }
  }

  const bit = member.contributions & (1 << (r - 1));
  if (bit !== 0) return "paid";

  const cur = currentRound(nowSec, circle.startedAt, circle.roundDuration, circle.totalRounds);
  if (r > cur) return "future";

  const windowEnd = contributionWindowEnd(
    circle.startedAt,
    circle.roundDuration,
    circle.gracePeriod,
    r
  );
  if (nowSec < windowEnd && r === cur) return "pending";

  return "missed";
}

// Find the member who should receive payout for round r
export function recipientForRound(
  members: MemberAccount[],
  r: number,
  removedPositions: number
): MemberAccount | undefined {
  return members.find(
    (m) =>
      effPos(m.position, removedPositions) === r &&
      (circle_bit_clear(removedPositions, m.position) || m.hasReceivedPayout)
  );
}

function circle_bit_clear(removedPositions: number, position: number): boolean {
  return (removedPositions & (1 << (position - 1))) === 0;
}

export function popcount(n: number): number {
  let count = 0;
  let x = n >>> 0;
  while (x) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

// Status helpers
export function isCircleFilling(circle: CircleAccount): boolean {
  return "filling" in circle.status;
}
export function isCircleActive(circle: CircleAccount): boolean {
  return "active" in circle.status;
}
export function isCircleCompleted(circle: CircleAccount): boolean {
  return "completed" in circle.status;
}
export function isCircleCancelled(circle: CircleAccount): boolean {
  return "cancelled" in circle.status;
}
export function isMemberActive(m: MemberAccount): boolean {
  return "active" in m.status;
}
export function isMemberExited(m: MemberAccount): boolean {
  return "exited" in m.status;
}
export function isMemberDefaulted(m: MemberAccount): boolean {
  return "defaulted" in m.status;
}
export function circleStatusLabel(circle: CircleAccount): string {
  if (isCircleFilling(circle)) return "Filling";
  if (isCircleActive(circle)) return "Active";
  if (isCircleCompleted(circle)) return "Completed";
  if (isCircleCancelled(circle)) return "Cancelled";
  return "Unknown";
}
export function memberStatusLabel(m: MemberAccount): string {
  if (isMemberActive(m)) return "Active";
  if (isMemberExited(m)) return "Exited";
  if (isMemberDefaulted(m)) return "Defaulted";
  return "Completed";
}
