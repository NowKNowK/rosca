use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    errors::RoscaError,
    events::ContributionMade,
    state::{Circle, CircleStatus, Member, MemberStatus},
};

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = circle.status == CircleStatus::Active @ RoscaError::CircleNotActive,
    )]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        has_one = circle,
        has_one = user,
        constraint = member.status == MemberStatus::Active @ RoscaError::MemberNotActive,
    )]
    pub member: Account<'info, Member>,

    #[account(
        mut,
        address = circle.vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = circle.token_mint,
        token::authority = user,
    )]
    pub user_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Contribute>, round: u8) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    {
        let circle = &ctx.accounts.circle;
        require!(
            round >= 1 && round <= circle.total_rounds,
            RoscaError::InvalidRound
        );
        require!(
            now >= circle.round_start(round),
            RoscaError::RoundNotStarted
        );
        require!(
            now < circle.round_end(round) + circle.grace_period,
            RoscaError::ContributionWindowClosed
        );
        require!(
            ctx.accounts.member.contributions & (1u16 << (round - 1)) == 0,
            RoscaError::AlreadyContributed
        );
    }

    // Surcharge due from any prior exit_early calls
    let surcharge_due = ctx.accounts.circle.surcharge_accrued
        .saturating_sub(ctx.accounts.member.surcharge_paid);

    let total_transfer = ctx
        .accounts
        .circle
        .contribution_amount
        .checked_add(surcharge_due)
        .ok_or(RoscaError::MathOverflow)?;

    // Transfer contribution + surcharge from user to vault
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, total_transfer)?;

    // Capture values needed for member update BEFORE taking mutable borrow of circle
    let surcharge_accrued_snapshot = ctx.accounts.circle.surcharge_accrued;
    let circle_key = ctx.accounts.circle.key();
    let user_key = ctx.accounts.user.key();

    let circle = &mut ctx.accounts.circle;
    circle.contribution_counts[(round - 1) as usize] += 1;
    circle.refund_reserve = circle
        .refund_reserve
        .checked_add(surcharge_due)
        .ok_or(RoscaError::MathOverflow)?;

    let member = &mut ctx.accounts.member;
    member.contributions |= 1u16 << (round - 1);
    member.surcharge_paid = surcharge_accrued_snapshot;

    emit!(ContributionMade {
        circle: circle_key,
        user: user_key,
        round,
        amount: total_transfer,
    });

    Ok(())
}
