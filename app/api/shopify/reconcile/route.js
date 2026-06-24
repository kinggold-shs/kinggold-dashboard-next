import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { shopifyGraphql } from '../../../../lib/shopifyProductLookup';
import { putShopifyVariantPrice } from '../../../../lib/refreshVariantPrice';
import { getPublicApiBaseUrl } from '../../../../lib/publicEnv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily safety-net reconciliation cron (Vercel Hobby: once/day, ±59min).
 *
 * Fetches a batch of Shopify variants that have the custom.gweb_weight
 * metafield, compares their stored price to the live gweb 18K price,
 * and PUTs any drift. Catches anything the gweb post_save webhook missed
 * (gweb down, network blip, Shopify 500).
 *
 * Must complete in <10s (Hobby function limit). Processes a limited batch
 * per invocation and rotates through the catalog using a cursor stored in
 * the URL query param ?cursor=. Without a cursor, starts from the beginning.
 */

const BATCH_LIMIT = 25;
const VARIANTS_WITH_METAFIELD_QUERY = `
  query VariantsWithMetafield($first: Int!, $after: String) {
    productVariants(first: $first, after: $after, query: "metafield.custom.gweb_weight:*") {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          sku
          price
          metafield(namespace: "custom", key: "gweb_weight") { value }
          metafield(namespace: "custom", key: "gweb_prc") { value }
          metafield(namespace: "custom", key: "gweb_prcus") { value }
        }
      }
    }
  }
`;

export async function GET(request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') || null;

  const summary = {
    checked: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    nextCursor: null,
    hasMore: false,
    elapsedMs: 0,
  };

  try {
    const { token, domain } = await getShopifyToken();

    const data = await shopifyGraphql(domain, token, VARIANTS_WITH_METAFIELD_QUERY, {
      first: BATCH_LIMIT,
      after: cursor,
    });

    const variants = data?.productVariants?.edges || [];
    summary.hasMore = data?.productVariants?.pageInfo?.hasNextPage || false;
    summary.nextCursor = data?.productVariants?.pageInfo?.endCursor || null;

    const base = getPublicApiBaseUrl();

    for (const edge of variants) {
      const variant = edge.node;
      const sku = variant.sku;
      if (!sku) {
        summary.skipped += 1;
        continue;
      }

      const weightMeta = variant.metafield?.value;
      if (!weightMeta) {
        summary.skipped += 1;
        continue;
      }

      summary.checked += 1;

      try {
        const fn6Res = await fetch(
          `${base}/Sup/api/fn6/by-mco/${encodeURIComponent(sku)}/`,
          { cache: 'no-store' },
        );
        if (!fn6Res.ok) {
          summary.skipped += 1;
          continue;
        }
        const item = await fn6Res.json();
        const livePrice = Math.trunc(Number(item.price));
        if (!Number.isFinite(livePrice) || livePrice <= 0) {
          summary.skipped += 1;
          continue;
        }

        const storedPrice = Math.trunc(Number(variant.price));
        if (storedPrice === livePrice) {
          summary.skipped += 1;
          continue;
        }

        await putShopifyVariantPrice(domain, token, variant.id, String(livePrice));
        summary.updated += 1;
      } catch (err) {
        summary.errors.push({ sku, message: err.message || String(err) });
      }

      if (Date.now() - startedAt > 8500) {
        summary.hasMore = true;
        break;
      }
    }
  } catch (err) {
    summary.errors.push({ message: err.message || String(err) });
  }

  summary.elapsedMs = Date.now() - startedAt;
  return NextResponse.json(summary);
}
