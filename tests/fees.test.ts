import { describe, it, expect } from "vitest";
import { calculateFeeBps } from "@/lib/fees";
import { solToLamports } from "@/lib/utils";

const SOL_84 = 84;
const SOL_30 = 30;

describe("calculateFeeBps — crypto", () => {
  it("1% for stake < 5 SOL", () => {
    const r = calculateFeeBps("crypto", solToLamports(0.1), SOL_84);
    expect(r.feeBps).toBe(100);
    expect(r.feePercent).toBe(1);
    expect(r.stakeTooLow).toBe(false);
  });

  it("1% for stake = 4.99 SOL", () => {
    const r = calculateFeeBps("crypto", solToLamports(4.99), SOL_84);
    expect(r.feeBps).toBe(100);
  });

  it("0.75% for stake >= 5 SOL", () => {
    const r = calculateFeeBps("crypto", solToLamports(5), SOL_84);
    expect(r.feeBps).toBe(75);
    expect(r.feePercent).toBe(0.75);
  });

  it("0.75% for stake = 10 SOL", () => {
    const r = calculateFeeBps("crypto", solToLamports(10), SOL_84);
    expect(r.feeBps).toBe(75);
  });

  it("no USD floor for crypto", () => {
    // Even at very low SOL price, crypto doesn't hit floor
    const r = calculateFeeBps("crypto", solToLamports(0.01), SOL_30);
    expect(r.feeBps).toBe(100);
    expect(r.stakeTooLow).toBe(false);
  });

  it("works without SOL price", () => {
    const r = calculateFeeBps("crypto", solToLamports(1), null);
    expect(r.feeBps).toBe(100);
    expect(r.stakeTooLow).toBe(false);
  });
});

describe("calculateFeeBps — non-crypto tiers", () => {
  it("3% for 0.05 SOL (micro)", () => {
    const r = calculateFeeBps("news", solToLamports(0.05), SOL_84);
    expect(r.feeBps).toBe(300);
    expect(r.feePercent).toBe(3);
  });

  it("3% for 0.24 SOL", () => {
    const r = calculateFeeBps("news", solToLamports(0.24), SOL_84);
    expect(r.feeBps).toBe(300);
  });

  it("2% for 0.25 SOL", () => {
    const r = calculateFeeBps("politics", solToLamports(0.25), SOL_84);
    expect(r.feeBps).toBe(200);
  });

  it("2% for 0.99 SOL", () => {
    const r = calculateFeeBps("custom", solToLamports(0.99), SOL_84);
    expect(r.feeBps).toBe(200);
  });

  it("1% for 1 SOL", () => {
    const r = calculateFeeBps("news", solToLamports(1), SOL_84);
    expect(r.feeBps).toBe(100);
  });

  it("1% for 4.99 SOL", () => {
    const r = calculateFeeBps("news", solToLamports(4.99), SOL_84);
    expect(r.feeBps).toBe(100);
  });

  it("0.75% for 5 SOL", () => {
    const r = calculateFeeBps("news", solToLamports(5), SOL_84);
    expect(r.feeBps).toBe(75);
  });

  it("0.75% for 10 SOL", () => {
    const r = calculateFeeBps("entertainment", solToLamports(10), SOL_84);
    expect(r.feeBps).toBe(75);
  });
});

