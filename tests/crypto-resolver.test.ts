import { describe, it, expect } from "vitest";

// Test the target-price extraction and comparison logic without calling external APIs
// by exercising the same regex and logic used in resolveCryptoPriceComparison

function extractTargetPrice(yesDefinition: string): number | null {
  const match = yesDefinition.match(/\$[\s]*([\d,]+(?:\.\d+)?)/);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

function detectDirection(yesDef: string): { above: boolean; below: boolean } {
  const lower = yesDef.toLowerCase();
  return {
    above:
      lower.includes("above") ||
      lower.includes("higher") ||
      lower.includes("выше") ||
      lower.includes("больше"),
    below:
      lower.includes("below") ||
      lower.includes("lower") ||
      lower.includes("ниже") ||
      lower.includes("меньше"),
  };
}

function resolveTargetPrice(
  currentPrice: number,
  targetPrice: number,
  direction: { above: boolean; below: boolean },
): "YES" | "NO" {
  if (currentPrice === targetPrice) return "NO";
  if (direction.above) return currentPrice > targetPrice ? "YES" : "NO";
  if (direction.below) return currentPrice < targetPrice ? "YES" : "NO";
  return currentPrice > targetPrice ? "YES" : "NO";
}

function resolveDirectional(
  startPrice: number,
  currentPrice: number,
  direction: { above: boolean; below: boolean },
): "YES" | "NO" {
  if (currentPrice === startPrice) {
    return direction.above || (!direction.below && !direction.above) ? "NO" : "YES";
  }
  const priceUp = currentPrice > startPrice;
  if (direction.above || (!direction.below && !direction.above)) {
    return priceUp ? "YES" : "NO";
  }
  return priceUp ? "NO" : "YES";
}

describe("crypto target-price extraction", () => {
  it("extracts $110,000", () => {
    expect(extractTargetPrice("BTC > $110,000 per CoinGecko")).toBe(110000);
  });

  it("extracts $4,000.50", () => {
    expect(extractTargetPrice("ETH above $4,000.50 by deadline")).toBe(4000.5);
  });

  it("extracts $100000 (no comma)", () => {
    expect(extractTargetPrice("BTC price exceeds $100000")).toBe(100000);
  });

  it("returns null when no dollar sign", () => {
    expect(extractTargetPrice("BTC price is higher than at creation")).toBeNull();
  });

  it("extracts first match from multiple", () => {
    expect(extractTargetPrice("BTC above $110,000 or $120,000")).toBe(110000);
  });

  it("extracts $0.50 (sub-dollar)", () => {
    expect(extractTargetPrice("DOGE above $0.50")).toBe(0.5);
  });
});

describe("direction detection", () => {
  it("detects above/higher", () => {
    expect(detectDirection("BTC price above $100k")).toEqual({ above: true, below: false });
    expect(detectDirection("BTC price higher than X")).toEqual({ above: true, below: false });
    expect(detectDirection("BTC выше $100k")).toEqual({ above: true, below: false });
  });

  it("detects below/lower", () => {
    expect(detectDirection("BTC price below $100k")).toEqual({ above: false, below: true });
    expect(detectDirection("BTC price lower than X")).toEqual({ above: false, below: true });
    expect(detectDirection("BTC ниже $100k")).toEqual({ above: false, below: true });
  });

  it("detects neither", () => {
    expect(detectDirection("BTC price exactly $100k")).toEqual({ above: false, below: false });
  });
});

describe("target-price resolution", () => {
  const above = { above: true, below: false };
  const below = { above: false, below: true };

  it("above $110k: current $115k → YES", () => {
    expect(resolveTargetPrice(115000, 110000, above)).toBe("YES");
  });

  it("above $110k: current $105k → NO", () => {
    expect(resolveTargetPrice(105000, 110000, above)).toBe("NO");
  });

  it("above $110k: current exactly $110k → NO (strict)", () => {
    expect(resolveTargetPrice(110000, 110000, above)).toBe("NO");
  });

  it("below $100k: current $95k → YES", () => {
    expect(resolveTargetPrice(95000, 100000, below)).toBe("YES");
  });

  it("below $100k: current $105k → NO", () => {
    expect(resolveTargetPrice(105000, 100000, below)).toBe("NO");
  });

  it("below $100k: current exactly $100k → NO (strict)", () => {
    expect(resolveTargetPrice(100000, 100000, below)).toBe("NO");
  });
});

describe("directional resolution (snapshot vs current)", () => {
  const above = { above: true, below: false };
  const below = { above: false, below: true };
  const neither = { above: false, below: false };

  it("yes=higher: price went up → YES", () => {
    expect(resolveDirectional(100, 110, above)).toBe("YES");
  });

  it("yes=higher: price went down → NO", () => {
    expect(resolveDirectional(100, 90, above)).toBe("NO");
  });

  it("yes=higher: same price → NO", () => {
    expect(resolveDirectional(100, 100, above)).toBe("NO");
  });

  it("yes=lower: price went down → YES", () => {
    expect(resolveDirectional(100, 90, below)).toBe("YES");
  });

  it("yes=lower: price went up → NO", () => {
    expect(resolveDirectional(100, 110, below)).toBe("NO");
  });

  it("yes=lower: same price → YES", () => {
    expect(resolveDirectional(100, 100, below)).toBe("YES");
  });

  it("no direction keyword: defaults to above behavior", () => {
    expect(resolveDirectional(100, 110, neither)).toBe("YES");
    expect(resolveDirectional(100, 90, neither)).toBe("NO");
    expect(resolveDirectional(100, 100, neither)).toBe("NO");
  });
});
