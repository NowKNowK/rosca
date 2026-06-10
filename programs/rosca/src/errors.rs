use anchor_lang::prelude::*;

#[error_code]
pub enum RoscaError {
    #[msg("Invalid circle configuration")]
    InvalidCircleConfig,

    #[msg("Circle is not in Filling state")]
    CircleNotFilling,

    #[msg("Circle is already full")]
    CircleFull,

    #[msg("Start deadline has passed")]
    StartDeadlinePassed,

    #[msg("Start deadline has not yet passed")]
    StartDeadlineNotPassed,

    #[msg("Member has a default history; this circle requires clean history")]
    HistoryNotClean,

    #[msg("Circle is not in Active state")]
    CircleNotActive,

    #[msg("Member is not in Active state")]
    MemberNotActive,

    #[msg("Member has already contributed in this round")]
    AlreadyContributed,

    #[msg("Invalid round number")]
    InvalidRound,

    #[msg("Round has not started yet")]
    RoundNotStarted,

    #[msg("Contribution window has closed for this round")]
    ContributionWindowClosed,

    #[msg("This round's pot has already been claimed")]
    PotAlreadyClaimed,

    #[msg("Cannot claim yet: window has not closed and pot is not full")]
    ClaimTooEarly,

    #[msg("Recipient does not match the scheduled position for this round")]
    RecipientMismatch,

    #[msg("Recipient has missed a contribution and is not eligible to claim")]
    RecipientNotEligible,

    #[msg("Member is not slashable: they have contributed in the specified round")]
    MemberNotSlashable,

    #[msg("Grace period has not expired yet")]
    GracePeriodNotExpired,

    #[msg("Member has already received their payout")]
    AlreadyReceivedPayout,

    #[msg("Your payout round has arrived — use claim_payout instead of exit_early")]
    PayoutAvailableUseClaim,

    #[msg("Exit window is closed: too late in the circle to exit")]
    ExitWindowClosed,

    #[msg("Circle is not in Completed or Cancelled state")]
    CircleNotComplete,

    #[msg("Some member accounts are still open; close them first")]
    MembersStillOpen,

    #[msg("Arithmetic overflow")]
    MathOverflow,
}
