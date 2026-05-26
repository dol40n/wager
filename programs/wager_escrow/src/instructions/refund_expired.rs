use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WagerError;
use crate::state::*;

const REFUND_TIMEOUT_SECONDS: i64 = 7 * 86_400; // 7 days after deadline

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(mut)]
    pub bet: Account<'info, BetAccount>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [BetAccount::VAULT_SEED_PREFIX, bet.key().as_ref()],
        bump = bet.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: maker refund destination
    #[account(
        mut,
        constraint = maker.key() == bet.maker @ WagerError::Unauthorized,
    )]
    pub maker: SystemAccount<'info>,

    /// CHECK: taker refund destination (optional)
    #[account(mut)]
    pub taker: Option<SystemAccount<'info>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RefundExpired>) -> Result<()> {
    let bet = &mut ctx.accounts.bet;

    let refundable = matches!(
        bet.status,
        BetStatus::Open | BetStatus::Accepted | BetStatus::Disputed
    );
    require!(refundable, WagerError::NotExpiredOrResolved);

    let clock = Clock::get()?;
    let refund_after = bet.deadline_ts
        .checked_add(REFUND_TIMEOUT_SECONDS)
        .ok_or(WagerError::Overflow)?;
    require!(clock.unix_timestamp >= refund_after, WagerError::DeadlineNotReached);

    let vault_balance = ctx.accounts.vault.lamports();
    let bet_key = bet.key();
    let seeds: &[&[u8]] = &[
        BetAccount::VAULT_SEED_PREFIX,
        bet_key.as_ref(),
        &[bet.vault_bump],
    ];

    if bet.taker.is_some() {
        let half = vault_balance / 2;
        let remainder = vault_balance - half;

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.maker.to_account_info(),
                },
                &[seeds],
            ),
            half,
        )?;

        if let Some(taker_account) = &ctx.accounts.taker {
            require!(
                Some(taker_account.key()) == bet.taker,
                WagerError::Unauthorized
            );
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: taker_account.to_account_info(),
                    },
                    &[seeds],
                ),
                remainder,
            )?;
        } else {
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.maker.to_account_info(),
                    },
                    &[seeds],
                ),
                remainder,
            )?;
        }
    } else {
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.maker.to_account_info(),
                },
                &[seeds],
            ),
            vault_balance,
        )?;
    }

    bet.status = BetStatus::Refunded;

    Ok(())
}
