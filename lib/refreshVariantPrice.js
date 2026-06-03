import { getPublicApiBaseUrl } from './publicEnv';
import { formatGwebWeightDisplay, upsertVariantGwebWeightMetafield } from './gwebWeightMetafield';
import { getShopifyToken } from './shopify';
import { findShopifyProduct } from './shopifyProductLookup';

const DEFAULT_THROTTLE_MS = 5000;
const throttleMap = new Map();

function getThrottleMs() {
  const raw = process.env.SHOPIFY_REFRESH_PRICE_THROTTLE_MS;
  const n = raw != null && raw !== '' ? Number(raw) : DEFAULT_THROTTLE_MS;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THROTTLE_MS;
}

function isThrottledPut(sku, suffix = '') {
  const key = suffix ? `${sku}:${suffix}` : sku;
  const lastPut = throttleMap.get(key);
  return lastPut != null && Date.now() - lastPut < getThrottleMs();
}

function markPut(sku, suffix = '') {
  const key = suffix ? `${sku}:${suffix}` : sku;
  throttleMap.set(key, Date.now());
}

async function fetchFn6ByMco(sku) {
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

async function putShopifyVariantPrice(domain, token, variantId, priceStr) {
  const res = await fetch(
    `https://${domain}/admin/api/2024-10/variants/${variantId}.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        variant: {
          id: Number(variantId),
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
}

/**
 * Fetch GWEB FN6 by MCO/SKU; sync Shopify variant price and custom.gweb_weight metafield.
 * @param {string} sku
 * @returns {Promise<{ found: boolean, price?: string, currency?: string, updated?: boolean, weight?: string|null, weightUpdated?: boolean }>}
 */
export async function refreshVariantPrice(sku) {
  const { item, normalizedSku } = await fetchFn6ByMco(sku);
  if (!item) {
    return { found: false };
  }

  const rawPrice = item?.price;
  const hasPrice = rawPrice != null && rawPrice !== '';
  const weightStr = formatGwebWeightDisplay(item?.go_cr);
  if (!hasPrice && !weightStr) {
    return { found: false };
  }

  const { token, domain } = await getShopifyToken();
  const shopify = await findShopifyProduct(domain, token, { sku: normalizedSku });

  if (!shopify.found || !shopify.variantId) {
    return { found: false };
  }

  let priceStr = null;
  let priceUpdated = false;

  if (hasPrice) {
    const rounded = Math.round(Number(rawPrice) / 5) * 5;
    priceStr = String(rounded);
    const currentPrice = shopify.price != null && shopify.price !== ''
      ? String(Number(shopify.price).toFixed(2))
      : null;

    if (currentPrice !== priceStr && !isThrottledPut(normalizedSku, 'price')) {
      await putShopifyVariantPrice(domain, token, shopify.variantId, priceStr);
      markPut(normalizedSku, 'price');
      priceUpdated = true;
    }
  }

  let weightUpdated = false;
  if (weightStr && !isThrottledPut(normalizedSku, 'weight')) {
    const result = await upsertVariantGwebWeightMetafield(
      domain,
      token,
      shopify.variantId,
      weightStr,
    );
    if (result.updated) {
      markPut(normalizedSku, 'weight');
      weightUpdated = true;
    }
  }

  return {
    found: true,
    ...(priceStr != null ? { price: priceStr, currency: 'EGP', updated: priceUpdated } : {}),
    ...(weightStr != null ? { weight: weightStr, weightUpdated } : {}),
  };
}
