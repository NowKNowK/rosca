use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    errors::RoscaError,
    events::MemberLeft,
    state::{Circle, CircleStatus, Member},
};

#[derive(Accounts)]
pub struct Leave<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = circle.status == CircleStatus::Filling @ RoscaError::CircleNotFilling,
    )]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        close = user,
        has_one = circle,
        has_one = user,
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
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Leave>) -> Result<()> {
    let collateral = ctx.accounts.member.collateral;
    let position = ctx.accounts.member.position;

    // Return collateral from vault to user
    if collateral > 0 {
        let circle_key = ctx.accounts.circle.key();
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
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.circle.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, collateral)?;
        let _ = circle_key;
    }

    let circle = &mut ctx.accounts.circle;
    circle.occupied_positions &= !(1u16 << (position - 1));
    circle.member_count -= 1;
    circle.total_collateral = circle.total_collateral.saturating_sub(collateral);
    circle.open_member_accounts -= 1;

    emit!(MemberLeft {
        circle: circle.key(),
        user: ctx.accounts.user.key(),
        collateral_returned: collateral,
    });

    Ok(())
}
