import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { findShopifyVariantBySkuOnly } from '../../../../lib/shopifyProductLookup';
import {
  upsertVariantGwebWeightMetafield,
  upsertVariantGwebPrcMetafield,
  upsertVariantGwebPrcusMetafield,
  formatGwebWeightDisplay,
} from '../../../../lib/gwebWeightMetafield';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHOPIFY_THROTTLE_MS = 100;

/**
 * POST — one-time bulk backfill of gweb_weight / gweb_prc / gweb_prcus
 * metafields for existing Shopify variants.
 *
 * Client posts `{ items: [{ mco, weight, prc, prcus }] }` collected from
 * the Gweb FN6 list. For each, looks up the Shopify variant by SKU and
 * writes the three metafields.
 *
 * Small batches (10) so each serverless call stays under Vercel's 10s
 * hobby-plan function timeout.
 */
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ total: 0, updated: 0, skipped: 0, notFound: 0, errors: [] });
  }

  const { token, domain } = await getShopifyToken();
  const summary = { total: 0, updated: 0, skipped: 0, notFound: 0, errors: [] };

  for (const entry of items) {
    const sku = String(entry?.mco || '').trim();
    if (!sku) { summary.skipped += 1; continue; }
    summary.total += 1;

    try {
      const shopify = await findShopifyVariantBySkuOnly(domain, token, sku);
      if (!shopify?.found || !shopify?.variantId) {
        summary.notFound += 1;
        continue;
      }
      const w = entry.weight;
      const wDisp = formatGwebWeightDisplay(w);
      if (wDisp) {
        await upsertVariantGwebWeightMetafield(domain, token, shopify.variantId, wDisp);
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }
      const prc = entry.prc;
      if (prc != null && prc !== '' && Number(prc) !== 0) {
        await upsertVariantGwebPrcMetafield(domain, token, shopify.variantId, prc);
      }
      const prcus = entry.prcus;
      if (prcus != null && prcus !== '' && Number(prcus) !== 0) {
        await upsertVariantGwebPrcusMetafield(domain, token, shopify.variantId, prcus);
      }
      await new Promise((r) => setTimeout(r, SHOPIFY_THROTTLE_MS));
    } catch (err) {
      summary.errors.push({ sku, message: err?.message || String(err) });
    }
  }

  return NextResponse.json(summary);
}
