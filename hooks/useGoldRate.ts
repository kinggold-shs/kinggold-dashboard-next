import { useQuery } from '@tanstack/react-query';
import { getPublicApiBaseUrl } from '../lib/publicEnv';

export interface GoldRate {
  pr18: number;
  pr21: number;
  pr24: number;
  dollar: number;
  updated_at: string;
}

async function fetchGoldRate(): Promise<GoldRate> {
  const base = getPublicApiBaseUrl();
  const res = await fetch(`${base}/Sup/api/gold-rate/`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    pr18: Number(data.pr18),
    pr21: Number(data.pr21),
    pr24: Number(data.pr24),
    dollar: Number(data.dollar),
    updated_at: data.updated_at,
  };
}

export function useGoldRate() {
  return useQuery({
    queryKey: ['gold-rate'],
    queryFn: fetchGoldRate,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 2,
  });
}

export function computeLivePrice(
  goldRate: GoldRate | undefined,
  weight: number | string | null,
  prc: number | string | null,
  prcus: number | string | null,
): number | null {
  if (!goldRate || !goldRate.pr18 || goldRate.pr18 <= 0) return null;
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return null;
  const p = Number(prc) || 0;
  const pu = Number(prcus) || 0;
  const rate = goldRate.dollar > 0 ? goldRate.dollar : 1;
  let total;
  if (pu > 0) {
    const totus = (pu + goldRate.pr18 / rate) * w;
    total = totus * rate;
  } else if (p > 0) {
    total = (p + goldRate.pr18) * w;
  } else {
    total = goldRate.pr18 * w;
  }
  const rounded = Math.sign(total) * Math.floor(Math.abs(total) + 0.5);
  return Math.round(rounded / 5) * 5;
}
