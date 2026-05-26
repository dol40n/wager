use anchor_lang::prelude::*;
use crate::errors::WagerError;
use crate::state::*;

pub const MAX_STAKE_LAMPORTS: u64 = 10_000_000_000; // 10 SOL devnet max
pub const MAX_FEE_BPS: u16 = 500; // 5%
pub const DISPUTE_WINDOW_SECONDS: i64 = 86_400; // 24 hours

#[derive(Accounts)]
#[instruction(bet_id_hash: [u8; 32])]
pub struct InitializeBet<'info> {
    #[account(
        init,
        payer = maker,
        space = 8 + BetAccount::INIT_SPACE,
        seeds = [BetAccount::SEED_PREFIX, bet_id_hash.as_ref()],
        bump,
    )]
    pub bet: Account<'info, BetAccount>,

    /// CHECK: PDA vault, validated by seeds
    #[account(
        seeds = [BetAccount::VAULT_SEED_PREFIX, bet.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: resolver authority pubkey stored on bet
    pub resolver_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeBet>,
    bet_id_hash: [u8; 32],
    maker_side: BetSide,
    stake_lamports: u64,
    deadline_ts: i64,
    fee_bps: u16,
    allowed_taker: Option<Pubkey>,
) -> Result<()> {
    require!(stake_lamports > 0, WagerError::ZeroStake);
    require!(stake_lamports <= MAX_STAKE_LAMPORTS, WagerError::StakeExceedsMax);
    require!(fee_bps <= MAX_FEE_BPS, WagerError::FeeTooHigh);

    let clock = Clock::get()?;
    require!(deadline_ts > clock.unix_timestamp, WagerError::DeadlinePast);

    let bet = &mut ctx.accounts.bet;
    bet.bet_id_hash = bet_id_hash;
    bet.maker = ctx.accounts.maker.key();
    bet.taker = None;
    bet.allowed_taker = allowed_taker;
    bet.maker_side = maker_side;
    bet.stake_lamports = stake_lamports;
    bet.deadline_ts = deadline_ts;
    bet.dispute_deadline_ts = 0;
    bet.status = BetStatus::Open;
    bet.proposed_winner = None;
    bet.final_winner = None;
    bet.resolver_authority = ctx.accounts.resolver_authority.key();
    bet.fee_bps = fee_bps;
    bet.evidence_hash = [0u8; 32];
    bet.bump = ctx.bumps.bet;
    bet.vault_bump = ctx.bumps.vault;

    Ok(())
}
