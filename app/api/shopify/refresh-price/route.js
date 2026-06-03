import { NextResponse } from 'next/server';
import { refreshVariantPrice } from '../../../../lib/refreshVariantPrice';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function jsonNoStore(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** POST — dashboard/manual testing only (no App Proxy HMAC). Storefront uses proxy GET. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sku = (body.sku ?? '').trim();
    if (!sku) {
      return jsonNoStore({ error: 'sku is required' }, 400);
    }

    const result = await refreshVariantPrice(sku);
    return jsonNoStore(result);
  } catch (err) {
    return jsonNoStore({ error: err.message || 'Internal error' }, 500);
  }
}
