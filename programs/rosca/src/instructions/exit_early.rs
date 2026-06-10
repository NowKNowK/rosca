use anchor_lang::prelude::*;

use crate::{
    errors::RoscaError,
    events::MemberExited,
    state::{Circle, CircleStatus, Member, MemberStatus},
};

#[derive(Accounts)]
pub struct ExitEarly<'info> {
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
        constraint = !member.has_received_payout @ RoscaError::AlreadyReceivedPayout,
    )]
    pub member: Account<'info, Member>,
}

pub fn handler(ctx: Context<ExitEarly>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let eff_pos = ctx
        .accounts
        .member
        .eff_pos(ctx.accounts.circle.removed_positions);
    let current_round = ctx.accounts.circle.current_round(now);

    // Cannot exit if this member's payout round has arrived
    require!(eff_pos > current_round, RoscaError::PayoutAvailableUseClaim);

    // Must have at least 2 rounds remaining after exit (to guarantee surcharge collection)
    let rounds_after_exit = ctx.accounts.circle.total_rounds.saturating_sub(current_round);
    require!(rounds_after_exit >= 2, RoscaError::ExitWindowClosed);

    // How many rounds have they paid into?
    let contributions_paid = ctx
        .accounts
        .member
        .contributions
        .count_ones() as u64;

    let gross = ctx
        .accounts
        .circle
        .contribution_amount
        .checked_mul(contributions_paid)
        .ok_or(RoscaError::MathOverflow)?;

    // Apply exit penalty
    let refund_gross = gross
        .checked_mul(10_000u64.saturating_sub(ctx.accounts.circle.exit_penalty_bps as u64))
        .ok_or(RoscaError::MathOverflow)?
        / 10_000;

    // Deduct any surcharge already owed but not yet paid by this member
    let owed_surcharge = ctx
        .accounts
        .circle
        .surcharge_accrued
        .saturating_sub(ctx.accounts.member.surcharge_paid);

    let refund_due = refund_gross.saturating_sub(owed_surcharge);

    // Compute per-member surcharge (ceiling division so reserve cannot under-fill)
    let remaining_active = ctx.accounts.circle.active_members.saturating_sub(1) as u64;
    let surcharge_per_member = if remaining_active > 0 {
        refund_due
            .checked_add(remaining_active - 1)
            .ok_or(RoscaError::MathOverflow)?
            / remaining_active
    } else {
        0
    };

    // Update circle
    let circle = &mut ctx.accounts.circle;
    circle.surcharge_accrued = circle
        .surcharge_accrued
        .checked_add(surcharge_per_member)
        .ok_or(RoscaError::MathOverflow)?;
    circle.removed_positions |= 1u16 << (ctx.accounts.member.position - 1);
    circle.total_rounds -= 1;
    circle.active_members -= 1;

    // Update member
    let member = &mut ctx.accounts.member;
    member.status = MemberStatus::Exited;
    member.refund_due = refund_due;

    emit!(MemberExited {
        circle: circle.key(),
        user: ctx.accounts.user.key(),
        refund_due,
        surcharge_per_member,
    });

    Ok(())
}
