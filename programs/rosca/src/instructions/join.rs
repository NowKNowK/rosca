use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    errors::RoscaError,
    events::{CircleStarted, MemberJoined},
    state::{Circle, CircleStatus, Member, MemberHistory, MemberStatus, HISTORY_SPACE, MEMBER_SPACE},
};

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = circle.status == CircleStatus::Filling @ RoscaError::CircleNotFilling,
    )]
    pub circle: Account<'info, Circle>,

    #[account(
        init,
        payer = user,
        space = MEMBER_SPACE,
        seeds = [b"member", circle.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    #[account(
        init_if_needed,
        payer = user,
        space = HISTORY_SPACE,
        seeds = [b"history", user.key().as_ref()],
        bump,
    )]
    pub history: Account<'info, MemberHistory>,

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
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Join>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    {
        let circle = &ctx.accounts.circle;
        require!(now <= circle.start_deadline, RoscaError::StartDeadlinePassed);
        require!(
            circle.member_count < circle.max_members,
            RoscaError::CircleFull
        );
        require!(
            !circle.require_clean_history || ctx.accounts.history.defaults == 0,
            RoscaError::HistoryNotClean
        );
    }

    // Assign lowest free position
    let position = ctx.accounts.circle.lowest_free_position();
    require!(position > 0, RoscaError::CircleFull);

    let collateral = ctx.accounts.circle.required_collateral(position);

    // Transfer collateral from user to vault
    if collateral > 0 {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, collateral)?;
    }

    // Init member
    let member = &mut ctx.accounts.member;
    member.circle = ctx.accounts.circle.key();
    member.user = ctx.accounts.user.key();
    member.position = position;
    member.collateral = collateral;
    member.contributions = 0;
    member.surcharge_paid = 0;
    member.refund_due = 0;
    member.status = MemberStatus::Active;
    member.has_received_payout = false;
    member.bump = ctx.bumps.member;

    // Init history if new
    let history = &mut ctx.accounts.history;
    if history.user == Pubkey::default() {
        history.user = ctx.accounts.user.key();
        history.defaults = 0;
        history.completed = 0;
        history.bump = ctx.bumps.history;
    }

    // Update circle
    let circle = &mut ctx.accounts.circle;
    circle.occupied_positions |= 1u16 << (position - 1);
    circle.member_count += 1;
    circle.total_collateral = circle
        .total_collateral
        .checked_add(collateral)
        .ok_or(RoscaError::MathOverflow)?;
    circle.open_member_accounts += 1;

    emit!(MemberJoined {
        circle: circle.key(),
        user: ctx.accounts.user.key(),
        position,
        collateral,
    });

    // Auto-start when full
    if circle.member_count == circle.max_members {
        circle.status = CircleStatus::Active;
        circle.started_at = now;
        circle.total_rounds = circle.max_members;
        circle.active_members = circle.max_members;

        emit!(CircleStarted {
            circle: circle.key(),
            started_at: now,
            total_rounds: circle.max_members,
        });
    }

    Ok(())
}
