import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { fetchFn6ByMco } from '../../../../lib/fn6Server';
import { getSoldPriceForSku } from '../../../../lib/soldPriceLookup';
import {
  fetchCodeChainsMetafield,
  processOrderLineForChains,
  setVariantAvailability,
  unpublishProductIfFullySoldOut,
} from '../../../../lib/codeChainService';
import { isSkuSold, gwebIsOutOfStock } from '../../../../lib/soldDetection';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_VERSION = '2024-10';
const PRODUCTS_PAGE_SIZE = 250;
const WRITE_THROTTLE_MS = 250;
const SKIPPED_LIMIT = 50;

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

function adminHeaders(token) {
  return { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token };
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

async function paginateAllProducts(domain, token) {
  const products = [];
  let pageInfo = null;
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
        title: p.title,
        variants: (p.variants || []).map((v) => ({ id: v.id, sku: v.sku })),
      });
    }
  } while (pageInfo);
  return products;
}

async function fetchGwebQt(sku) {
  try {
    const { item } = await fetchFn6ByMco(sku);
    return normalizeQt(item?.qt ?? item?.quantity ?? item?.item?.qt);
  } catch {
    return null;
  }
}

/** POST — one-time sweep: zero inventory for sold SKUs, advance chains, unpublish fully-sold products. */
export async function POST() {
  const summary = {
    scanned: 0,
    soldFound: 0,
    inventoryZeroed: 0,
    chainsAdvanced: 0,
    productsUnpublished: 0,
    skippedNoSaleRecord: [],
    errors: [],
  };

  try {
    const { token, domain } = await getShopifyToken();
    const products = await paginateAllProducts(domain, token);

    for (const product of products) {
      let chains = [];
      try {
        const { payload } = await fetchCodeChainsMetafield(domain, token, product.id);
        chains = Array.isArray(payload?.chains) ? payload.chains : [];
      } catch (err) {
        // continue without chains — isInSoldCodes will be false
        chains = [];
      }

      let productTouched = false;
      for (const variant of product.variants) {
        const sku = String(variant.sku || '').trim();
        if (!sku || variant.id == null) continue;
        summary.scanned += 1;

        try {
          const qt = await fetchGwebQt(sku);
          const soldResult = await getSoldPriceForSku(domain, token, sku);
          const soldSnapshot = soldResult?.found ? soldResult : null;
          const isInSoldCodes = isSkuInChains(chains, sku);
          const sold = isSkuSold({ gwebQt: qt, soldSnapshot, isInSoldCodes });

          if (!sold) {
            if (gwebIsOutOfStock(qt)) {
              if (summary.skippedNoSaleRecord.length < SKIPPED_LIMIT) {
                summary.skippedNoSaleRecord.push({
                  sku,
                  gwebQt: qt,
                  reason: 'qt<=0 but no prior sale record',
                });
              }
            }
            continue;
          }

          summary.soldFound += 1;
          await setVariantAvailability(domain, token, variant.id, false);
          summary.inventoryZeroed += 1;
          productTouched = true;
          await SLEEP(WRITE_THROTTLE_MS);

          if (isInSoldCodes) {
            // already in soldCodes — chain was advanced by an earlier webhook
            continue;
          }

          // Try to advance the chain if this SKU is the active code
          try {
            const result = await processOrderLineForChains(
              domain,
              token,
              String(product.id),
              sku,
              sku,
            );
            if (result?.advanced) summary.chainsAdvanced += 1;
            await SLEEP(WRITE_THROTTLE_MS);
          } catch (err) {
            // SKU is sold (qt<=0 + prior sale) but not the active code — log and move on
            summary.errors.push({ sku, error: `chain advance: ${err?.message || err}` });
            await SLEEP(WRITE_THROTTLE_MS);
          }
        } catch (err) {
          summary.errors.push({ sku, error: err?.message || String(err) });
          await SLEEP(WRITE_THROTTLE_MS);
        }
      }

      if (productTouched && chains.length > 0) {
        try {
          // Re-fetch the latest chains so the unpublish decision sees any advances we just made.
          const { payload: latest } = await fetchCodeChainsMetafield(domain, token, product.id);
          const latestChains = Array.isArray(latest?.chains) ? latest.chains : [];
          if (latestChains.length > 0) {
            const result = await unpublishProductIfFullySoldOut(
              domain,
              token,
              product.id,
              latestChains,
            );
            if (result?.unpublished) summary.productsUnpublished += 1;
            await SLEEP(WRITE_THROTTLE_MS);
          }
        } catch (err) {
          summary.errors.push({ sku: String(product.id), error: `unpublish: ${err?.message || err}` });
        }
      }
    }

    return NextResponse.json(
      summary,
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { ...summary, error: err?.message || 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
