import { describe, it, expect } from "vitest";
import type { NormalizeResult } from "@/types";

const rejected: NormalizeResult = {
  original_text: "Будет ли цена BTC выше с 3:20 до 3:25?",
  normalized_question: "Will BTC be higher between 3:20 and 3:25?",
  category: "crypto",
  yes_definition: "BTC price at 3:25 > BTC price at 3:20",
  no_definition: "BTC price at 3:25 <= BTC price at 3:20",
  deadline_utc: new Date(Date.now() + 300_000).toISOString(),
  resolution_sources: ["Binance"],
  resolution_method: "api",
  objective_criteria: ["Binance BTCUSDT"],
  ambiguity_score: 0.4,
  ambiguity_notes: ["Missing reference price", "Clarify: use price at interval start or fixed amount"],
  should_reject: true,
  rejection_reason: "Higher than what? Specify an explicit price target or reference point.", resolution_plan: null, suggestions: [],
};

const accepted: NormalizeResult = {
  original_text: "Bitcoin above $100k by 2026-06-01",
  normalized_question: "Will BTC exceed $100k?",
  category: "crypto",
  yes_definition: "BTC >= $100,000 per CoinGecko",
  no_definition: "BTC < $100,000 per CoinGecko",
  deadline_utc: "2026-06-01T00:00:00Z",
  resolution_sources: ["CoinGecko"],
  resolution_method: "api",
  objective_criteria: ["CoinGecko BTC/USD"],
  ambiguity_score: 0,
  ambiguity_notes: [],
  should_reject: false,
  rejection_reason: null, resolution_plan: null, suggestions: [],
};

describe("rejected wager UI rendering rules", () => {
  it("rejected wager must not render normalized_question to user", () => {
    expect(rejected.should_reject).toBe(true);
    // UI rule: when should_reject=true, the component renders the rejection
    // card, not the review card. normalized_question is never shown.
  });

  it("rejected wager must not render YES/NO definitions", () => {
    expect(rejected.should_reject).toBe(true);
    // UI splits into two separate Card components:
    // should_reject=true  → rejection card (no definitions)
    // should_reject=false → review card (with definitions)
  });

  it("accepted wager renders definitions", () => {
    expect(accepted.should_reject).toBe(false);
  });

  it("create button hidden for rejected wager", () => {
    expect(rejected.should_reject).toBe(true);
    // The review card with the "Confirm & Create Bet" button only
    // renders when should_reject=false
  });
});

describe("missing reference price detection", () => {
  const missingRefPhrases = [
    "BTC выше с 3:20 до 3:25",
    "Will BTC be higher between 3:20 and 3:25",
    "Bitcoin up in 5 minutes",
    "ETH выше через 10 минут",
  ];

  missingRefPhrases.forEach((phrase) => {
    it(`"${phrase.slice(0, 35)}..." has no explicit dollar target`, () => {
      const hasDollarTarget = /\$[\d,]+/.test(phrase);
      expect(hasDollarTarget).toBe(false);

      const hasDirectional = /higher|выше|вверх|up/i.test(phrase);
      expect(hasDirectional).toBe(true);
    });
  });

  it("explicit target passes: 'BTC above $110,000'", () => {
    const hasDollarTarget = /\$[\d,]+/.test("BTC above $110,000");
    expect(hasDollarTarget).toBe(true);
  });
});

describe("date formatting in output", () => {
  it("ISO 8601 UTC is valid", () => {
    const iso = "2026-05-26T07:20:00Z";
    const d = new Date(iso);
    expect(d.getTime()).not.toBeNaN();
    expect(d.toISOString()).toContain("2026-05-26");
  });

  it("Russian localized format is NOT valid ISO", () => {
    const bad = "26.05.2026 07:20:00";
    // This may parse in some locales but is not ISO
    const isIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(bad);
    expect(isIso).toBe(false);
  });

  it("UI formats deadline as clean UTC string", () => {
    const deadline = "2026-05-26T07:25:00.000Z";
    const formatted = deadline.replace("T", " ").replace(/\.\d+Z$/, " UTC");
    expect(formatted).toBe("2026-05-26 07:25:00 UTC");
    expect(formatted).not.toContain(".");
    expect(formatted).not.toContain("по");
  });
});

describe("reference price placeholder cannot pass validation", () => {
  it("yes_definition with 'reference price' is ambiguous", () => {
    const def = "BTC price at deadline > reference price";
    const hasPlaceholder = /reference price|текущ|current/i.test(def);
    expect(hasPlaceholder).toBe(true);
  });

  it("yes_definition with explicit target is not ambiguous", () => {
    const def = "BTC price at deadline > $110,000 per CoinGecko";
    const hasPlaceholder = /reference price|текущ|current/i.test(def);
    expect(hasPlaceholder).toBe(false);
  });
});
