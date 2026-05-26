use anchor_lang::prelude::*;
use crate::errors::WagerError;
use crate::state::*;

#[derive(Accounts)]
pub struct DisputeResult<'info> {
    #[account(
        mut,
        constraint = bet.status == BetStatus::ResultProposed @ WagerError::InvalidStatus,
    )]
    pub bet: Account<'info, BetAccount>,

    pub disputer: Signer<'info>,
}

pub fn handler(ctx: Context<DisputeResult>) -> Result<()> {
    let bet = &mut ctx.accounts.bet;
    let disputer = ctx.accounts.disputer.key();

    require!(
        disputer == bet.maker || Some(disputer) == bet.taker,
        WagerError::Unauthorized
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < bet.dispute_deadline_ts,
        WagerError::DisputeWindowExpired
    );

    bet.status = BetStatus::Disputed;

    Ok(())
}
