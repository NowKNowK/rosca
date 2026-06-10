use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    errors::RoscaError,
    events::{CircleCompleted, PayoutClaimed},
    state::{Circle, CircleStatus, Member, MemberStatus},
};

#[derive(Accounts)]
#[instruction(round: u8)]
pub struct ClaimPayout<'info> {
    /// Anyone can trigger the payout; tokens always go to recipient_token.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = circle.status == CircleStatus::Active @ RoscaError::CircleNotActive,
    )]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        has_one = circle,
        constraint = recipient_member.status == MemberStatus::Active @ RoscaError::MemberNotActive,
        constraint = !recipient_member.has_received_payout @ RoscaError::AlreadyReceivedPayout,
    )]
    pub recipient_member: Account<'info, Member>,

    /// CHECK: verified via address constraint to be the member's actual wallet.
    #[account(address = recipient_member.user)]
    pub recipient: AccountInfo<'info>,

    /// init_if_needed protects against griefing via ATA closure — payer recreates it.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = token_mint,
        associated_token::authority = recipient,
    )]
    pub recipient_token: Account<'info, TokenAccount>,

    #[account(address = circle.token_mint)]
    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        address = circle.vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<ClaimPayout>, round: u8) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    {
        let circle = &ctx.accounts.circle;
        let member = &ctx.accounts.recipient_member;

        require!(
            round >= 1 && round <= circle.total_rounds,
            RoscaError::InvalidRound
        );
        require!(
            circle.claimed_rounds & (1u16 << (round - 1)) == 0,
            RoscaError::PotAlreadyClaimed
        );

        // Effective position must match the requested round
        let eff = member.eff_pos(circle.removed_positions);
        require!(eff == round, RoscaError::RecipientMismatch);

        // Recipient must have contributed in all rounds up to and including this one
        let required_mask = if round == 16 {
            u16::MAX
        } else {
            (1u16 << round) - 1
        };
        require!(
            member.contributions & required_mask == required_mask,
            RoscaError::RecipientNotEligible
        );

        // Can claim when window+grace has closed OR when pot is full
        let window_closed = now >= circle.round_end(round) + circle.grace_period;
        let pot_full = circle.contribution_counts[(round - 1) as usize] == circle.active_members;
        require!(window_closed || pot_full, RoscaError::ClaimTooEarly);
    }

    let payout = {
        let circle = &ctx.accounts.circle;
        let count = circle.contribution_counts[(round - 1) as usize] as u64;
        let bonus = circle.pot_bonus[(round - 1) as usize];
        circle
            .contribution_amount
            .checked_mul(count)
            .ok_or(RoscaError::MathOverflow)?
            .checked_add(bonus)
            .ok_or(RoscaError::MathOverflow)?
    };

    // Transfer pot from vault to recipient (capture keys before mutable borrows)
    let creator = ctx.accounts.circle.creator;
    let circle_id_bytes = ctx.accounts.circle.circle_id.to_le_bytes();
    let bump = ctx.accounts.circle.bump;
    let circle_key = ctx.accounts.circle.key();
    let recipient_user = ctx.accounts.recipient_member.user;

    {
        let seeds = &[
            b"circle".as_ref(),
            creator.as_ref(),
            circle_id_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient_token.to_account_info(),
                authority: ctx.accounts.circle.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, payout)?;
    }

    ctx.accounts.recipient_member.has_received_payout = true;

    let circle = &mut ctx.accounts.circle;
    circle.claimed_rounds |= 1u16 << (round - 1);

    emit!(PayoutClaimed {
        circle: circle_key,
        recipient: recipient_user,
        round,
        amount: payout,
    });

    if circle.all_rounds_claimed() {
        circle.status = CircleStatus::Completed;
        emit!(CircleCompleted {
            circle: circle_key,
        });
    }

    Ok(())
}
