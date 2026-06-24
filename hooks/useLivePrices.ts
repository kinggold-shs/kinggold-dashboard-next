import { useQuery } from '@tanstack/react-query';

interface LivePriceEntry {
  found: boolean;
  price?: string | number;
  weight?: string | null;
  gold_18?: number | null;
  prc?: number;
  prcus?: number;
  error?: string;
}

interface LivePricesResponse {
  prices: Record<string, LivePriceEntry>;
  count: number;
}

async function fetchLivePrices(skus: string[]): Promise<LivePricesResponse> {
  const res = await fetch(
    `/api/shopify/live-prices?skus=${encodeURIComponent(skus.join(','))}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useLivePrices(skus: string[], enabled = true) {
  return useQuery({
    queryKey: ['live-prices', skus.join(',')],
    queryFn: () => fetchLivePrices(skus),
    enabled: enabled && skus.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
