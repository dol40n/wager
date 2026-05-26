use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WagerError;
use crate::state::*;

#[derive(Accounts)]
pub struct FundMaker<'info> {
    #[account(
        mut,
        has_one = maker,
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
    pub maker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FundMaker>) -> Result<()> {
    let bet = &ctx.accounts.bet;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.maker.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        bet.stake_lamports,
    )?;

    Ok(())
}
