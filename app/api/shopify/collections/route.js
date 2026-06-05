import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';

export async function GET() {
  try {
    const { token, domain } = await getShopifyToken();

    const res = await fetch(
      `https://${domain}/admin/api/2024-10/custom_collections.json?limit=250`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );

    const data = await res.json();

    if (!res.ok) {
      const errMsg = typeof data.errors === 'object'
        ? JSON.stringify(data.errors)
        : (data.errors || 'Shopify API error');
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    const collections = (data.custom_collections || []).map(c => ({
      id: c.id,
      title: c.title,
    }));

    return NextResponse.json({ collections });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
