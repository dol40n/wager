use anchor_lang::prelude::*;
use crate::errors::WagerError;
use crate::state::*;
use crate::instructions::initialize_bet::DISPUTE_WINDOW_SECONDS;

#[derive(Accounts)]
pub struct ProposeResult<'info> {
    #[account(
        mut,
        has_one = resolver_authority,
        constraint = bet.status == BetStatus::Accepted @ WagerError::InvalidStatus,
    )]
    pub bet: Account<'info, BetAccount>,

    pub resolver_authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<ProposeResult>,
    proposed_winner: Pubkey,
    evidence_hash: [u8; 32],
) -> Result<()> {
    let bet = &mut ctx.accounts.bet;

    let clock = Clock::get()?;
    require!(clock.unix_timestamp >= bet.deadline_ts, WagerError::DeadlineNotReached);

    require!(
        proposed_winner == bet.maker || Some(proposed_winner) == bet.taker,
        WagerError::Unauthorized
    );

    bet.proposed_winner = Some(proposed_winner);
    bet.evidence_hash = evidence_hash;
    bet.dispute_deadline_ts = clock.unix_timestamp
        .checked_add(DISPUTE_WINDOW_SECONDS)
        .ok_or(WagerError::Overflow)?;
    bet.status = BetStatus::ResultProposed;

    Ok(())
}
