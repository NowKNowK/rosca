use anchor_lang::prelude::*;

use crate::{
    errors::RoscaError,
    events::CircleCancelled,
    state::{Circle, CircleStatus},
};

#[derive(Accounts)]
pub struct CancelCircle<'info> {
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = circle.status == CircleStatus::Filling @ RoscaError::CircleNotFilling,
    )]
    pub circle: Account<'info, Circle>,
}

pub fn handler(ctx: Context<CancelCircle>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(
        now > ctx.accounts.circle.start_deadline,
        RoscaError::StartDeadlineNotPassed
    );

    ctx.accounts.circle.status = CircleStatus::Cancelled;

    emit!(CircleCancelled {
        circle: ctx.accounts.circle.key(),
    });

    Ok(())
}
