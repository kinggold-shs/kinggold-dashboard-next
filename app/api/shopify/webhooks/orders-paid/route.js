import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../lib/shopify';
import {
  fetchCodeChainsMetafield,
  fetchProcessedOrderLines,
  markOrderLineProcessed,
  processOrderLineForChains,
  unpublishProductIfFullySoldOut,
} from '../../../../../lib/codeChainService';
import { fetchGoldRateSnapshotAt } from '../../../../../lib/goldRates';
import { upsertOrderSnapshotMetafields } from '../../../../../lib/shopifyOrderHistory';
import { recordWebhookReceipt } from '../../../../../lib/webhookReceipts.js';
import { refreshVariantPrice } from '../../../../../lib/refreshVariantPrice';

export const maxDuration = 60;

// Multiple line items each trigger several sequential Shopify Admin API
// calls (processOrderLineForChains, metafield reads/writes, price PUTs).
// Without a gap, a multi-item order can burst past Shopify's 2 req/sec
// bucket and crash the whole webhook handler (seen live: order #1119,
// "Exceeded 2 calls per second for api client").
const LINE_ITEM_DELAY_MS = 600;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

function getCustomerName(order) {
  const first = order?.customer?.first_name?.trim?.() || '';
  const last = order?.customer?.last_name?.trim?.() || '';
  const full = `${first} ${last}`.trim();
  return full || order?.billing_address?.name || order?.shipping_address?.name || null;
}

function mapOrderItems(lineItems) {
  return (Array.isArray(lineItems) ? lineItems : []).map((line) => ({
    id: line?.id != null ? String(line.id) : null,
    product_id: line?.product_id != null ? String(line.product_id) : null,
    variant_id: line?.variant_id != null ? String(line.variant_id) : null,
    sku: line?.sku || null,
    title: line?.title || null,
    variant_title: line?.variant_title || null,
    quantity: Number(line?.quantity) || 0,
    price: line?.price != null ? Number(line.price) : null,
    total_discount: line?.total_discount != null ? Number(line.total_discount) : null,
  }));
}

async function persistPurchaseSnapshot(order, request, domain, token) {
  const orderId = order?.id != null ? String(order.id) : '';
  if (!orderId) {
    return { inserted: false, reason: 'missing-order-id' };
  }

  const snapshot = {
    shopify_order_id: orderId,
    order_name: order?.name || null,
    financial_status: order?.financial_status || null,
    currency_code: order?.currency || null,
    customer_name: getCustomerName(order),
    customer_email: order?.email || order?.customer?.email || null,
    items: mapOrderItems(order?.line_items),
    subtotal_amount: order?.subtotal_price != null ? Number(order.subtotal_price) : null,
    total_amount: order?.total_price != null ? Number(order.total_price) : null,
    total_tax: order?.total_tax != null ? Number(order.total_tax) : null,
    purchased_at: order?.processed_at || order?.created_at || null,
    webhook_received_at: new Date().toISOString(),
    source_topic: request.headers.get('x-shopify-topic') || 'orders/paid',
    raw_order_id: orderId,
  };

  const purchasedAt = order?.processed_at || order?.created_at || snapshot.webhook_received_at;
  const rates = await fetchGoldRateSnapshotAt(purchasedAt);
  snapshot.gold_price_18k = rates.pr18;
  snapshot.gold_price_21k = rates.pr21;
  snapshot.usd_rate = rates.usd_rate;
  snapshot.snapshot_taken_at = purchasedAt;

  await upsertOrderSnapshotMetafields(domain, token, orderId, snapshot);
  return { inserted: true, shopify_order_id: orderId };
}

