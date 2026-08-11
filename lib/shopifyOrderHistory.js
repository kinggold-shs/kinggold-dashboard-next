import { fetchGoldRateSnapshotAt } from './goldRates';
import { fetchFn6ByMco } from './fn6Server';

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

  // Prefer the snapshot's items (written by the orders/paid webhook), but fall
  // back to the order's live line items — a pending order has no snapshot yet,
  // and we still need to show the owner what was actually ordered.
  const liveItems = (node?.lineItems?.nodes || []).map((li) => ({
    id: li?.id || null,
    sku: li?.sku || null,
    title: li?.title || null,
    variant_title: li?.variantTitle || null,
    quantity: Number(li?.quantity) || 0,
    price: parseMoney(li?.originalUnitPriceSet?.shopMoney?.amount),
  }));
  const items = Array.isArray(snapshot.items) && snapshot.items.length > 0
    ? snapshot.items
    : liveItems;

  return {
    id: node?.id || null,
    shopify_order_id: node?.legacyResourceId ? String(node.legacyResourceId) : null,
    order_name: node?.name || snapshot.order_name || null,
    financial_status: node?.displayFinancialStatus || snapshot.financial_status || null,
    fulfillment_status: node?.displayFulfillmentStatus || null,
    cancelled_at: node?.cancelledAt || null,
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

/**
 * Escape a user-typed term for a Shopify search literal.
 *
 * Backslashes first, then the double quotes that delimit the literal — reversing
 * the order would double-escape the backslashes inserted for the quotes.
 */
function escapeSearchLiteral(term) {
  return String(term).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Search clause for the Shopify order query.
 *
 * This has to run server-side. Searching in JS over the fetched window meant an
 * order was only findable if it happened to fall inside the most recent `take`
 * orders *of the tab you were on* — so an older paid order showed under Paid
 * (where the window only holds paid orders, and so reaches much further back)
 * but not under All. Same order, same term, different tab.
 *
 * `name` is listed twice because the owner types order numbers both ways —
 * `1234` and `#1234`. The trailing bare literal keeps Shopify's own default
 * order search (customer, address, phone, note) working.
 */
function buildSearchClause(search) {
  const term = String(search || '').trim();
  if (!term) return '';

  const escaped = escapeSearchLiteral(term);
  const clauses = [
    `name:"${escaped}"`,
    `name:"#${escapeSearchLiteral(term.replace(/^#/, ''))}"`,
    `email:"${escaped}"`,
    `sku:"${escaped}"`,
    `"${escaped}"`,
  ];
  return `(${clauses.join(' OR ')})`;
}

function buildOrdersQuery({ from = '', to = '', status = 'all', search = '' } = {}) {
  const parts = [];
  // 'all' applies no financial-status filter at all — every order shows, so the
  // order numbers run consecutively with no gaps. Anything else would silently
  // hide the statuses we didn't think to list (authorised, partially paid,
  // refunded, expired…).
  if (status === 'pending') {
    // Orders the customer placed but Shopify hasn't seen money for yet (bank
    // transfer, cash direct to the owner). These never reach the orders/paid
    // webhook, so without this they're invisible to the dashboard entirely.
    // Exclude cancelled ones — a declined order is done, not still awaiting a
    // decision, and it belongs under Voided.
    parts.push('financial_status:pending AND -status:cancelled');
  } else if (status === 'voided') {
    // Declining a pending order cancels it. Depending on whether a payment was
    // ever authorised, Shopify may mark it VOIDED or just cancel it — match
    // both, otherwise declined orders would vanish from the dashboard.
    parts.push('(financial_status:voided OR status:cancelled)');
  } else if (status === 'paid') {
    parts.push('financial_status:paid');
  } else if (status === 'partially_refunded') {
    // A paid order with part of the money sent back. Shopify moves it out of
    // PAID into its own status, so it shows under neither Paid nor Voided —
    // without this tab there's no way to see these orders at all.
    parts.push('financial_status:partially_refunded');
  }
  if (from) parts.push(`processed_at:>=${from}`);
  if (to) parts.push(`processed_at:<=${to}`);
  const searchClause = buildSearchClause(search);
  if (searchClause) parts.push(searchClause);
  return parts.join(' ');
}

/**
 * Fill in the gold rates for orders that have no snapshot metafield.
 *
 * The snapshot is written by the orders/paid webhook, so a pending or voided
 * order never has one — but we still want to show the same columns (18K, 21K,
 * USD rate) as a paid order. We know when the order was placed, so look up the
 * rate that was actually live at that moment.
 */
async function enrichMissingGoldRates(rows) {
  const needing = rows.filter(
    (row) => row.gold_price_18k == null && (row.purchased_at || row.created_at),
  );
  if (needing.length === 0) return rows;

  await Promise.all(needing.map(async (row) => {
    try {
      const rates = await fetchGoldRateSnapshotAt(row.purchased_at || row.created_at);
      row.gold_price_18k = rates.pr18;
      row.gold_price_21k = rates.pr21;
      row.usd_rate = rates.usd_rate;
      // Flag it so the UI can be honest: this is the rate that was live when the
      // order was placed, not a snapshot recorded at payment.
      row.rates_derived = true;
    } catch {
      // Non-fatal — the order still lists, just without rates.
    }
  }));

  return rows;
}

/**
 * Making charge per line item.
 *
 * A Shopify line item only carries SKU / title / qty / price — the making
 * charge lives in GWEB, and the paid snapshot doesn't copy it either. So look
 * each SKU up by mco. Cached because the same code recurs across orders and
 * pages, and these numbers only change when the item is re-costed.
 *
 * Pull مصنعيه الجرام (tot_pg / totus_pg) and its total (tot_cr / totus_cr)
 * along with the weight, not just سعر البيـع (prc / prcus). Those are three
 * different numbers — see lib/fn6ItemFields.js.
 */
const MFG_CACHE_TTL_MS = 5 * 60 * 1000;
const MFG_LOOKUP_CONCURRENCY = 8;
const mfgCache = new Map(); // sku -> { at, value: {…charges, go_cr} | null }

const toNum = (v) => (v != null && v !== '' ? Number(v) : null);

async function lookupMfgBySku(sku) {
  const cached = mfgCache.get(sku);
  if (cached && Date.now() - cached.at < MFG_CACHE_TTL_MS) return cached.value;

  let value = null;
  try {
    const { item } = await fetchFn6ByMco(sku);
    if (item) {
      value = {
        tot_pg: toNum(item.tot_pg),
        totus_pg: toNum(item.totus_pg),
        tot_cr: toNum(item.tot_cr),
        totus_cr: toNum(item.totus_cr),
        prc: toNum(item.prc),
        prcus: toNum(item.prcus),
        go_cr: toNum(item.go_cr),
      };
    }
  } catch {
    // Non-fatal — the order still lists, the line just shows a dash.
  }

  mfgCache.set(sku, { at: Date.now(), value });
  return value;
}

async function enrichItemsWithMfgPerGram(rows) {
  const skus = [...new Set(
    rows.flatMap((row) => (Array.isArray(row.items) ? row.items : []))
      .map((item) => (item?.sku ? String(item.sku).trim() : ''))
      .filter(Boolean),
  )];
  if (skus.length === 0) return rows;

  const resolved = new Map();
  for (let i = 0; i < skus.length; i += MFG_LOOKUP_CONCURRENCY) {
    const batch = skus.slice(i, i + MFG_LOOKUP_CONCURRENCY);
    const values = await Promise.all(batch.map(lookupMfgBySku));
    batch.forEach((sku, idx) => resolved.set(sku, values[idx]));
  }

  for (const row of rows) {
    if (!Array.isArray(row.items)) continue;
    row.items = row.items.map((item) => {
      const mfg = item?.sku ? resolved.get(String(item.sku).trim()) : null;
      if (!mfg) return item;
      // Field names kept identical to FN6 so the dashboard's shared
      // fn6ItemFields formatters render these the same as the scan page —
      // including go_cr, which formatFn6MfgTotal multiplies by.
      return { ...item, ...mfg, weight_g: mfg.go_cr };
    });
  }

  return rows;
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

export async function listShopifyPurchaseHistory(domain, token, { page = 1, pageSize = 25, search = '', from = '', to = '', status = 'all' } = {}) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const take = Math.min(250, Math.max(normalizedPage * normalizedPageSize * 2, 100));

  const query = `
    query OrdersByStatus($first: Int!, $query: String!) {
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true, query: $query) {
        nodes {
          id
          legacyResourceId
          name
          createdAt
          processedAt
          displayFinancialStatus
          displayFulfillmentStatus
          cancelledAt
          email
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          customer { firstName lastName email }
          lineItems(first: 50) {
            nodes {
              id
              sku
              title
              variantTitle
              quantity
              originalUnitPriceSet { shopMoney { amount } }
            }
          }
          snapshot: metafield(namespace: \"${SNAPSHOT_NAMESPACE}\", key: \"${SNAPSHOT_JSON_KEY}\") { value }
        }
      }
    }
  `;

  const runQuery = async (queryString) => shopifyFetchJson(
    `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: shopifyHeaders(token),
      body: JSON.stringify({
        query,
        variables: { first: take, query: queryString },
      }),
    },
  );

  // Shopify rejects some search strings outright. Rather than let a stray
  // character blank the whole page, drop back to the unsearched query and let
  // the JS filter below handle it — narrower, but it still lists orders.
  let searchedServerSide = Boolean(String(search || '').trim());
  let result;
  try {
    result = await runQuery(buildOrdersQuery({ from, to, status, search }));
  } catch (err) {
    if (!searchedServerSide) throw err;
    searchedServerSide = false;
    result = await runQuery(buildOrdersQuery({ from, to, status }));
  }

  const nodes = result?.data?.orders?.nodes || [];
  const mapped = nodes.map(mapOrderNode);

  // No order is ever dropped for missing gold rates. This used to filter out
  // any row without a snapshot metafield, which silently hid every order that
  // hadn't been through the orders/paid webhook — leaving gaps in the order
  // numbers. Instead, derive the rates that were live when the order was placed.
  await enrichMissingGoldRates(mapped);

  // Shopify already narrowed these. Re-filtering in JS would throw away the
  // matches it found on fields we don't carry here (shipping address, phone,
  // note), so only filter when the server-side search didn't run.
  const filtered = searchedServerSide ? mapped : filterRows(mapped, search);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const results = filtered.slice(offset, offset + normalizedPageSize);

  // Only the page being returned — enriching all 250 fetched orders would mean
  // hundreds of GWEB lookups for rows nobody is looking at.
  await enrichItemsWithMfgPerGram(results);

  return {
    count: filtered.length,
    page: normalizedPage,
    page_size: normalizedPageSize,
    results,
  };
}
