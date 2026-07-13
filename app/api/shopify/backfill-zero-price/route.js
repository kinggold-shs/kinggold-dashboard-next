import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { shopifyGraphql } from '../../../../lib/shopifyProductLookup';
import { refreshVariantPrice } from '../../../../lib/refreshVariantPrice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-time (repeatable, idempotent) backfill for variants that were created
 * with price 0.00 by the codeChainService bug (fixed separately). Finds
 * active Shopify variants stored at price 0 and repairs each one via the
 * same single-SKU on-the-fly path used at add-to-cart (refreshVariantPrice),
 * paced with a per-item delay — never a bulk catalog-wide price push.
 *
 * Cursor-paginated like /api/shopify/reconcile: call repeatedly with
 * ?cursor=<nextCursor> from the previous response until hasMore is false.
 * Bounded to an 8.5s time budget per call to stay under serverless limits.
 */

const BATCH_LIMIT = 25;
// refreshVariantPrice fires up to ~5 sequential Shopify calls per SKU
// (product lookup + price PUT + up to 3 metafield writes), against a
// 2 req/sec bucket. 150ms was not enough gap to let the bucket refill
// between items and caused 429s on a live run; 1100ms keeps sustained
// throughput safely under the limit even for multi-call items.
const ITEM_DELAY_MS = 1100;
const RATE_LIMIT_RETRY_DELAY_MS = 3000;
const ZERO_PRICE_VARIANTS_QUERY = `
  query ZeroPriceVariants($first: Int!, $after: String) {
    productVariants(first: $first, after: $after, query: "price:0") {
      pageInfo { hasNextPage endCursor }
      edges {
        node { id sku price }
      }
    }
  }
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') || null;

  const summary = {
    checked: 0,
    fixed: 0,
    skippedNoSku: 0,
    skippedNoFn6Price: 0,
    errors: [],
    nextCursor: null,
    hasMore: false,
    elapsedMs: 0,
  };

  try {
    const { token, domain } = await getShopifyToken();

    const data = await shopifyGraphql(domain, token, ZERO_PRICE_VARIANTS_QUERY, {
      first: BATCH_LIMIT,
      after: cursor,
    });

    const variants = data?.productVariants?.edges || [];
    summary.hasMore = data?.productVariants?.pageInfo?.hasNextPage || false;
    summary.nextCursor = data?.productVariants?.pageInfo?.endCursor || null;

    for (const edge of variants) {
      const variant = edge.node;
      const sku = variant.sku;
      summary.checked += 1;

      if (!sku) {
        summary.skippedNoSku += 1;
        continue;
      }

      try {
        let result;
        try {
          result = await refreshVariantPrice(sku);
        } catch (err) {
          const isRateLimited = /429|exceeded.*calls per second/i.test(err?.message || '');
          if (!isRateLimited) throw err;
          // One bounded retry after a longer cooldown — the bucket needs time
          // to refill; retrying immediately would just fail again.
          await sleep(RATE_LIMIT_RETRY_DELAY_MS);
          result = await refreshVariantPrice(sku);
        }
        if (result.found && result.price != null && Number(result.price) > 0) {
          summary.fixed += 1;
        } else {
          summary.skippedNoFn6Price += 1;
        }
      } catch (err) {
        summary.errors.push({ sku, message: err.message || String(err) });
      }

      if (Date.now() - startedAt > 8500) {
        summary.hasMore = true;
        break;
      }
      await sleep(ITEM_DELAY_MS);
    }
  } catch (err) {
    summary.errors.push({ message: err.message || String(err) });
  }

  summary.elapsedMs = Date.now() - startedAt;
  return NextResponse.json(summary);
}
