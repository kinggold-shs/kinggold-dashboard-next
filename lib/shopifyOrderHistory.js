const API_VERSION = '2024-10';
const SNAPSHOT_NAMESPACE = 'custom';
const SNAPSHOT_JSON_KEY = 'kg_paid_snapshot';
const SNAPSHOT_18K_KEY = 'gold_18k_snapshot';
const SNAPSHOT_21K_KEY = 'gold_21k_snapshot';
const SNAPSHOT_USD_KEY = 'usd_rate_snapshot';
const SNAPSHOT_AT_KEY = 'snapshot_taken_at';

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

export async function upsertOrderSnapshotMetafields(domain, token, orderId, snapshot) {
  const base = `https://${domain}/admin/api/${API_VERSION}`;
  const existingRes = await shopifyFetchJson(
    `${base}/orders/${orderId}/metafields.json?namespace=${SNAPSHOT_NAMESPACE}`,
    { headers: shopifyHeaders(token), cache: 'no-store' },
  );

  const existing = Array.isArray(existingRes?.metafields) ? existingRes.metafields : [];
  const byKey = new Map(existing.map((mf) => [mf.key, mf]));

  const entries = [
    {
      key: SNAPSHOT_JSON_KEY,
      type: 'json',
      value: JSON.stringify(snapshot),
    },
    {
      key: SNAPSHOT_18K_KEY,
      type: 'number_decimal',
      value: String(snapshot.gold_price_18k ?? ''),
    },
    {
      key: SNAPSHOT_21K_KEY,
      type: 'number_decimal',
      value: String(snapshot.gold_price_21k ?? ''),
    },
    {
      key: SNAPSHOT_USD_KEY,
      type: 'number_decimal',
      value: String(snapshot.usd_rate ?? ''),
    },
    {
      key: SNAPSHOT_AT_KEY,
      type: 'date_time',
      value: String(snapshot.snapshot_taken_at || new Date().toISOString()),
    },
  ].filter((entry) => entry.value !== '');

  for (const entry of entries) {
    const existingMf = byKey.get(entry.key);
    if (existingMf?.id) {
      await shopifyFetchJson(`${base}/metafields/${existingMf.id}.json`, {
        method: 'PUT',
        headers: shopifyHeaders(token),
        body: JSON.stringify({
          metafield: {
            id: existingMf.id,
            value: entry.value,
            type: entry.type,
          },
        }),
      });
    } else {
      await shopifyFetchJson(`${base}/orders/${orderId}/metafields.json`, {
        method: 'POST',
        headers: shopifyHeaders(token),
        body: JSON.stringify({
          metafield: {
            namespace: SNAPSHOT_NAMESPACE,
            key: entry.key,
            type: entry.type,
            value: entry.value,
          },
        }),
      });
    }
  }

  return { ok: true, count: entries.length };
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseMoney(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapOrderNode(node) {
  const snapshot = safeJsonParse(node?.snapshot?.value, null) || {};
  const customerFirst = node?.customer?.firstName || '';
  const customerLast = node?.customer?.lastName || '';
  const customerName = `${customerFirst} ${customerLast}`.trim() || null;
  const amount = parseMoney(node?.currentTotalPriceSet?.shopMoney?.amount);
  const currency = node?.currentTotalPriceSet?.shopMoney?.currencyCode || snapshot.currency_code || 'EGP';
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];

  return {
    id: node?.id || null,
    shopify_order_id: node?.legacyResourceId ? String(node.legacyResourceId) : null,
    order_name: node?.name || snapshot.order_name || null,
    financial_status: node?.displayFinancialStatus || snapshot.financial_status || null,
    currency_code: currency,
    customer_name: customerName || snapshot.customer_name || null,
    customer_email: node?.email || node?.customer?.email || snapshot.customer_email || null,
    items,
    subtotal_amount: snapshot.subtotal_amount != null ? Number(snapshot.subtotal_amount) : null,
    total_amount: amount ?? (snapshot.total_amount != null ? Number(snapshot.total_amount) : null),
    total_tax: snapshot.total_tax != null ? Number(snapshot.total_tax) : null,
    gold_price_18k: snapshot.gold_price_18k != null ? Number(snapshot.gold_price_18k) : null,
    gold_price_21k: snapshot.gold_price_21k != null ? Number(snapshot.gold_price_21k) : null,
    usd_rate: snapshot.usd_rate != null ? Number(snapshot.usd_rate) : null,
    purchased_at: node?.processedAt || snapshot.purchased_at || node?.createdAt || null,
    webhook_received_at: snapshot.webhook_received_at || null,
    source_topic: snapshot.source_topic || null,
    raw_order: null,
    created_at: node?.createdAt || snapshot.created_at || null,
  };
}

function buildOrdersQuery({ from = '', to = '' } = {}) {
  const parts = ['financial_status:paid'];
  if (from) parts.push(`processed_at:>=${from}`);
  if (to) parts.push(`processed_at:<=${to}`);
  return parts.join(' ');
}

function filterRows(rows, search) {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) => {
    const haystacks = [
      row.shopify_order_id,
      row.order_name,
      row.customer_name,
      row.customer_email,
      ...(Array.isArray(row.items) ? row.items.flatMap((item) => [item?.sku, item?.title, item?.variant_title]) : []),
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return haystacks.some((value) => value.includes(needle));
  });
}

export async function listShopifyPurchaseHistory(domain, token, { page = 1, pageSize = 25, search = '', from = '', to = '' } = {}) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const take = Math.min(250, Math.max(normalizedPage * normalizedPageSize * 2, 100));

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
          email
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          customer { firstName lastName email }
          snapshot: metafield(namespace: \"${SNAPSHOT_NAMESPACE}\", key: \"${SNAPSHOT_JSON_KEY}\") { value }
        }
      }
    }
  `;

  const result = await shopifyFetchJson(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: shopifyHeaders(token),
    body: JSON.stringify({
      query,
      variables: {
        first: take,
        query: buildOrdersQuery({ from, to }),
      },
    }),
  });

  const nodes = result?.data?.orders?.nodes || [];
  const mapped = nodes
    .map(mapOrderNode)
    .filter((row) => row.gold_price_18k != null || row.gold_price_21k != null || row.usd_rate != null);
  const filtered = filterRows(mapped, search);
  const offset = (normalizedPage - 1) * normalizedPageSize;

  return {
    count: filtered.length,
    page: normalizedPage,
    page_size: normalizedPageSize,
    results: filtered.slice(offset, offset + normalizedPageSize),
  };
}
