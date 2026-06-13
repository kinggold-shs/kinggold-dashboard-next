import { getPublicApiBaseUrl } from './publicEnv';

/** Server-side FN6/GWEB lookup (no auth token — public read endpoint). */
export async function fetchFn6ByMco(sku) {
  const normalizedSku = String(sku || '').trim();
  if (!normalizedSku) return { item: null, normalizedSku };

  const base = getPublicApiBaseUrl();
  const fn6Res = await fetch(
    `${base}/Sup/api/fn6/by-mco/${encodeURIComponent(normalizedSku)}/`,
  );

  if (fn6Res.status === 404) {
    return { item: null, normalizedSku };
  }

  if (!fn6Res.ok) {
    const text = await fn6Res.text().catch(() => '');
    throw new Error(`FN6 fetch failed: ${fn6Res.status}${text ? ` ${text}` : ''}`);
  }

  const item = await fn6Res.json();
  return { item, normalizedSku };
}

export function roundedFn6Price(item) {
  if (!item || item.price == null || item.price === '') return null;
  const rounded = Math.round(Number(item.price) / 5) * 5;
  return Number.isFinite(rounded) ? String(rounded) : null;
}
