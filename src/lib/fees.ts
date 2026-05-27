import { lamportsToSol } from "./utils";

const NON_CRYPTO_USD_FLOOR = 0.20;
const MAX_EFFECTIVE_FEE_PCT = 5;

interface FeeResult {
  feeBps: number;
  feePercent: number;
  stakeTooLow: boolean;
  minStakeLamports?: number;
}

export function calculateFeeBps(
  category: string,
  stakeLamports: number,
  solPriceUsd: number | null,
): FeeResult {
  const stakeSol = lamportsToSol(stakeLamports);
  const isCrypto = category === "crypto";

  let bps: number;

  if (isCrypto) {
    if (stakeSol >= 5) {
      bps = 75;
    } else {
      bps = 100;
    }
  } else {
    if (stakeSol >= 5) {
      bps = 75;
    } else if (stakeSol >= 1) {
      bps = 100;
    } else if (stakeSol >= 0.25) {
      bps = 200;
    } else {
      bps = 300;
    }
  }

  // USD floor for non-crypto: ensure fee >= $0.20
  if (!isCrypto && solPriceUsd && solPriceUsd > 0) {
    const potSol = stakeSol * 2;
    const feeUsd = (bps / 10000) * potSol * solPriceUsd;

    if (feeUsd < NON_CRYPTO_USD_FLOOR) {
      // Calculate bps needed to hit floor
      const neededBps = Math.ceil((NON_CRYPTO_USD_FLOOR / (potSol * solPriceUsd)) * 10000);

      // If needed bps would make effective fee > 5%, reject the stake
      if (neededBps / 100 > MAX_EFFECTIVE_FEE_PCT) {
        const minPotUsd = NON_CRYPTO_USD_FLOOR / (MAX_EFFECTIVE_FEE_PCT / 100);
        const minStakeSol = minPotUsd / solPriceUsd / 2;
        const minStakeLamports = Math.ceil(minStakeSol * 1_000_000_000);
        return {
          feeBps: bps,
          feePercent: bps / 100,
          stakeTooLow: true,
          minStakeLamports,
        };
      }

      bps = neededBps;
    }
  }

  return {
    feeBps: bps,
    feePercent: bps / 100,
    stakeTooLow: false,
  };
}

export async function getSolPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.solana?.usd ?? null;
  } catch {
    return null;
  }
}
