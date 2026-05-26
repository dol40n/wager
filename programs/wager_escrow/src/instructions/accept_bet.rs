use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WagerError;
use crate::state::*;

#[derive(Accounts)]
pub struct AcceptBet<'info> {
    #[account(
        mut,
        constraint = bet.status == BetStatus::Open @ WagerError::InvalidStatus,
    )]
    pub bet: Account<'info, BetAccount>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [BetAccount::VAULT_SEED_PREFIX, bet.key().as_ref()],
        bump = bet.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub taker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AcceptBet>) -> Result<()> {
    let bet = &mut ctx.accounts.bet;
    let taker_key = ctx.accounts.taker.key();

    if let Some(allowed) = bet.allowed_taker {
        require!(taker_key == allowed, WagerError::TakerNotAllowed);
    }

    let clock = Clock::get()?;
    require!(clock.unix_timestamp < bet.deadline_ts, WagerError::DeadlineNotReached);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.taker.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        bet.stake_lamports,
    )?;

    bet.taker = Some(taker_key);
    bet.status = BetStatus::Accepted;

    Ok(())
}
