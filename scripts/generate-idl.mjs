#!/usr/bin/env node
// Generates the IDL JSON from the Rust program source.
// This is required because Anchor 0.30.1's `anchor idl build` is broken
// with proc-macro2 >= 1.0.80 (source_file() removed). See:
// https://github.com/coral-xyz/anchor/issues/3042
//
// Discriminators are computed as sha256("global:<instruction_name>")[0..8]
// and sha256("account:<AccountName>")[0..8], matching Anchor's convention.
//
// Run: node scripts/generate-idl.mjs

import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function disc(namespace, name) {
  return Array.from(
    createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8)
  );
}

// Read program ID from lib.rs
const libRs = readFileSync(resolve(ROOT, "programs/wager_escrow/src/lib.rs"), "utf8");
const programIdMatch = libRs.match(/declare_id!\("([^"]+)"\)/);
if (!programIdMatch) throw new Error("Could not find declare_id! in lib.rs");
const programId = programIdMatch[1];

const idl = {
  address: programId,
  metadata: { name: "wager_escrow", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "initialize_bet",
      discriminator: disc("global", "initialize_bet"),
      accounts: [
        { name: "bet", writable: true, pda: { seeds: [{ kind: "const", value: [98, 101, 116] }, { kind: "arg", path: "bet_id_hash" }] } },
        { name: "vault", pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "bet" }] } },
        { name: "maker", writable: true, signer: true },
        { name: "resolver_authority" },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "bet_id_hash", type: { array: ["u8", 32] } },
        { name: "maker_side", type: { defined: { name: "BetSide" } } },
        { name: "stake_lamports", type: "u64" },
        { name: "deadline_ts", type: "i64" },
        { name: "fee_bps", type: "u16" },
        { name: "allowed_taker", type: { option: "pubkey" } },
      ],
    },
    {
      name: "fund_maker",
      discriminator: disc("global", "fund_maker"),
      accounts: [
        { name: "bet", writable: true },
        { name: "vault", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "bet" }] } },
        { name: "maker", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "accept_bet",
      discriminator: disc("global", "accept_bet"),
      accounts: [
        { name: "bet", writable: true },
        { name: "vault", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "bet" }] } },
        { name: "taker", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "cancel_unaccepted_bet",
      discriminator: disc("global", "cancel_unaccepted_bet"),
      accounts: [
        { name: "bet", writable: true },
        { name: "vault", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "bet" }] } },
        { name: "maker", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "propose_result",
      discriminator: disc("global", "propose_result"),
      accounts: [
        { name: "bet", writable: true },
        { name: "resolver_authority", signer: true },
      ],
      args: [
        { name: "proposed_winner", type: "pubkey" },
        { name: "evidence_hash", type: { array: ["u8", 32] } },
      ],
    },
    {
      name: "dispute_result",
      discriminator: disc("global", "dispute_result"),
      accounts: [
        { name: "bet", writable: true },
        { name: "disputer", signer: true },
      ],
      args: [],
    },
    {
      name: "finalize_result_after_dispute_window",
      discriminator: disc("global", "finalize_result_after_dispute_window"),
      accounts: [
        { name: "bet", writable: true },
        { name: "vault", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "bet" }] } },
        { name: "winner", writable: true },
        { name: "fee_wallet", writable: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "admin_finalize_disputed",
      discriminator: disc("global", "admin_finalize_disputed"),
      accounts: [
        { name: "bet", writable: true },
        { name: "vault", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "bet" }] } },
        { name: "winner", writable: true },
        { name: "fee_wallet", writable: true },
        { name: "resolver_authority", signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [{ name: "final_winner", type: "pubkey" }],
    },
    {
      name: "refund_if_expired_or_unresolved",
      discriminator: disc("global", "refund_if_expired_or_unresolved"),
      accounts: [
        { name: "bet", writable: true },
        { name: "vault", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "bet" }] } },
        { name: "maker", writable: true },
        { name: "taker", writable: true, optional: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: "BetAccount", discriminator: disc("account", "BetAccount") },
  ],
  types: [
    {
      name: "BetAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "bet_id_hash", type: { array: ["u8", 32] } },
          { name: "maker", type: "pubkey" },
          { name: "taker", type: { option: "pubkey" } },
          { name: "allowed_taker", type: { option: "pubkey" } },
          { name: "maker_side", type: { defined: { name: "BetSide" } } },
          { name: "stake_lamports", type: "u64" },
          { name: "deadline_ts", type: "i64" },
          { name: "dispute_deadline_ts", type: "i64" },
          { name: "status", type: { defined: { name: "BetStatus" } } },
          { name: "proposed_winner", type: { option: "pubkey" } },
          { name: "final_winner", type: { option: "pubkey" } },
          { name: "resolver_authority", type: "pubkey" },
          { name: "fee_bps", type: "u16" },
          { name: "evidence_hash", type: { array: ["u8", 32] } },
          { name: "bump", type: "u8" },
          { name: "vault_bump", type: "u8" },
        ],
      },
    },
    {
      name: "BetSide",
      type: { kind: "enum", variants: [{ name: "Yes" }, { name: "No" }] },
    },
    {
      name: "BetStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Open" }, { name: "Accepted" }, { name: "ResultProposed" },
          { name: "Disputed" }, { name: "Finalized" }, { name: "Cancelled" }, { name: "Refunded" },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "InvalidStatus", msg: "Bet is not in the expected status" },
    { code: 6001, name: "Unauthorized", msg: "Unauthorized signer" },
    { code: 6002, name: "StakeExceedsMax", msg: "Stake amount exceeds maximum allowed" },
    { code: 6003, name: "ZeroStake", msg: "Stake amount must be greater than zero" },
    { code: 6004, name: "DeadlinePast", msg: "Deadline must be in the future" },
    { code: 6005, name: "DeadlineNotReached", msg: "Deadline has not passed yet" },
    { code: 6006, name: "DisputeWindowActive", msg: "Dispute window has not expired" },
    { code: 6007, name: "DisputeWindowExpired", msg: "Dispute window has expired" },
    { code: 6008, name: "TakerNotAllowed", msg: "Taker not allowed for this bet" },
    { code: 6009, name: "FeeTooHigh", msg: "Fee basis points too high" },
    { code: 6010, name: "Overflow", msg: "Arithmetic overflow" },
    { code: 6011, name: "InvalidEvidenceHash", msg: "Invalid evidence hash" },
    { code: 6012, name: "NotExpiredOrResolved", msg: "Bet has not expired or is already resolved" },
  ],
};

mkdirSync(resolve(ROOT, "target/idl"), { recursive: true });
const outPath = resolve(ROOT, "target/idl/wager_escrow.json");
writeFileSync(outPath, JSON.stringify(idl, null, 2) + "\n");
console.log(`IDL written to ${outPath}`);
console.log(`Program ID: ${programId}`);
console.log(`Instructions: ${idl.instructions.length}`);
console.log(`Accounts: ${idl.accounts.length}`);
console.log(`Types: ${idl.types.length}`);
console.log(`Errors: ${idl.errors.length}`);