/** POST — Shopify orders/paid webhook: advance code chains on purchase */
export async function POST(request) {
  try {
    let snapshotError = null;
    let snapshotSkipped = false;
    const rawBody = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    const isTest = request.headers.get('x-shopify-test') === 'true';
    const topic = request.headers.get('x-shopify-topic') ?? 'orders/paid';

    if (!verifyShopifyWebhook(rawBody, hmac)) {
      if (hmac) {
        try {
          await recordWebhookReceipt({ status: 'rejected', http: 401, test: isTest, topic, orderName: null, orderId: null, message: 'HMAC verification failed' });
        } catch (_) {}
      }
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const order = JSON.parse(rawBody);
    const lineItems = order?.line_items || [];
    const { token, domain } = await getShopifyToken();

    // Zero-price alert: this is the moment real money (or lack of it) is
    // confirmed. If any paid line item has price <= 0, the store just gave
    // away that piece for free — the exact failure mode behind this
    // incident. Flag it loudly in the webhook receipts (visible to admin in
    // the dashboard) and, on a best-effort basis, heal that SKU's stored
    // Shopify price immediately so it can't repeat on the next order.
    const zeroPriceLines = lineItems.filter((line) => {
      const price = Number(line?.price);
      return line?.sku && Number.isFinite(price) && price <= 0 && Number(line?.quantity) > 0;
    });
    if (zeroPriceLines.length > 0) {
      const skus = zeroPriceLines.map((l) => l.sku);
      console.error(`[orders-paid] ZERO PRICE ALERT: order ${order?.name || order?.id} has ${zeroPriceLines.length} line item(s) charged 0: ${skus.join(', ')}`);
      try {
        await recordWebhookReceipt({
          status: 'zero_price_alert',
          http: 200,
          test: request.headers.get('x-shopify-test') === 'true',
          topic: request.headers.get('x-shopify-topic') ?? 'orders/paid',
          orderName: order?.name ?? null,
          orderId: String(order?.id ?? ''),
          message: `Order charged 0 EGP for SKU(s): ${skus.join(', ')} — check and correct this order manually in Shopify admin.`,
        });
      } catch (_) {}
      for (const sku of skus) {
        try {
          await refreshVariantPrice(sku);
        } catch (_) {
          // best-effort heal; the receipt above already flagged this order for manual review
        }
        await sleep(LINE_ITEM_DELAY_MS);
      }
    }

    let historySnapshot = null;
    try {
      historySnapshot = await persistPurchaseSnapshot(order, request, domain, token);
    } catch (err) {
      snapshotError = err?.message ?? 'Unknown snapshot error';
      historySnapshot = { inserted: false, error: snapshotError };
    }

    if (!lineItems.length) {
      snapshotSkipped = true;
      try {
        await recordWebhookReceipt({ status: 'skipped', http: 200, test: isTest, topic, orderName: order?.name ?? null, orderId: String(order?.id ?? ''), message: 'no line items (test or empty order)' });
      } catch (_) {}
      return NextResponse.json({ processed: 0, history: historySnapshot });
    }

    const { metafieldId, lineIds } = await fetchProcessedOrderLines(domain, token);

    const results = [];
    let processedAny = false;
    for (const line of lineItems) {
      const lineId = String(line.id || '');
      if (!lineId || lineIds.has(lineId)) continue;

      const productId = line.product_id;
      const sku = line.sku;
      if (!productId || !sku) continue;

      try {
        const result = await processOrderLineForChains(
          domain,
          token,
          String(productId),
          sku,
          sku,
        );
        if (result.advanced) {
          lineIds.add(lineId);
          processedAny = true;
          results.push({ lineId, ...result });
        }
        if (result.advanced) {
          try {
            const { payload } = await fetchCodeChainsMetafield(domain, token, String(productId));
            const chains = Array.isArray(payload?.chains) ? payload.chains : [];
            if (chains.length > 0) {
              await unpublishProductIfFullySoldOut(domain, token, String(productId), chains);
            }
          } catch (unpublishErr) {
            results.push({ lineId, unpublishError: unpublishErr?.message || String(unpublishErr) });
          }
        }
      } catch (err) {
        results.push({ lineId, error: err.message });
      }
      await sleep(LINE_ITEM_DELAY_MS);
    }

    if (processedAny) {
      await markOrderLineProcessed(domain, token, metafieldId, lineIds);
    }

    try {
      await recordWebhookReceipt({
        status: snapshotError ? 'error' : 'verified', http: 200, test: isTest, topic,
        orderName: order?.name ?? null,
        orderId: String(order?.id ?? ''),
        message: snapshotError ?? null,
      });
    } catch (_) {}

    return NextResponse.json({ processed: results.length, results, history: historySnapshot });
  } catch (err) {
    try {
      await recordWebhookReceipt({ status: 'error', http: 500, test: isTest, topic, orderName: null, orderId: null, message: err?.message ?? 'Unknown error' });
    } catch (_) {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
