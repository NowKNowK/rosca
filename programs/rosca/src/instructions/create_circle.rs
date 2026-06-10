use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    errors::RoscaError,
    events::CircleCreated,
    state::{Circle, CircleStatus, CIRCLE_SPACE},
};

#[derive(Accounts)]
#[instruction(circle_id: u64)]
pub struct CreateCircle<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = CIRCLE_SPACE,
        seeds = [b"circle", creator.key().as_ref(), &circle_id.to_le_bytes()],
        bump,
    )]
    pub circle: Account<'info, Circle>,

    pub token_mint: Account<'info, Mint>,

    /// ATA(circle PDA, token_mint) — holds all contributions, collateral, and reserves.
    #[account(
        init,
        payer = creator,
        associated_token::mint = token_mint,
        associated_token::authority = circle,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateCircle>,
    circle_id: u64,
    contribution_amount: u64,
    round_duration: i64,
    grace_period: i64,
    start_deadline: i64,
    max_members: u8,
    exit_penalty_bps: u16,
    collateral_bps: u16,
    require_clean_history: bool,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(
        max_members >= 2 && max_members as usize <= crate::state::MAX_MEMBERS,
        RoscaError::InvalidCircleConfig
    );
    require!(contribution_amount > 0, RoscaError::InvalidCircleConfig);
    require!(round_duration >= 60, RoscaError::InvalidCircleConfig);
    require!(
        grace_period >= 0 && grace_period < round_duration,
        RoscaError::InvalidCircleConfig
    );
    require!(start_deadline > now, RoscaError::InvalidCircleConfig);
    require!(exit_penalty_bps <= 10_000, RoscaError::InvalidCircleConfig);
    require!(collateral_bps <= 10_000, RoscaError::InvalidCircleConfig);

    let circle = &mut ctx.accounts.circle;
    circle.creator = ctx.accounts.creator.key();
    circle.circle_id = circle_id;
    circle.token_mint = ctx.accounts.token_mint.key();
    circle.vault = ctx.accounts.vault.key();
    circle.contribution_amount = contribution_amount;
    circle.round_duration = round_duration;
    circle.grace_period = grace_period;
    circle.start_deadline = start_deadline;
    circle.started_at = 0;
    circle.exit_penalty_bps = exit_penalty_bps;
    circle.collateral_bps = collateral_bps;
    circle.max_members = max_members;
    circle.member_count = 0;
    circle.active_members = 0;
    circle.open_member_accounts = 0;
    circle.total_rounds = 0;
    circle.status = CircleStatus::Filling;
    circle.require_clean_history = require_clean_history;
    circle.occupied_positions = 0;
    circle.removed_positions = 0;
    circle.claimed_rounds = 0;
    circle.contribution_counts = [0u8; crate::state::MAX_MEMBERS];
    circle.pot_bonus = [0u64; crate::state::MAX_MEMBERS];
    circle.surcharge_accrued = 0;
    circle.refund_reserve = 0;
    circle.total_collateral = 0;
    circle.bump = ctx.bumps.circle;

    emit!(CircleCreated {
        circle: circle.key(),
        creator: circle.creator,
        token_mint: circle.token_mint,
        contribution_amount,
        max_members,
        round_duration,
    });

    Ok(())
}
