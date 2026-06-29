import { getPublicApiBaseUrl } from './publicEnv';

function normalizePositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

export async function fetchGoldRateSnapshot() {
  const base = getPublicApiBaseUrl();
  const res = await fetch(`${base}/Sup/api/gold-rate/`, { cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gold-rate fetch failed: ${res.status}${text ? ` ${text}` : ''}`);
  }

  const data = await res.json();
  const pr18 = normalizePositiveNumber(data.pr18);
  const pr21 = normalizePositiveNumber(data.pr21);
  const usdRate = Number(data.dollar) || 1;

  if (!pr18) {
    throw new Error('Invalid 18K gold price from Gweb');
  }
  if (!pr21) {
    throw new Error('Invalid 21K gold price from Gweb');
  }

  return {
    pr18,
    pr21,
    usd_rate: usdRate,
    updated_at: data.updated_at || new Date().toISOString(),
  };
}
