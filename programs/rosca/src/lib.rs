use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj");

#[program]
pub mod rosca {
    use super::*;

    pub fn create_circle(
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
        create_circle::handler(
            ctx,
            circle_id,
            contribution_amount,
            round_duration,
            grace_period,
            start_deadline,
            max_members,
            exit_penalty_bps,
            collateral_bps,
            require_clean_history,
        )
    }

    pub fn join(ctx: Context<Join>) -> Result<()> {
        join::handler(ctx)
    }

    pub fn leave(ctx: Context<Leave>) -> Result<()> {
        leave::handler(ctx)
    }

    pub fn cancel_circle(ctx: Context<CancelCircle>) -> Result<()> {
        cancel_circle::handler(ctx)
    }

    pub fn contribute(ctx: Context<Contribute>, round: u8) -> Result<()> {
        contribute::handler(ctx, round)
    }

    pub fn claim_payout(ctx: Context<ClaimPayout>, round: u8) -> Result<()> {
        claim_payout::handler(ctx, round)
    }

    pub fn slash(ctx: Context<Slash>, missed_round: u8) -> Result<()> {
        slash::handler(ctx, missed_round)
    }

    pub fn exit_early(ctx: Context<ExitEarly>) -> Result<()> {
        exit_early::handler(ctx)
    }

    pub fn close_member(ctx: Context<CloseMember>) -> Result<()> {
        close_member::handler(ctx)
    }

    pub fn close_circle(ctx: Context<CloseCircle>) -> Result<()> {
        close_circle::handler(ctx)
    }
}
