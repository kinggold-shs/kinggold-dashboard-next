import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../lib/shopify';
import { findShopifyProduct } from '../../../../../lib/shopifyProductLookup';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku')?.trim();
    const title = searchParams.get('title')?.trim() || '';
    const handle = searchParams.get('handle')?.trim() || '';

    if (!sku) {
      return NextResponse.json({ error: 'sku is required' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();
    const result = await findShopifyProduct(domain, token, { sku, title, handle });

    if (!result.found) {
      return NextResponse.json({ found: false });
    }

    const storefrontDomain = process.env.SHOPIFY_STOREFRONT_DOMAIN
      || 'king-gold-5755.myshopify.com';

    return NextResponse.json({
      ...result,
      shopUrl: result.handle
        ? `https://${storefrontDomain}/products/${result.handle}`
        : null,
    });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('HTTP 401') || msg.includes('HTTP 403')) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
