import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { approveOrderPayment, declineOrderPayment } from '../../../../lib/shopifyPaymentActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST — manually approve or decline an order whose payment happened outside
 * Shopify (bank transfer / cash to the owner), driven by the Payments page.
 *
 * Body: { orderId: string, action: 'approve' | 'decline' }
 *
 * approve → marks the order paid in Shopify, which fires Shopify's own
 *           orders/paid webhook; the existing handler then does the
 *           code-chain advance and gold-rate snapshot. Nothing is duplicated
 *           here.
 * decline → cancels + restocks the order. It does NOT refund: nothing was
 *           captured through Shopify, and returning money stays a deliberate
 *           human action.
 */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const orderId = String(body.orderId || '').trim();
  const action = String(body.action || '').trim();

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'" }, { status: 400 });
  }

  try {
    const { token, domain } = await getShopifyToken();

    if (action === 'approve') {
      const result = await approveOrderPayment(domain, token, orderId);
      return NextResponse.json({ ok: true, action, ...result });
    }

    const result = await declineOrderPayment(domain, token, orderId, {
      notifyCustomer: body.notifyCustomer === true,
    });
    return NextResponse.json({ ok: true, action, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 502 });
  }
}
