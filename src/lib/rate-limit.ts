import { RATE_LIMIT_WINDOW_MS } from "./constants";

export interface RateLimitAdapter {
  check(key: string, maxRequests: number, windowMs: number): Promise<boolean>;
}

// WARNING: In-memory adapter is NOT production-safe.
// It resets on every serverless cold start and does not share state across instances.
// For production, implement RedisAdapter using Upstash or similar.
class MemoryAdapter implements RateLimitAdapter {
  private buckets = new Map<string, number[]>();

  async check(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const timestamps = this.buckets.get(key) || [];
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxRequests) {
      this.buckets.set(key, recent);
      return true;
    }

    recent.push(now);
    this.buckets.set(key, recent);
    return false;
  }
}

// Placeholder for production: swap with RedisAdapter
// class RedisAdapter implements RateLimitAdapter {
//   constructor(private redis: Redis) {}
//   async check(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
//     const count = await this.redis.incr(key);
//     if (count === 1) await this.redis.pexpire(key, windowMs);
//     return count > maxRequests;
//   }
// }

const adapter: RateLimitAdapter = new MemoryAdapter();

export function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): boolean {
  // Synchronous wrapper for the memory adapter (async for interface compat)
  const now = Date.now();
  const memAdapter = adapter as MemoryAdapter;
  const buckets = (memAdapter as unknown as { buckets: Map<string, number[]> }).buckets;
  const timestamps = buckets.get(key) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    buckets.set(key, recent);
    return true;
  }

  recent.push(now);
  buckets.set(key, recent);
  return false;
}
