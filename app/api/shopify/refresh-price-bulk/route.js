import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { findShopifyVariantBySkuOnly } from '../../../../lib/shopifyProductLookup';
import { putShopifyVariantPrice } from '../../../../lib/refreshVariantPrice';
import {
  formatGwebWeightDisplay,
  upsertVariantGwebWeightMetafield,
  upsertVariantGwebPrcMetafield,
  upsertVariantGwebPrcusMetafield,
} from '../../../../lib/gwebWeightMetafield';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHOPIFY_THROTTLE_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST — bulk sync of 18K prices + metafields to Shopify variants.
 *
 * Called automatically by gweb's shopify_sync.py on every gp save (gold price change).
 * Body: { updates: Array<{ mco, price, weight?, prc?, prcus? }>, dryRun?: boolean }
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
        const priceChanged = currentPrice !== roundedNew;
        if (!dryRun) {
          if (priceChanged) {
            await putShopifyVariantPrice(domain, token, shopify.variantId, roundedNew);
            await sleep(SHOPIFY_THROTTLE_MS);
          }
          // Always sync metafields so theme can compute prices locally
          const weightRaw = entry?.weight;
          if (weightRaw != null && weightRaw !== '') {
            try {
              const w = formatGwebWeightDisplay(weightRaw);
              if (w) await upsertVariantGwebWeightMetafield(domain, token, shopify.variantId, w);
            } catch (e) { summary.errors.push({ sku, message: `metafield weight: ${e.message}` }); }
          }
          const prcRaw = entry?.prc;
          if (prcRaw != null && prcRaw !== '' && Number(prcRaw) !== 0) {
            try {
              await upsertVariantGwebPrcMetafield(domain, token, shopify.variantId, prcRaw);
            } catch (e) { summary.errors.push({ sku, message: `metafield prc: ${e.message}` }); }
          }
          const prcusRaw = entry?.prcus;
          if (prcusRaw != null && prcusRaw !== '' && Number(prcusRaw) !== 0) {
            try {
              await upsertVariantGwebPrcusMetafield(domain, token, shopify.variantId, prcusRaw);
            } catch (e) { summary.errors.push({ sku, message: `metafield prcus: ${e.message}` }); }
          }
        }
        if (priceChanged) {
          summary.updated += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (err) {
        summary.errors.push({ sku, message: err.message || String(err) });
      }
  }

  return NextResponse.json({
    ...summary,
    elapsedMs: Date.now() - startedAt,
  });
}
