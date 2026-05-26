use anchor_lang::prelude::*;

#[error_code]
pub enum WagerError {
    #[msg("Bet is not in the expected status")]
    InvalidStatus,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Stake amount exceeds maximum allowed")]
    StakeExceedsMax,
    #[msg("Stake amount must be greater than zero")]
    ZeroStake,
    #[msg("Deadline must be in the future")]
    DeadlinePast,
    #[msg("Deadline has not passed yet")]
    DeadlineNotReached,
    #[msg("Dispute window has not expired")]
    DisputeWindowActive,
    #[msg("Dispute window has expired")]
    DisputeWindowExpired,
    #[msg("Taker not allowed for this bet")]
    TakerNotAllowed,
    #[msg("Fee basis points too high")]
    FeeTooHigh,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid evidence hash")]
    InvalidEvidenceHash,
    #[msg("Bet has not expired or is already resolved")]
    NotExpiredOrResolved,
}
