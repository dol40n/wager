import { prisma } from "./db";
import { RATE_LIMIT_WINDOW_MS } from "./constants";

export async function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);

  try {
    const count = await prisma.rateLimitEntry.count({
      where: { key, createdAt: { gte: windowStart } },
    });

    if (count >= maxRequests) return true;

    await prisma.rateLimitEntry.create({ data: { key } });
    return false;
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
  const { count } = await prisma.rateLimitEntry.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
