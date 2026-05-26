export interface PriceSnapshot {
  source: string;
  symbol: string;
  snapshot_time_utc: string;
  snapshot_price: number;
}

export async function fetchBinancePrice(symbol: string = "BTCUSDT"): Promise<PriceSnapshot> {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`
  );
  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status}`);
  }
  const data = await res.json();
  return {
    source: "Binance API",
    symbol,
    snapshot_time_utc: new Date().toISOString(),
    snapshot_price: parseFloat(data.price),
  };
}
