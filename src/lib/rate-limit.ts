import { prisma } from "./db";
import { RATE_LIMIT_WINDOW_MS } from "./constants";

export async function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): Promise<boolean> {
  // Fixed-window counter. The INSERT ... ON CONFLICT DO UPDATE ... RETURNING is a
  // single atomic statement, so concurrent requests cannot both read a stale
  // count and slip past the limit (the previous count()-then-create() raced).
  // Tradeoff vs the old sliding window: at a bucket boundary up to 2x requests
  // can pass in a short span — acceptable for these non-destructive endpoints.
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  try {
    const rows = await prisma.$queryRaw<Array<{ count: number | bigint }>>`
      INSERT INTO "RateLimitCounter" ("key", "windowStart", "count")
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
      RETURNING "count"
    `;
    const count = Number(rows[0]?.count ?? 0);
    return count > maxRequests;
  } catch (err) {
    // Deliberate fail-open: a DB outage should not lock out all users.
    // Tradeoff — rate limiting is unenforced during a DB outage. Acceptable
    // because the protected endpoints (normalize/create) have no destructive
    // on-chain effect; the actual fund/accept TXs are wallet-signed and bounded
    // by the on-chain program. Logged so outages are visible.
    console.error("[rate-limit] DB error, failing open:", err);
    return false;
  }
}

export async function cleanupRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS * 2);
  const [counters, legacy] = await Promise.all([
    prisma.rateLimitCounter.deleteMany({ where: { windowStart: { lt: cutoff } } }),
    // Purge any residual rows from the deprecated per-request table.
    prisma.rateLimitEntry.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return counters.count + legacy.count;
}
