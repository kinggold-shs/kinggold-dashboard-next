/**
 * Look up the locked sold-price snapshot for a SKU by scanning recent paid
 * Shopify orders and reading the `custom.kg_paid_snapshot` metafield written
 * by the `orders/paid` webhook.
 *
 * Doubles as the "past sale record" check for the compound sold verdict
 * (`lib/soldDetection.js`): a non-null result means a prior confirmed sale
 * exists for this SKU.
 *
 * Iterates up to 50 most recent paid orders (newest first) and returns the
 * most recent matching line item.
 */

const API_VERSION = '2024-10';
const SNAPSHOT_NAMESPACE = 'custom';
const SNAPSHOT_JSON_KEY = 'kg_paid_snapshot';
const MAX_ORDERS_TO_SCAN = 50;
const ORDERS_QUERY_STRING = 'financial_status:paid';

function shopifyHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
  };
}

async function shopifyFetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.errors
      ? JSON.stringify(data.errors)
      : text || `HTTP ${res.status}`;
    throw new Error(`Shopify request failed: ${res.status} ${message}`);
  }
  return data;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseMoney(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function findSnapshotLineForSku(snapshot, sku) {
  const needle = String(sku || '').trim();
  if (!needle) return null;
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  for (const item of items) {
    if (String(item?.sku || '').trim() === needle) {
      return item;
    }
  }
  return null;
}

/**
 * Find the most recent paid order that contains `sku` in its `kg_paid_snapshot`
 * items[], and return the snapshot fields captured at sale time.
 *
 * @param {string} domain
 * @param {string} token
 * @param {string} sku
 * @returns {Promise<
 *   { found: true, soldPrice: number|null, currency: string|null, goldPrice18k: number|null, goldPrice21k: number|null, usdRate: number|null, orderName: string|null, orderId: string|null, purchasedAt: string|null }
 *   | { found: false, error?: string }
 * >}
 */
export async function getSoldPriceForSku(domain, token, sku) {
  const normalizedSku = String(sku || '').trim();
  if (!normalizedSku) return { found: false, error: 'empty sku' };

  const query = `
    query PaidOrders($first: Int!, $query: String!) {
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true, query: $query) {
        nodes {
          id
          legacyResourceId
          name
          createdAt
          processedAt
          displayFinancialStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          snapshot: metafield(namespace: "${SNAPSHOT_NAMESPACE}", key: "${SNAPSHOT_JSON_KEY}") { value }
        }
      }
    }
  `;

  let result;
  try {
    result = await shopifyFetchJson(
      `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: shopifyHeaders(token),
        body: JSON.stringify({
          query,
          variables: {
            first: MAX_ORDERS_TO_SCAN,
            query: ORDERS_QUERY_STRING,
          },
        }),
      },
    );
  } catch (err) {
    return { found: false, error: err?.message || 'orders query failed' };
  }

  const nodes = result?.data?.orders?.nodes || [];
  for (const node of nodes) {
    const snapshot = safeJsonParse(node?.snapshot?.value, null) || {};
    const match = findSnapshotLineForSku(snapshot, normalizedSku);
    if (!match) continue;

    const shopMoney = node?.currentTotalPriceSet?.shopMoney || {};
    const currency = shopMoney.currencyCode || snapshot.currency_code || 'EGP';
    const orderId = node?.legacyResourceId ? String(node.legacyResourceId) : null;

    return {
      found: true,
      soldPrice: parseMoney(match.price),
      currency,
      goldPrice18k: snapshot.gold_price_18k != null ? Number(snapshot.gold_price_18k) : null,
      goldPrice21k: snapshot.gold_price_21k != null ? Number(snapshot.gold_price_21k) : null,
      usdRate: snapshot.usd_rate != null ? Number(snapshot.usd_rate) : null,
      orderName: node?.name || snapshot.order_name || null,
      orderId,
      purchasedAt: node?.processedAt || snapshot.purchased_at || node?.createdAt || null,
    };
  }

  return { found: false };
}
