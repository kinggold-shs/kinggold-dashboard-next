import { getPublicApiBaseUrl } from './publicEnv';
import { getShopifyToken } from './shopify';
import { findShopifyProduct } from './shopifyProductLookup';

const DEFAULT_THROTTLE_MS = 5000;
const throttleMap = new Map();

function getThrottleMs() {
  const raw = process.env.SHOPIFY_REFRESH_PRICE_THROTTLE_MS;
  const n = raw != null && raw !== '' ? Number(raw) : DEFAULT_THROTTLE_MS;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THROTTLE_MS;
}

/**
 * Fetch GWEB FN6 price by MCO/SKU, sync Shopify variant when price differs.
 * @param {string} sku
 * @returns {Promise<{ found: boolean, price?: string, currency?: string, updated?: boolean }>}
 */
export async function refreshVariantPrice(sku) {
  const normalizedSku = String(sku || '').trim();
  if (!normalizedSku) {
    return { found: false };
  }

  const base = getPublicApiBaseUrl();
  const fn6Res = await fetch(
    `${base}/Sup/api/fn6/by-mco/${encodeURIComponent(normalizedSku)}/`,
  );

  if (fn6Res.status === 404) {
    return { found: false };
  }

  if (!fn6Res.ok) {
    const text = await fn6Res.text().catch(() => '');
    throw new Error(`FN6 fetch failed: ${fn6Res.status}${text ? ` ${text}` : ''}`);
  }

  const item = await fn6Res.json();
  const rawPrice = item?.price;
  if (rawPrice == null || rawPrice === '') {
    return { found: false };
  }

  const priceStr = String(Number(rawPrice).toFixed(2));
  const { token, domain } = await getShopifyToken();
  const shopify = await findShopifyProduct(domain, token, { sku: normalizedSku });

  if (!shopify.found || !shopify.variantId) {
    return { found: false };
  }

  const currentPrice = shopify.price != null && shopify.price !== ''
    ? String(Number(shopify.price).toFixed(2))
    : null;

  if (currentPrice === priceStr) {
    return { found: true, price: priceStr, currency: 'EGP', updated: false };
  }

  const throttleMs = getThrottleMs();
  const now = Date.now();
  const lastPut = throttleMap.get(normalizedSku);
  if (lastPut != null && now - lastPut < throttleMs) {
    return { found: true, price: priceStr, currency: 'EGP', updated: false };
  }

  const res = await fetch(
    `https://${domain}/admin/api/2024-10/variants/${shopify.variantId}.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        variant: {
          id: Number(shopify.variantId),
          price: priceStr,
        },
      }),
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data.errors === 'object'
      ? JSON.stringify(data.errors)
      : (data.errors || 'Shopify API error');
    throw new Error(errMsg);
  }

  throttleMap.set(normalizedSku, now);
  return { found: true, price: priceStr, currency: 'EGP', updated: true };
}
