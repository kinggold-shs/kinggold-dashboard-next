import { NextResponse } from 'next/server';
import { verifyAppProxySignature } from '../../../../../lib/shopifyAppProxy';
import { refreshVariantPrice } from '../../../../../lib/refreshVariantPrice';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function jsonNoStore(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!verifyAppProxySignature(query, clientSecret)) {
      return jsonNoStore({ error: 'Invalid signature' }, 401);
    }

    const sku = searchParams.get('sku')?.trim();
    if (!sku) {
      return jsonNoStore({ error: 'sku is required' }, 400);
    }

    const result = await refreshVariantPrice(sku, { force: true });
    return jsonNoStore(result);
  } catch (err) {
    return jsonNoStore({ error: err.message || 'Internal error' }, 502);
  }
}
