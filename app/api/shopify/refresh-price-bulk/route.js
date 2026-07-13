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
export const maxDuration = 60;

// Each item can fire up to 5 Shopify calls (variant lookup + price PUT +
// up to 3 metafield writes) against a 2 req/sec bucket. This route is
// triggered by gweb on every gold-rate change (as often as every ~3 min),
// so a slow/rate-limited item here isn't retried until the next trigger —
// worth spending the retry budget rather than silently leaving it stale.
const SHOPIFY_THROTTLE_MS = 600;
const RATE_LIMIT_RETRY_DELAY_MS = 3000;
const MAX_ELAPSED_MS = 50000; // stay under the 60s function budget

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  return /429|exceeded.*calls per second/i.test(err?.message || '');
}

async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    return fn();
  }
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

  summary.truncated = false;

  for (const entry of updates) {
    if (Date.now() - startedAt > MAX_ELAPSED_MS) {
      summary.truncated = true;
      break;
    }

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
      const shopify = await withRateLimitRetry(
        () => findShopifyVariantBySkuOnly(domain, token, sku),
      );
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
          await withRateLimitRetry(
            () => putShopifyVariantPrice(domain, token, shopify.variantId, roundedNew),
          );
        }
        // Always sync metafields so theme can compute prices locally
        const weightRaw = entry?.weight;
        if (weightRaw != null && weightRaw !== '') {
          try {
            const w = formatGwebWeightDisplay(weightRaw);
            if (w) {
              await withRateLimitRetry(
                () => upsertVariantGwebWeightMetafield(domain, token, shopify.variantId, w),
              );
            }
          } catch (e) { summary.errors.push({ sku, message: `metafield weight: ${e.message}` }); }
        }
        const prcRaw = entry?.prc;
        if (prcRaw != null && prcRaw !== '' && Number(prcRaw) !== 0) {
          try {
            await withRateLimitRetry(
              () => upsertVariantGwebPrcMetafield(domain, token, shopify.variantId, prcRaw),
            );
          } catch (e) { summary.errors.push({ sku, message: `metafield prc: ${e.message}` }); }
        }
        const prcusRaw = entry?.prcus;
        if (prcusRaw != null && prcusRaw !== '' && Number(prcusRaw) !== 0) {
          try {
            await withRateLimitRetry(
              () => upsertVariantGwebPrcusMetafield(domain, token, shopify.variantId, prcusRaw),
            );
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

    await sleep(SHOPIFY_THROTTLE_MS);
  }

  return NextResponse.json({
    ...summary,
    elapsedMs: Date.now() - startedAt,
  });
}
