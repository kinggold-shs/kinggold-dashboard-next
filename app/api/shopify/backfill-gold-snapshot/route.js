import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { shopifyGraphql } from '../../../../lib/shopifyProductLookup';
import { fetchGoldRateSnapshotAt } from '../../../../lib/goldRates';
import { upsertOrderSnapshotMetafields } from '../../../../lib/shopifyOrderHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-time (repeatable, idempotent) backfill for order-history snapshots
 * created before the orders-paid webhook was fixed to record the gold
 * rate active AT PURCHASE TIME instead of whatever the rate was when the
 * webhook happened to run (which can be minutes later, after the rate
 * already moved). Recomputes gold_price_18k/21k/usd_rate for each paid
 * order from the /Sup/api/gold-rate-at/ history and rewrites the same
 * order metafields the webhook writes.
 *
 * Cursor-paginated like /api/shopify/backfill-zero-price: call repeatedly
 * with ?cursor=<nextCursor> from the previous response until hasMore is
 * false. Bounded to an 8.5s time budget per call to stay under serverless
 * limits.
 */

const BATCH_LIMIT = 10;
// upsertOrderSnapshotMetafields fires a metafield GET plus up to 5
// sequential PUT/POST writes per order against Shopify's 2 req/sec bucket.
// 600ms was not enough gap and caused sustained 429s on a live run
// (see backfill-zero-price for the same lesson); 1100ms plus one bounded
// retry after a longer cooldown keeps this reliable.
const ITEM_DELAY_MS = 1100;
const RATE_LIMIT_RETRY_DELAY_MS = 3000;
const SNAPSHOT_NAMESPACE = 'custom';
const SNAPSHOT_JSON_KEY = 'kg_paid_snapshot';

const PAID_ORDERS_QUERY = `
  query PaidOrdersForBackfill($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: PROCESSED_AT, query: "financial_status:paid") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        legacyResourceId
        name
        createdAt
        processedAt
        snapshot: metafield(namespace: "${SNAPSHOT_NAMESPACE}", key: "${SNAPSHOT_JSON_KEY}") { value }
      }
    }
  }
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') || null;

  const summary = {
    checked: 0,
    updated: 0,
    skippedNoSnapshot: 0,
    skippedNoPurchaseDate: 0,
    skippedUnchanged: 0,
    errors: [],
    nextCursor: null,
    hasMore: false,
    elapsedMs: 0,
  };

  try {
    const { token, domain } = await getShopifyToken();

    const data = await shopifyGraphql(domain, token, PAID_ORDERS_QUERY, {
      first: BATCH_LIMIT,
      after: cursor,
    });

    const nodes = data?.orders?.nodes || [];
    summary.hasMore = data?.orders?.pageInfo?.hasNextPage || false;
    summary.nextCursor = data?.orders?.pageInfo?.endCursor || null;

    for (const node of nodes) {
      summary.checked += 1;
      const orderId = node?.legacyResourceId ? String(node.legacyResourceId) : null;
      const existingSnapshot = safeJsonParse(node?.snapshot?.value);
      const purchasedAt = node?.processedAt || node?.createdAt || null;

      if (!orderId || !existingSnapshot) {
        summary.skippedNoSnapshot += 1;
        continue;
      }
      if (!purchasedAt) {
        summary.skippedNoPurchaseDate += 1;
        continue;
      }

      try {
        const rates = await fetchGoldRateSnapshotAt(purchasedAt);
        const unchanged = Number(existingSnapshot.gold_price_18k) === rates.pr18
          && Number(existingSnapshot.gold_price_21k) === rates.pr21
          && Number(existingSnapshot.usd_rate) === rates.usd_rate;

        if (unchanged) {
          summary.skippedUnchanged += 1;
        } else {
          const correctedSnapshot = {
            ...existingSnapshot,
            gold_price_18k: rates.pr18,
            gold_price_21k: rates.pr21,
            usd_rate: rates.usd_rate,
            snapshot_taken_at: purchasedAt,
          };
          try {
            await upsertOrderSnapshotMetafields(domain, token, orderId, correctedSnapshot);
          } catch (writeErr) {
            const isRateLimited = /429|exceeded.*calls per second/i.test(writeErr?.message || '');
            if (!isRateLimited) throw writeErr;
            await sleep(RATE_LIMIT_RETRY_DELAY_MS);
            await upsertOrderSnapshotMetafields(domain, token, orderId, correctedSnapshot);
          }
          summary.updated += 1;
        }
      } catch (err) {
        summary.errors.push({ orderId, orderName: node?.name, message: err.message || String(err) });
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
