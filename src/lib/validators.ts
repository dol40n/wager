import { z } from "zod";
import { MAX_STAKE_LAMPORTS } from "./constants";

export const normalizeRequestSchema = z.object({
  text: z.string().min(10).max(1000),
  deadline_utc: z.string().datetime().optional(),
});

export const createBetSchema = z.object({
  original_text: z.string().min(10).max(1000),
  normalized_question: z.string().min(10).max(500),
  category: z.enum(["crypto", "sports", "social_media", "news", "custom"]),
  yes_definition: z.string().min(5).max(500),
  no_definition: z.string().min(5).max(500),
  deadline_utc: z.string().datetime(),
  resolution_sources: z.array(z.string()).min(1),
  resolution_method: z.enum([
    "api",
    "web_research",
    "ai_evidence",
    "manual_review",
  ]),
  objective_criteria: z.array(z.string()),
  ambiguity_score: z.number().min(0).max(1),
  ambiguity_notes: z.array(z.string()),
  maker_side: z.enum(["YES", "NO"]),
  stake_lamports: z
    .number()
    .int()
    .positive()
    .max(MAX_STAKE_LAMPORTS),
  fee_bps: z.number().int().min(0).max(500).default(100),
  maker_pubkey: z.string().min(32).max(44),
  allowed_taker: z.string().min(32).max(44).optional(),
});

export const disputeSchema = z.object({
  wallet_pubkey: z.string().min(32).max(44),
  reason: z.string().min(10).max(1000),
});

export const adminFinalizeSchema = z.object({
  winner_side: z.enum(["YES", "NO"]),
  confirmation: z.string().optional(),
});

export const resolverRunSchema = z.object({
  bet_id: z.string().optional(),
});

export function validateAdminAuth(request: Request): boolean {
  const apiKey = request.headers.get("x-admin-api-key");
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey || !apiKey) return false;
  return apiKey === expectedKey;
}
