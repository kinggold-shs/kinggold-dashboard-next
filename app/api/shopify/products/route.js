import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';

export async function GET(request) {
  try {
    const { token, domain } = await getShopifyToken();
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';
    const pageInfo = searchParams.get('page_info') || '';

    const url = pageInfo
      ? `https://${domain}/admin/api/2024-10/products.json?limit=${limit}&page_info=${pageInfo}`
      : `https://${domain}/admin/api/2024-10/products.json?limit=${limit}&order=created_at+desc`;

    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.errors || 'Shopify API error' }, { status: res.status });
    }

    const linkHeader = res.headers.get('Link') || '';
    const nextPageInfo = linkHeader.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/)?.[1] || null;
    const prevPageInfo = linkHeader.match(/page_info=([^&>]+)[^>]*>;\s*rel="previous"/)?.[1] || null;

    const products = data.products.map((product) => {
      if (!product.variants) return product;
      const mapped = { ...product, variants: product.variants.map((v) => {
        const { price, ...rest } = v;
        return rest;
      }) };
      return mapped;
    });

    return NextResponse.json({
      products,
      pagination: { nextPageInfo, prevPageInfo },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
