use anchor_lang::prelude::*;

#[event]
pub struct CircleCreated {
    pub circle: Pubkey,
    pub creator: Pubkey,
    pub token_mint: Pubkey,
    pub contribution_amount: u64,
    pub max_members: u8,
    pub round_duration: i64,
}

#[event]
pub struct MemberJoined {
    pub circle: Pubkey,
    pub user: Pubkey,
    pub position: u8,
    pub collateral: u64,
}

#[event]
pub struct CircleStarted {
    pub circle: Pubkey,
    pub started_at: i64,
    pub total_rounds: u8,
}

#[event]
pub struct MemberLeft {
    pub circle: Pubkey,
    pub user: Pubkey,
    pub collateral_returned: u64,
}

#[event]
pub struct ContributionMade {
    pub circle: Pubkey,
    pub user: Pubkey,
    pub round: u8,
    pub amount: u64,
}

#[event]
pub struct PayoutClaimed {
    pub circle: Pubkey,
    pub recipient: Pubkey,
    pub round: u8,
    pub amount: u64,
}

#[event]
pub struct CircleCompleted {
    pub circle: Pubkey,
}

#[event]
pub struct MemberSlashed {
    pub circle: Pubkey,
    pub user: Pubkey,
    pub missed_round: u8,
    pub collateral_slashed: u64,
}

#[event]
pub struct MemberExited {
    pub circle: Pubkey,
    pub user: Pubkey,
    pub refund_due: u64,
    pub surcharge_per_member: u64,
}

#[event]
pub struct CircleCancelled {
    pub circle: Pubkey,
}

#[event]
pub struct MemberClosed {
    pub circle: Pubkey,
    pub user: Pubkey,
    pub collateral_returned: u64,
    pub refund_returned: u64,
}

#[event]
pub struct CircleClosed {
    pub circle: Pubkey,
}
