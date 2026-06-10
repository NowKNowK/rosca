use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    errors::RoscaError,
    events::MemberClosed,
    state::{Circle, CircleStatus, Member, MemberHistory, MemberStatus},
};

#[derive(Accounts)]
pub struct CloseMember<'info> {
    /// Anyone can call this (permissionless). Pays rent for ATA recreation if needed.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = circle.status == CircleStatus::Completed
            || circle.status == CircleStatus::Cancelled
            @ RoscaError::CircleNotComplete,
    )]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        close = member_owner,
        has_one = circle,
    )]
    pub member: Account<'info, Member>,

    /// CHECK: destination for rent lamports from closing the member account.
    #[account(mut, address = member.user)]
    pub member_owner: AccountInfo<'info>,

    /// Global history for the member's user — updated on clean completion.
    #[account(
        mut,
        seeds = [b"history", member.user.as_ref()],
        bump = history.bump,
    )]
    pub history: Account<'info, MemberHistory>,

    #[account(address = circle.token_mint)]
    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        address = circle.vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// init_if_needed protects against griefing: if member closed their ATA,
    /// payer recreates it so the transfer still goes through.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = token_mint,
        associated_token::authority = member_owner,
    )]
    pub member_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CloseMember>) -> Result<()> {
    let member_status = ctx.accounts.member.status;
    let collateral = ctx.accounts.member.collateral;
    let refund_due = ctx.accounts.member.refund_due;
    let contributions = ctx.accounts.member.contributions;
    let circle_status = ctx.accounts.circle.status;
    let total_rounds = ctx.accounts.circle.total_rounds;
    let current_reserve = ctx.accounts.circle.refund_reserve;
    let circle_key = ctx.accounts.circle.key();
    let member_user = ctx.accounts.member.user;

    // Determine how much to transfer and what refund was actually paid
    let (collateral_to_transfer, actual_refund) = match circle_status {
        CircleStatus::Cancelled => (collateral, 0u64),

        CircleStatus::Completed => match member_status {
            MemberStatus::Active => {
                // Check if member contributed in all required rounds
                let required_mask = if total_rounds == 16 {
                    u16::MAX
                } else {
                    (1u16 << total_rounds) - 1
                };
                if (contributions & required_mask) == required_mask {
                    ctx.accounts.history.completed += 1;
                    (collateral, 0u64)
                } else {
                    // Silent defaulter — forfeit collateral to reserve (stays in vault as dust)
                    ctx.accounts.history.defaults += 1;
                    (0u64, 0u64)
                }
            }
            MemberStatus::Exited => {
                // Best-effort: pay min(refund_due, available_reserve)
                let actual = refund_due.min(current_reserve);
                (collateral, actual)
            }
            MemberStatus::Defaulted => (0u64, 0u64), // collateral already zeroed at slash
            MemberStatus::Completed => {
                // Should never reach here in normal flow
                return err!(RoscaError::CircleNotComplete);
            }
        },

        _ => return err!(RoscaError::CircleNotComplete),
    };

    let total_transfer = collateral_to_transfer
        .checked_add(actual_refund)
        .ok_or(RoscaError::MathOverflow)?;

    if total_transfer > 0 {
        let creator = ctx.accounts.circle.creator;
        let circle_id_bytes = ctx.accounts.circle.circle_id.to_le_bytes();
        let bump = ctx.accounts.circle.bump;
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
                to: ctx.accounts.member_token.to_account_info(),
                authority: ctx.accounts.circle.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, total_transfer)?;
    }

    // Update circle accounting
    let circle = &mut ctx.accounts.circle;
    circle.total_collateral = circle.total_collateral.saturating_sub(collateral_to_transfer);
    if matches!(member_status, MemberStatus::Exited) {
        circle.refund_reserve = circle.refund_reserve.saturating_sub(actual_refund);
    }
    circle.open_member_accounts -= 1;

    emit!(MemberClosed {
        circle: circle_key,
        user: member_user,
        collateral_returned: collateral_to_transfer,
        refund_returned: actual_refund,
    });

    Ok(())
}
