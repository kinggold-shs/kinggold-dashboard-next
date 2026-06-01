import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../lib/shopify';

/** POST — add one product image by src URL */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const src = body?.src?.trim();
    if (!src) {
      return NextResponse.json({ error: 'src is required' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();
    const res = await fetch(`https://${domain}/admin/api/2024-10/products/${id}/images.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ image: { src } }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = typeof data.errors === 'object'
        ? JSON.stringify(data.errors)
        : (data.errors || 'Shopify API error');
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    const img = data.image;
    return NextResponse.json({
      image: img
        ? { id: String(img.id), url: img.src || img.url }
        : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
