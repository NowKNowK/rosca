use anchor_lang::prelude::*;

// ─── Constants ───────────────────────────────────────────────────────────────

pub const MAX_MEMBERS: usize = 16;
pub const CIRCLE_SPACE: usize = 8 + 32 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 2 + 16 + 128 + 8 + 8 + 8 + 1;
pub const MEMBER_SPACE: usize = 8 + 32 + 32 + 1 + 8 + 2 + 8 + 8 + 1 + 1 + 1;
pub const HISTORY_SPACE: usize = 8 + 32 + 2 + 2 + 1;

// ─── Enums ───────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CircleStatus {
    Filling,
    Active,
    Completed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MemberStatus {
    Active,
    Exited,
    Defaulted,
    Completed,
}

// ─── Circle ──────────────────────────────────────────────────────────────────

#[account]
pub struct Circle {
    /// Seeds: ["circle", creator, circle_id_le]
    pub creator: Pubkey,
    pub circle_id: u64,
    pub token_mint: Pubkey,
    /// ATA(circle PDA, token_mint) — stored for constraint checks.
    pub vault: Pubkey,

    pub contribution_amount: u64,
    pub round_duration: i64,
    pub grace_period: i64,
    pub start_deadline: i64,
    /// 0 while Filling; set on auto-start.
    pub started_at: i64,

    pub exit_penalty_bps: u16,
    /// Fraction of residual obligation required as collateral (scaled by 10_000).
    pub collateral_bps: u16,

    pub max_members: u8,
    pub member_count: u8,
    pub active_members: u8,
    /// Number of Member PDAs still open; gate for close_circle.
    pub open_member_accounts: u8,
    /// Decremented on exit_early / slash of non-recipient.
    pub total_rounds: u8,

    pub status: CircleStatus,
    pub require_clean_history: bool,

    /// Bitmask of occupied payout positions (bit i = position i+1 is taken).
    /// `leave` frees the bit; `join` takes the lowest free bit.
    pub occupied_positions: u16,
    /// Bitmask of positions removed from the schedule (exit_early / slash).
    pub removed_positions: u16,
    /// Bitmask of rounds whose pots have been claimed.
    pub claimed_rounds: u16,

    /// contribution_counts[r] = number of contributions received for round r+1.
    pub contribution_counts: [u8; MAX_MEMBERS],
    /// Slash compensation / forfeits credited to each round's pot.
    pub pot_bonus: [u64; MAX_MEMBERS],

    /// Cumulative per-member surcharge accrued from all exit_early calls so far.
    pub surcharge_accrued: u64,
    /// Tokens collected into the refund reserve from surcharges and slash coverage.
    pub refund_reserve: u64,
    /// Sum of all collateral currently held in the vault.
    pub total_collateral: u64,

    pub bump: u8,
}

impl Circle {
    /// Derive the current round (1-based) from on-chain clock.
    /// Returns 0 if not yet started (should never be called in Filling state).
    pub fn current_round(&self, now: i64) -> u8 {
        if self.started_at == 0 || now < self.started_at {
            return 0;
        }
        let elapsed = now.saturating_sub(self.started_at) as u64;
        let round = elapsed / (self.round_duration as u64) + 1;
        round.min(self.total_rounds as u64) as u8
    }

    /// Unix timestamp at which round `r` (1-based) starts.
    pub fn round_start(&self, r: u8) -> i64 {
        self.started_at + (r as i64 - 1) * self.round_duration
    }

    /// Unix timestamp at which round `r` (1-based) ends (exclusive).
    pub fn round_end(&self, r: u8) -> i64 {
        self.started_at + r as i64 * self.round_duration
    }

    /// Required collateral for a member at position `p` (1-based).
    pub fn required_collateral(&self, p: u8) -> u64 {
        let remaining = (self.max_members as u64).saturating_sub(p as u64);
        self.contribution_amount
            .checked_mul(remaining)
            .unwrap()
            .checked_mul(self.collateral_bps as u64)
            .unwrap()
            / 10_000
    }

    /// Lowest free payout position (1-based). Returns 0 if full.
    pub fn lowest_free_position(&self) -> u8 {
        for i in 0..self.max_members as u8 {
            if self.occupied_positions & (1u16 << i) == 0 {
                return i + 1;
            }
        }
        0
    }

    /// Returns true if all rounds 1..=total_rounds have been claimed.
    pub fn all_rounds_claimed(&self) -> bool {
        let mask = if self.total_rounds == 16 {
            u16::MAX
        } else {
            (1u16 << self.total_rounds) - 1
        };
        self.claimed_rounds & mask == mask
    }

    /// Smallest unclaimed round index >= `from` (1-based). Returns 0 if none.
    pub fn next_unclaimed_round(&self, from: u8) -> u8 {
        for r in from..=self.total_rounds {
            if self.claimed_rounds & (1u16 << (r - 1)) == 0 {
                return r;
            }
        }
        0
    }
}

// ─── Member ──────────────────────────────────────────────────────────────────

#[account]
pub struct Member {
    /// Seeds: ["member", circle, user]
    pub circle: Pubkey,
    pub user: Pubkey,
    /// Original (immutable) payout position, 1-based.
    pub position: u8,
    /// Collateral deposited (set to 0 after slash).
    pub collateral: u64,
    /// Bitmask of rounds in which this member has contributed.
    pub contributions: u16,
    /// Cumulative surcharge already paid by this member.
    pub surcharge_paid: u64,
    /// Amount owed back to this member upon circle completion (Exited only).
    pub refund_due: u64,
    pub status: MemberStatus,
    pub has_received_payout: bool,
    pub bump: u8,
}

impl Member {
    /// Effective payout position after accounting for removed positions.
    /// = original position minus the count of removed positions below it.
    pub fn eff_pos(&self, removed_positions: u16) -> u8 {
        let below_mask = if self.position == 0 {
            0u16
        } else {
            (1u16 << (self.position - 1)).saturating_sub(1)
        };
        let removed_below = (removed_positions & below_mask).count_ones() as u8;
        self.position.saturating_sub(removed_below)
    }
}

// ─── MemberHistory ───────────────────────────────────────────────────────────

#[account]
pub struct MemberHistory {
    /// Seeds: ["history", user]  — NEVER closed.
    pub user: Pubkey,
    /// Incremented on slash (or forfeiture detected at close_member).
    pub defaults: u16,
    /// Incremented when a member closes with a full contribution record.
    pub completed: u16,
    pub bump: u8,
}
