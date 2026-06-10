use anchor_lang::prelude::*;

use crate::{
    errors::RoscaError,
    events::{CircleCompleted, MemberSlashed},
    state::{Circle, CircleStatus, Member, MemberHistory, MemberStatus},
};

#[derive(Accounts)]
pub struct Slash<'info> {
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = circle.status == CircleStatus::Active @ RoscaError::CircleNotActive,
    )]
    pub circle: Account<'info, Circle>,

    /// The member being slashed. NOT a signer — anyone can call slash.
    #[account(
        mut,
        has_one = circle,
        constraint = member.status == MemberStatus::Active @ RoscaError::MemberNotActive,
    )]
    pub member: Account<'info, Member>,

    /// Global history PDA for the member's user key.
    #[account(
        mut,
        seeds = [b"history", member.user.as_ref()],
        bump = history.bump,
    )]
    pub history: Account<'info, MemberHistory>,
}

pub fn handler(ctx: Context<Slash>, missed_round: u8) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    {
        let circle = &ctx.accounts.circle;
        let member = &ctx.accounts.member;

        require!(
            missed_round >= 1 && missed_round <= circle.total_rounds,
            RoscaError::InvalidRound
        );
        require!(
            now >= circle.round_end(missed_round) + circle.grace_period,
            RoscaError::GracePeriodNotExpired
        );
        // Member must NOT have contributed in missed_round
        require!(
            member.contributions & (1u16 << (missed_round - 1)) == 0,
            RoscaError::MemberNotSlashable
        );
    }

    let collateral = ctx.accounts.member.collateral;
    let circle = &mut ctx.accounts.circle;

    // Cover outstanding surcharge first (protects exit refunds)
    let uncovered_surcharge = circle
        .surcharge_accrued
        .saturating_sub(ctx.accounts.member.surcharge_paid);
    let surcharge_cover = collateral.min(uncovered_surcharge);
    let remaining_collateral = collateral.saturating_sub(surcharge_cover);

    circle.refund_reserve = circle
        .refund_reserve
        .checked_add(surcharge_cover)
        .ok_or(RoscaError::MathOverflow)?;

    // Remaining slash goes to nearest unclaimed pot >= current round
    let current = circle.current_round(now);
    let target_round = circle.next_unclaimed_round(current.max(1));
    if target_round > 0 && remaining_collateral > 0 {
        circle.pot_bonus[(target_round - 1) as usize] = circle.pot_bonus
            [(target_round - 1) as usize]
            .checked_add(remaining_collateral)
            .ok_or(RoscaError::MathOverflow)?;
    }
    // If there is no unclaimed round (all claimed already), remaining_collateral
    // becomes dust that settles in the vault until close_circle sweeps it.

    circle.total_collateral = circle.total_collateral.saturating_sub(collateral);
    circle.active_members -= 1;

    let member = &mut ctx.accounts.member;
    let eff = member.eff_pos(circle.removed_positions);
    let was_pre_payout = !member.has_received_payout;

    member.status = MemberStatus::Defaulted;
    member.collateral = 0;

    ctx.accounts.history.defaults += 1;

    if was_pre_payout {
        if eff > current {
            // Future recipient — remove from schedule
            circle.removed_positions |= 1u16 << (ctx.accounts.member.position - 1);
            circle.total_rounds -= 1;
        } else {
            // Their round was present/past but unclaimed — forfeit the round
            let forfeit_round = eff;
            if forfeit_round > 0 && circle.claimed_rounds & (1u16 << (forfeit_round - 1)) == 0 {
                circle.claimed_rounds |= 1u16 << (forfeit_round - 1);
                // The forfeited pot (contributions already in vault) rolls to next unclaimed
                let pot_count = circle.contribution_counts[(forfeit_round - 1) as usize] as u64;
                let forfeit_amount = circle
                    .contribution_amount
                    .checked_mul(pot_count)
                    .ok_or(RoscaError::MathOverflow)?
                    .checked_add(circle.pot_bonus[(forfeit_round - 1) as usize])
                    .ok_or(RoscaError::MathOverflow)?;
                circle.pot_bonus[(forfeit_round - 1) as usize] = 0;

                let next = circle.next_unclaimed_round(forfeit_round + 1);
                if next > 0 {
                    circle.pot_bonus[(next - 1) as usize] = circle.pot_bonus[(next - 1) as usize]
                        .checked_add(forfeit_amount)
                        .ok_or(RoscaError::MathOverflow)?;
                } else {
                    // No future rounds — park in reserve as dust
                    circle.refund_reserve = circle
                        .refund_reserve
                        .checked_add(forfeit_amount)
                        .ok_or(RoscaError::MathOverflow)?;
                }
            }
        }
    }

    emit!(MemberSlashed {
        circle: circle.key(),
        user: ctx.accounts.member.user,
        missed_round,
        collateral_slashed: collateral,
    });

    if circle.all_rounds_claimed() {
        circle.status = CircleStatus::Completed;
        emit!(CircleCompleted {
            circle: circle.key(),
        });
    }

    Ok(())
}
