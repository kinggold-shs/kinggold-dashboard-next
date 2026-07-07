import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { getSoldPriceForSku } from '../../../../lib/soldPriceLookup';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = (searchParams.get('sku') ?? '').trim();
    if (!sku) {
      return NextResponse.json({ error: 'sku is required' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();
    const result = await getSoldPriceForSku(domain, token, sku);
    return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { found: false, error: err?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
