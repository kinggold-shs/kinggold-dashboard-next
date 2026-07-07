import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { fetchFn6ByMco } from '../../../../lib/fn6Server';
import { fetchCodeChainsMetafield } from '../../../../lib/codeChainService';
import { isSkuSold, gwebIsOutOfStock } from '../../../../lib/soldDetection';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_VERSION = '2024-10';
const PRODUCTS_PAGE_SIZE = 250;
const PAID_ORDERS_TO_SCAN = 50;
const SOLD_CODES_GQL_LIMIT = 500;
const MAX_PRODUCTS = 1000;
const GWEB_BATCH_SIZE = 10;
const GWEB_BATCH_DELAY_MS = 80;

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

function adminHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
  };
}

function parseLinkPageInfo(linkHeader, rel) {
  if (!linkHeader) return null;
  const re = new RegExp(`<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="${rel}"`);
  const m = linkHeader.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

function normalizeQt(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isSkuInChains(chains, sku) {
  const needle = String(sku || '').trim();
  if (!needle) return false;
  for (const chain of chains || []) {
    const soldCodes = Array.isArray(chain?.soldCodes) ? chain.soldCodes : [];
    if (soldCodes.some((code) => String(code || '').trim() === needle)) return true;
    const codes = Array.isArray(chain?.codes) ? chain.codes : [];
    const activeIndex = Number(chain?.activeIndex) || 0;
    for (let i = 0; i < activeIndex && i < codes.length; i += 1) {
      if (String(codes[i] || '').trim() === needle) return true;
    }
  }
  return false;
}

async function fetchPaidOrderSkus(domain, token) {
  const query = `
    query PaidOrders($first: Int!) {
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true, query: "financial_status:paid") {
        nodes {
          id
          name
          snapshot: metafield(namespace: "custom", key: "kg_paid_snapshot") { value }
        }
      }
    }
  `;
  const res = await fetch(
    `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ query, variables: { first: PAID_ORDERS_TO_SCAN } }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`orders query failed: ${res.status} ${JSON.stringify(data?.errors || '')}`);
  }
  const skus = new Set();
  for (const node of data?.data?.orders?.nodes || []) {
    const raw = node?.snapshot?.value;
    if (!raw) continue;
    let snapshot;
    try {
      snapshot = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const item of Array.isArray(snapshot?.items) ? snapshot.items : []) {
      const code = String(item?.sku || '').trim();
      if (code) skus.add(code);
    }
  }
  return skus;
}

async function paginateAllProducts(domain, token) {
  const products = [];
  let pageInfo = null;
  let pageCount = 0;
  let warned = false;
  do {
    const url = pageInfo
      ? `https://${domain}/admin/api/${API_VERSION}/products.json?limit=${PRODUCTS_PAGE_SIZE}&page_info=${encodeURIComponent(pageInfo)}`
      : `https://${domain}/admin/api/${API_VERSION}/products.json?limit=${PRODUCTS_PAGE_SIZE}`;
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`products.json: ${res.status} ${JSON.stringify(data?.errors || '')}`);
    }
    pageInfo = parseLinkPageInfo(res.headers.get('Link') || '', 'next');
    for (const p of data.products || []) {
      products.push({
        id: p.id,
        variants: (p.variants || []).map((v) => ({ id: v.id, sku: v.sku })),
      });
    }
    pageCount += 1;
    if (products.length > MAX_PRODUCTS) {
      if (!warned) {
        console.warn(`[sold-skus] exceeded ${MAX_PRODUCTS} products — still paginating fully`);
        warned = true;
      }
    }
  } while (pageInfo);
  return { products, pageCount };
}

async function fetchQtMap(skus) {
  const qtMap = new Map();
  const list = [...skus];
  for (let i = 0; i < list.length; i += GWEB_BATCH_SIZE) {
    const batch = list.slice(i, i + GWEB_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (sku) => {
        try {
          const { item } = await fetchFn6ByMco(sku);
          return [sku, normalizeQt(item?.qt ?? item?.quantity ?? item?.item?.qt)];
        } catch {
          return [sku, null];
        }
      }),
    );
    for (const [sku, qt] of results) qtMap.set(sku, qt);
    if (i + GWEB_BATCH_SIZE < list.length) await SLEEP(GWEB_BATCH_DELAY_MS);
  }
  return qtMap;
}

/** GET — returns the set of currently-sold SKUs (compound rule). */
export async function GET() {
  try {
    const { token, domain } = await getShopifyToken();

    // 1. Batch past-sales SKUs from the most recent 50 paid orders.
    const pastSalesSkus = await fetchPaidOrderSkus(domain, token);

    // 2. Paginate all Shopify products (cap reported in console at 1000+).
    const { products } = await paginateAllProducts(domain, token);

    // 3. Collect per-product soldCodes for fast lookup.
    const soldCodesByProduct = new Map();
    await Promise.all(
      products.map(async (p) => {
        try {
          const { payload } = await fetchCodeChainsMetafield(domain, token, p.id);
          const codes = new Set();
          for (const chain of payload?.chains || []) {
            for (const code of chain.soldCodes || []) codes.add(String(code).trim());
          }
          soldCodesByProduct.set(p.id, codes);
        } catch {
          soldCodesByProduct.set(p.id, new Set());
        }
      }),
    );

    // 4. Build the SKU list and fetch Gweb qt in batches.
    const skuToProduct = new Map();
    for (const p of products) {
      for (const v of p.variants) {
        const code = String(v.sku || '').trim();
        if (!code) continue;
        if (!skuToProduct.has(code)) skuToProduct.set(code, p);
      }
    }
    const qtMap = await fetchQtMap(skuToProduct.keys());

    // 5. Compute the compound sold verdict.
    const soldSkus = [];
    let withPriorSale = 0;
    let outOfStock = 0;
    for (const [sku, product] of skuToProduct.entries()) {
      const qt = qtMap.get(sku);
      const isInSoldCodes = (soldCodesByProduct.get(product.id) || new Set()).has(sku);
      const soldSnapshot = pastSalesSkus.has(sku) ? { fromBatch: true } : null;
      const sold = isSkuSold({ gwebQt: qt, soldSnapshot, isInSoldCodes });
      if (sold) soldSkus.push(sku);
      if (pastSalesSkus.has(sku) || isInSoldCodes) withPriorSale += 1;
      if (gwebIsOutOfStock(qt)) outOfStock += 1;
    }

    return NextResponse.json(
      {
        soldSkus,
        generatedAt: new Date().toISOString(),
        counts: {
          scanned: skuToProduct.size,
          sold: soldSkus.length,
          withPriorSale,
          outOfStock,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Internal error', soldSkus: [] },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
