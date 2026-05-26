use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::BetSide;

declare_id!("7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN");

#[program]
pub mod wager_escrow {
    use super::*;

    pub fn initialize_bet(
        ctx: Context<InitializeBet>,
        bet_id_hash: [u8; 32],
        maker_side: BetSide,
        stake_lamports: u64,
        deadline_ts: i64,
        fee_bps: u16,
        allowed_taker: Option<Pubkey>,
    ) -> Result<()> {
        instructions::initialize_bet::handler(
            ctx,
            bet_id_hash,
            maker_side,
            stake_lamports,
            deadline_ts,
            fee_bps,
            allowed_taker,
        )
    }

    pub fn fund_maker(ctx: Context<FundMaker>) -> Result<()> {
        instructions::fund_maker::handler(ctx)
    }

    pub fn accept_bet(ctx: Context<AcceptBet>) -> Result<()> {
        instructions::accept_bet::handler(ctx)
    }

    pub fn cancel_unaccepted_bet(ctx: Context<CancelUnaccepted>) -> Result<()> {
        instructions::cancel_unaccepted::handler(ctx)
    }

    pub fn propose_result(
        ctx: Context<ProposeResult>,
        proposed_winner: Pubkey,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        instructions::propose_result::handler(ctx, proposed_winner, evidence_hash)
    }

    pub fn dispute_result(ctx: Context<DisputeResult>) -> Result<()> {
        instructions::dispute_result::handler(ctx)
    }

    pub fn finalize_result_after_dispute_window(
        ctx: Context<FinalizeAfterDispute>,
    ) -> Result<()> {
        instructions::finalize_after_dispute::handler(ctx)
    }

    pub fn admin_finalize_disputed(
        ctx: Context<AdminFinalize>,
        final_winner: Pubkey,
    ) -> Result<()> {
        instructions::admin_finalize::handler(ctx, final_winner)
    }

    pub fn refund_if_expired_or_unresolved(ctx: Context<RefundExpired>) -> Result<()> {
        instructions::refund_expired::handler(ctx)
    }
}
