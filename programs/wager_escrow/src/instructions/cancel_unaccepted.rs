use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WagerError;
use crate::state::*;

#[derive(Accounts)]
pub struct CancelUnaccepted<'info> {
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

pub fn handler(ctx: Context<CancelUnaccepted>) -> Result<()> {
    let bet = &mut ctx.accounts.bet;

    let vault_lamports = ctx.accounts.vault.lamports();
    if vault_lamports > 0 {
        let bet_key = bet.key();
        let seeds: &[&[u8]] = &[
            BetAccount::VAULT_SEED_PREFIX,
            bet_key.as_ref(),
            &[bet.vault_bump],
        ];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.maker.to_account_info(),
                },
                &[seeds],
            ),
            vault_lamports,
        )?;
    }

    bet.status = BetStatus::Cancelled;

    Ok(())
}
