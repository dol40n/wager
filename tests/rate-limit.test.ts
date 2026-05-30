import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    rateLimitCounter: { deleteMany: vi.fn() },
    rateLimitEntry: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { isRateLimited, cleanupRateLimits } from "@/lib/rate-limit";

const $queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const counterDelete = prisma.rateLimitCounter.deleteMany as unknown as ReturnType<typeof vi.fn>;
const legacyDelete = prisma.rateLimitEntry.deleteMany as unknown as ReturnType<typeof vi.fn>;

describe("isRateLimited (atomic counter)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the first request in a window", async () => {
    $queryRaw.mockResolvedValueOnce([{ count: 1 }]);
    expect(await isRateLimited("k", 5)).toBe(false);
  });

  it("allows exactly maxRequests (boundary)", async () => {
    $queryRaw.mockResolvedValueOnce([{ count: 5 }]);
    expect(await isRateLimited("k", 5)).toBe(false);
  });

  it("blocks the request that exceeds maxRequests", async () => {
    $queryRaw.mockResolvedValueOnce([{ count: 6 }]);
    expect(await isRateLimited("k", 5)).toBe(true);
  });

  it("handles BigInt counts from the driver", async () => {
    $queryRaw.mockResolvedValueOnce([{ count: BigInt(11) }]);
    expect(await isRateLimited("k", 10)).toBe(true);
  });

  it("fails open when the DB errors", async () => {
    $queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    expect(await isRateLimited("k", 5)).toBe(false);
  });

  it("issues a single atomic statement per call", async () => {
    $queryRaw.mockResolvedValueOnce([{ count: 1 }]);
    await isRateLimited("create:wallet:abc", 5);
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("cleanupRateLimits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sums deletions from both the counter and legacy tables", async () => {
    counterDelete.mockResolvedValueOnce({ count: 7 });
    legacyDelete.mockResolvedValueOnce({ count: 3 });
    expect(await cleanupRateLimits()).toBe(10);
  });
});
