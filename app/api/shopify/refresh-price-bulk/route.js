import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { findShopifyVariantBySkuOnly } from '../../../../lib/shopifyProductLookup';
import { putShopifyVariantPrice } from '../../../../lib/refreshVariantPrice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHOPIFY_THROTTLE_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST — one-time bulk sync of FN6 (forced to 18K) prices to Shopify variants.
 *
 * The client paginates the Gweb FN6 list (with the 18K axios interceptor
 * applied) and posts the resolved `{ mco, price }` pairs here. This route
 * only needs Shopify access — no Gweb auth required server-side.
 *
 * Body: { updates: Array<{ mco: string, price: number|string }>, dryRun?: boolean }
 * Returns: { total, updated, skipped, notFound, errors, dryRun, elapsedMs }
 */
export async function POST(request) {
  const startedAt = Date.now();
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const updates = Array.isArray(body.updates) ? body.updates : [];
  const dryRun = body.dryRun === true;

  const summary = {
    total: 0,
    updated: 0,
    skipped: 0,
    notFound: 0,
    errors: [],
    dryRun,
  };

  if (updates.length === 0) {
    return NextResponse.json({ ...summary, elapsedMs: Date.now() - startedAt });
  }

  const { token, domain } = await getShopifyToken();

  for (const entry of updates) {
    const sku = String(entry?.mco || '').trim();
    if (!sku) {
      summary.skipped += 1;
      continue;
    }
    const newPriceNum = Number(entry?.price);
    if (!Number.isFinite(newPriceNum)) {
      summary.skipped += 1;
      continue;
    }
    summary.total += 1;

      const roundedNew = String(Math.round(newPriceNum / 5) * 5);
      try {
        const shopify = await findShopifyVariantBySkuOnly(domain, token, sku);
        if (!shopify?.found || !shopify?.variantId) {
          summary.notFound += 1;
          continue;
        }
        const currentPrice = shopify.price != null && shopify.price !== ''
          ? String(Math.round(Number(shopify.price) / 5) * 5)
          : null;
        if (currentPrice === roundedNew) {
          summary.skipped += 1;
          continue;
        }
        if (!dryRun) {
          await putShopifyVariantPrice(domain, token, shopify.variantId, roundedNew);
          await sleep(SHOPIFY_THROTTLE_MS);
        }
        summary.updated += 1;
      } catch (err) {
        summary.errors.push({ sku, message: err.message || String(err) });
      }
  }

  return NextResponse.json({
    ...summary,
    elapsedMs: Date.now() - startedAt,
  });
}
