use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WagerError;
use crate::state::*;

#[derive(Accounts)]
pub struct AdminFinalize<'info> {
    #[account(
        mut,
        has_one = resolver_authority,
        constraint = bet.status == BetStatus::Disputed @ WagerError::InvalidStatus,
    )]
    pub bet: Account<'info, BetAccount>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [BetAccount::VAULT_SEED_PREFIX, bet.key().as_ref()],
        bump = bet.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: winner receives payout
    #[account(mut)]
    pub winner: SystemAccount<'info>,

    /// CHECK: fee destination
    #[account(mut)]
    pub fee_wallet: SystemAccount<'info>,

    pub resolver_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AdminFinalize>, final_winner: Pubkey) -> Result<()> {
    let bet = &mut ctx.accounts.bet;

    require!(
        final_winner == bet.maker || Some(final_winner) == bet.taker,
        WagerError::Unauthorized
    );
    require!(ctx.accounts.winner.key() == final_winner, WagerError::Unauthorized);

    let total_pot = ctx.accounts.vault.lamports();
    let fee = (total_pot as u128)
        .checked_mul(bet.fee_bps as u128)
        .ok_or(WagerError::Overflow)?
        .checked_div(10_000)
        .ok_or(WagerError::Overflow)? as u64;
    let payout = total_pot.checked_sub(fee).ok_or(WagerError::Overflow)?;

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
                to: ctx.accounts.winner.to_account_info(),
            },
            &[seeds],
        ),
        payout,
    )?;

    if fee > 0 {
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.fee_wallet.to_account_info(),
                },
                &[seeds],
            ),
            fee,
        )?;
    }

    bet.final_winner = Some(final_winner);
    bet.status = BetStatus::Finalized;

    Ok(())
}
