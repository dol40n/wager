export interface PriceSnapshot {
  source: string;
  symbol: string;
  snapshot_time_utc: string;
  snapshot_price: number;
}

const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
};

// Short-lived cache to dedupe burst fetches (e.g. many crypto bets resolving in one cron run).
// 15s TTL — crypto price movement over 15s is negligible for snapshot purposes.
const PRICE_CACHE_TTL_MS = 15_000;
const priceCache = new Map<string, { snapshot: PriceSnapshot; expiresAt: number }>();

// fresh=true bypasses cache — used at bet creation where the snapshot must
// reflect the exact creation moment. Resolution uses the cache to dedupe
// burst fetches and keep same-deadline bets consistent.
export async function fetchBinancePrice(
  symbol: string = "BTCUSDT",
  fresh = false
): Promise<PriceSnapshot> {
  if (!fresh) {
    const cached = priceCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }
  }
  const snapshot = await fetchPriceUncached(symbol);
  priceCache.set(symbol, { snapshot, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
  return snapshot;
}

async function fetchPriceUncached(symbol: string): Promise<PriceSnapshot> {
  // Try Binance first
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      return {
        source: "Binance API",
        symbol,
        snapshot_time_utc: new Date().toISOString(),
        snapshot_price: parseFloat(data.price),
      };
    }
  } catch {
    // Binance blocked (US datacenter) — fall through to CoinGecko
  }

  // Fallback: CoinGecko
  const geckoId = COINGECKO_IDS[symbol];
  if (!geckoId) {
    throw new Error(`No CoinGecko mapping for ${symbol}`);
  }

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }
  const data = await res.json();
  const price = data[geckoId]?.usd;
  if (!price) {
    throw new Error(`No price data from CoinGecko for ${geckoId}`);
  }

  return {
    source: "CoinGecko API",
    symbol,
    snapshot_time_utc: new Date().toISOString(),
    snapshot_price: price,
  };
}
