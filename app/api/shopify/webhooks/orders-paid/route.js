import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../lib/shopify';
import {
  fetchProcessedOrderLines,
  markOrderLineProcessed,
  processOrderLineForChains,
} from '../../../../../lib/codeChainService';

function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
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
    if (!lineItems.length) {
      return NextResponse.json({ processed: 0 });
    }

    const { token, domain } = await getShopifyToken();
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

    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
