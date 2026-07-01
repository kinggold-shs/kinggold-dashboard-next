import { NextResponse } from 'next/server';
import { refreshVariantPrice } from '../../../../lib/refreshVariantPrice';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.kinggoldeg.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  Vary: 'Origin',
};

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  ...CORS_HEADERS,
};

function jsonNoStore(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

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