describe("calculateFeeBps — USD floor", () => {
  it("floor bumps bps when feasible", () => {
    // 1 SOL at $5/SOL: pot=2 SOL, 1% fee = 0.02 SOL = $0.10 < $0.20
    // Needed: $0.20 / (2 * 5) * 10000 = 200 bps (2%) — within 5% cap
    const r = calculateFeeBps("news", solToLamports(1), 5);
    expect(r.feeBps).toBe(200);
    expect(r.stakeTooLow).toBe(false);
  });

  it("stakeTooLow when floor would exceed 5% for micro stakes at low SOL", () => {
    // 0.05 SOL at $30/SOL: pot=0.1 SOL, needed = $0.20/(0.1*30) = 667 bps > 5%
    const r = calculateFeeBps("news", solToLamports(0.05), SOL_30);
    expect(r.stakeTooLow).toBe(true);
  });

  it("floor does NOT apply when fee >= $0.20", () => {
    // 0.25 SOL at $84/SOL: pot=0.5 SOL, 2% fee = 0.01 SOL = $0.84 > $0.20
    const r = calculateFeeBps("news", solToLamports(0.25), SOL_84);
    expect(r.feeBps).toBe(200);
  });

  it("floor does NOT apply to crypto", () => {
    const r = calculateFeeBps("crypto", solToLamports(0.01), SOL_30);
    expect(r.feeBps).toBe(100);
  });

  it("stakeTooLow when floor would exceed 5%", () => {
    // At extremely low SOL price, even 5% can't reach $0.20
    // 0.01 SOL at $1/SOL: pot=0.02 SOL, need $0.20 → 10000 bps (100%) > 5%
    const r = calculateFeeBps("news", solToLamports(0.01), 1);
    expect(r.stakeTooLow).toBe(true);
    expect(r.minStakeLamports).toBeDefined();
    expect(r.minStakeLamports!).toBeGreaterThan(solToLamports(0.01));
  });

  it("does not flag stakeTooLow for reasonable prices", () => {
    const r = calculateFeeBps("news", solToLamports(0.05), SOL_84);
    expect(r.stakeTooLow).toBe(false);
  });
});

describe("calculateFeeBps — boundary cases", () => {
  it("exactly 0.25 SOL is 2%, not 3%", () => {
    expect(calculateFeeBps("news", solToLamports(0.25), SOL_84).feeBps).toBe(200);
  });

  it("just under 0.25 SOL is 3%", () => {
    expect(calculateFeeBps("news", solToLamports(0.249), SOL_84).feeBps).toBe(300);
  });

  it("exactly 1 SOL is 1%, not 2%", () => {
    expect(calculateFeeBps("news", solToLamports(1), SOL_84).feeBps).toBe(100);
  });

  it("just under 1 SOL is 2%", () => {
    expect(calculateFeeBps("news", solToLamports(0.999), SOL_84).feeBps).toBe(200);
  });

  it("exactly 5 SOL is 0.75%, not 1%", () => {
    expect(calculateFeeBps("news", solToLamports(5), SOL_84).feeBps).toBe(75);
  });

  it("just under 5 SOL is 1%", () => {
    expect(calculateFeeBps("news", solToLamports(4.999), SOL_84).feeBps).toBe(100);
  });

  it("null SOL price skips floor check", () => {
    const r = calculateFeeBps("news", solToLamports(0.01), null);
    expect(r.feeBps).toBe(300);
    expect(r.stakeTooLow).toBe(false);
  });
});

describe("calculateFeeBps — VIP", () => {
  it("VIP always gets 0.5% regardless of stake or category", () => {
    const r = calculateFeeBps("news", solToLamports(0.05), SOL_84, true);
    expect(r.feeBps).toBe(50);
    expect(r.feePercent).toBe(0.5);
    expect(r.isVip).toBe(true);
  });

  it("VIP crypto also 0.5%", () => {
    const r = calculateFeeBps("crypto", solToLamports(1), SOL_84, true);
    expect(r.feeBps).toBe(50);
    expect(r.isVip).toBe(true);
  });

  it("VIP skips USD floor", () => {
    const r = calculateFeeBps("news", solToLamports(0.01), 1, true);
    expect(r.feeBps).toBe(50);
    expect(r.stakeTooLow).toBe(false);
  });

  it("non-VIP at same stake gets standard tier", () => {
    const r = calculateFeeBps("news", solToLamports(0.05), SOL_84, false);
    expect(r.feeBps).toBe(300);
    expect(r.isVip).toBe(false);
  });
});
