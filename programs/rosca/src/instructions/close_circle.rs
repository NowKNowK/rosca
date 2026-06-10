use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    errors::RoscaError,
    events::CircleClosed,
    state::{Circle, CircleStatus},
};

#[derive(Accounts)]
pub struct CloseCircle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        close = creator,
        constraint = matches!(circle.status, CircleStatus::Completed | CircleStatus::Cancelled)
            @ RoscaError::CircleNotComplete,
        constraint = circle.open_member_accounts == 0 @ RoscaError::MembersStillOpen,
    )]
    pub circle: Account<'info, Circle>,

    /// CHECK: receives rent from closing circle account.
    #[account(mut, address = circle.creator)]
    pub creator: AccountInfo<'info>,

    #[account(address = circle.token_mint)]
    pub token_mint: Account<'info, Mint>,

    /// Any dust remaining in vault is swept to creator_token before closing vault.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = token_mint,
        associated_token::authority = creator,
    )]
    pub creator_token: Account<'info, TokenAccount>,

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

pub fn handler(ctx: Context<CloseCircle>) -> Result<()> {
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

    // Sweep any vault dust to creator
    let vault_balance = ctx.accounts.vault.amount;
    if vault_balance > 0 {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.creator_token.to_account_info(),
                authority: ctx.accounts.circle.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, vault_balance)?;
    }

    // Close vault account, recovering rent to creator
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.circle.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(cpi_ctx)?;

    emit!(CircleClosed {
        circle: ctx.accounts.circle.key(),
    });

    Ok(())
}
