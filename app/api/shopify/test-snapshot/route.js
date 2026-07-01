import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { fetchGoldRateSnapshot } from '../../../../lib/goldRates';
import { upsertOrderSnapshotMetafields } from '../../../../lib/shopifyOrderHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  const provided = searchParams.get('secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orderId = searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({
      error: 'orderId required',
      usage: '/api/shopify/test-snapshot?orderId=<numeric_id>&secret=<SHOPIFY_WEBHOOK_SECRET>',
    }, { status: 400 });
  }

  const steps = {};

  // Step 1 — Auth
  try {
    const { token, domain } = await getShopifyToken();
    steps.auth = { ok: true, domain, tokenMasked: token.slice(0, 4) + '...' + token.slice(-4) };
  } catch (err) {
    steps.auth = { ok: false, error: err.message };
  }

  // Step 2 — Gold rate
  try {
    const rates = await fetchGoldRateSnapshot();
    steps.goldRate = { ok: true, rates };
  } catch (err) {
    steps.goldRate = { ok: false, error: err.message };
  }

  // Step 3 — Fetch order from Shopify REST API
  if (steps.auth.ok) {
    try {
      const { domain } = steps.auth;
      const token = (await getShopifyToken()).token; // re-fetch inside try
      const res = await fetch(`https://${domain}/admin/api/2024-10/orders/${orderId}.json`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify order fetch failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      const order = data.order;
      steps.fetchOrder = {
        ok: true,
        name: order.name,
        financialStatus: order.financial_status,
        lineItemCount: order.line_items?.length ?? 0,
      };
    } catch (err) {
      steps.fetchOrder = { ok: false, error: err.message };
    }
  } else {
    steps.fetchOrder = { ok: false, error: 'skipped — auth failed' };
  }

  // Step 4 — Persist snapshot via upsertOrderSnapshotMetafields
  if (steps.auth.ok && steps.goldRate.ok && steps.fetchOrder.ok) {
    try {
      const { domain } = steps.auth;
      const token = (await getShopifyToken()).token;
      const { pr18, pr21, usd_rate, updated_at } = steps.goldRate.rates;
      const snapshot = {
        gold_price_18k: pr18,
        gold_price_21k: pr21,
        usd_rate,
        snapshot_taken_at: updated_at || new Date().toISOString(),
      };
      const result = await upsertOrderSnapshotMetafields(domain, token, orderId, snapshot);
      steps.persistSnapshot = { ok: result.ok, metafieldCount: result.count };
    } catch (err) {
      steps.persistSnapshot = { ok: false, error: err.message };
    }
  } else {
    const reasons = [];
    if (!steps.auth.ok) reasons.push('auth failed');
    if (!steps.goldRate.ok) reasons.push('gold rate fetch failed');
    if (!steps.fetchOrder.ok) reasons.push('order fetch failed');
    steps.persistSnapshot = { ok: false, error: `skipped — ${reasons.join(', ')}` };
  }

  // Summary
  const failed = Object.entries(steps).find(([, v]) => !v.ok);
  const summary = failed
    ? `step ${failed[0]} failed: ${failed[1].error}`
    : 'all steps passed';

  return NextResponse.json({ orderId, steps, summary });
}
