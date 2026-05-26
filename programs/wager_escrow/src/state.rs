use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct BetAccount {
    pub bet_id_hash: [u8; 32],
    pub maker: Pubkey,
    pub taker: Option<Pubkey>,
    pub allowed_taker: Option<Pubkey>,
    pub maker_side: BetSide,
    pub stake_lamports: u64,
    pub deadline_ts: i64,
    pub dispute_deadline_ts: i64,
    pub status: BetStatus,
    pub proposed_winner: Option<Pubkey>,
    pub final_winner: Option<Pubkey>,
    pub resolver_authority: Pubkey,
    pub fee_bps: u16,
    pub evidence_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BetSide {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BetStatus {
    Open,
    Accepted,
    ResultProposed,
    Disputed,
    Finalized,
    Cancelled,
    Refunded,
}

impl BetAccount {
    pub const SEED_PREFIX: &'static [u8] = b"bet";
    pub const VAULT_SEED_PREFIX: &'static [u8] = b"vault";
}
