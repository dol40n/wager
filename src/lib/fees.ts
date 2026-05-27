import { lamportsToSol } from "./utils";

const NON_CRYPTO_USD_FLOOR = 0.20;
const MAX_EFFECTIVE_FEE_PCT = 5;
const VIP_FEE_BPS = 50; // 0.5%

interface FeeResult {
  feeBps: number;
  feePercent: number;
  stakeTooLow: boolean;
  isVip: boolean;
  minStakeLamports?: number;
}

export function calculateFeeBps(
  category: string,
  stakeLamports: number,
  solPriceUsd: number | null,
  isVip = false,
): FeeResult {
  const stakeSol = lamportsToSol(stakeLamports);
  const isCrypto = category === "crypto";

  if (isVip) {
    return { feeBps: VIP_FEE_BPS, feePercent: VIP_FEE_BPS / 100, stakeTooLow: false, isVip: true };
  }

  let bps: number;

  if (isCrypto) {
    bps = stakeSol >= 5 ? 75 : 100;
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
      const neededBps = Math.ceil((NON_CRYPTO_USD_FLOOR / (potSol * solPriceUsd)) * 10000);

      if (neededBps / 100 > MAX_EFFECTIVE_FEE_PCT) {
        const minPotUsd = NON_CRYPTO_USD_FLOOR / (MAX_EFFECTIVE_FEE_PCT / 100);
        const minStakeSol = minPotUsd / solPriceUsd / 2;
        const minStakeLamports = Math.ceil(minStakeSol * 1_000_000_000);
        return { feeBps: bps, feePercent: bps / 100, stakeTooLow: true, isVip: false, minStakeLamports };
      }

      bps = neededBps;
    }
  }

  return { feeBps: bps, feePercent: bps / 100, stakeTooLow: false, isVip: false };
}

export async function checkVipStatus(pubkey: string): Promise<boolean> {
  const { prisma } = await import("./db");
  const vip = await prisma.vipWallet.findUnique({ where: { pubkey } });
  return !!vip;
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
