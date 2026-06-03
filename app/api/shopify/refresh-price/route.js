import { NextResponse } from 'next/server';
import { refreshVariantPrice } from '../../../../lib/refreshVariantPrice';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
};

function jsonNoStore(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** GET — storefront calls this directly (CORS open, simple request, no preflight). */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = (searchParams.get('sku') ?? '').trim();
    if (!sku) {
      return jsonNoStore({ error: 'sku is required' }, 400);
    }

    const result = await refreshVariantPrice(sku);
    return jsonNoStore(result);
  } catch (err) {
    return jsonNoStore({ error: err.message || 'Internal error' }, 500);
  }
}

/** POST — dashboard/manual testing only. */
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
