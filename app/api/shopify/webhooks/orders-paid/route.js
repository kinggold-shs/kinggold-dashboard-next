import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../lib/shopify';
import {
  fetchProcessedOrderLines,
  markOrderLineProcessed,
  processOrderLineForChains,
} from '../../../../../lib/codeChainService';
import { fetchGoldRateSnapshot } from '../../../../../lib/goldRates';
import { upsertOrderSnapshotMetafields } from '../../../../../lib/shopifyOrderHistory';

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

  const rates = await fetchGoldRateSnapshot();
  snapshot.gold_price_18k = rates.pr18;
  snapshot.gold_price_21k = rates.pr21;
  snapshot.usd_rate = rates.usd_rate;
  snapshot.snapshot_taken_at = snapshot.webhook_received_at;

  await upsertOrderSnapshotMetafields(domain, token, orderId, snapshot);
  return { inserted: true, shopify_order_id: orderId };
}

/** POST — Shopify orders/paid webhook: advance code chains on purchase */
export async function POST(request) {
  try {
    const rawBody = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhook(rawBody, hmac)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const order = JSON.parse(rawBody);
    const lineItems = order?.line_items || [];
    const { token, domain } = await getShopifyToken();

    let historySnapshot = null;
    try {
      historySnapshot = await persistPurchaseSnapshot(order, request, domain, token);
    } catch (err) {
      historySnapshot = { inserted: false, error: err.message };
    }

    if (!lineItems.length) {
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
      } catch (err) {
        results.push({ lineId, error: err.message });
      }
    }

    if (processedAny) {
      await markOrderLineProcessed(domain, token, metafieldId, lineIds);
    }

    return NextResponse.json({ processed: results.length, results, history: historySnapshot });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
