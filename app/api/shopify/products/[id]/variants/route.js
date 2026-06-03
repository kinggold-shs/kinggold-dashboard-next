import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../lib/shopify';

/** POST — create a new variant on a product */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { token, domain } = await getShopifyToken();

    const variant = {};
    if (body.sku !== undefined) variant.sku = String(body.sku);
    if (body.price !== undefined) variant.price = String(Number(body.price).toFixed(2));
    if (body.option1 !== undefined) variant.option1 = String(body.option1);
    if (body.option2 !== undefined) variant.option2 = String(body.option2);
    if (body.option3 !== undefined) variant.option3 = String(body.option3);

    const res = await fetch(`https://${domain}/admin/api/2024-10/products/${id}/variants.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ variant }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = typeof data.errors === 'object'
        ? JSON.stringify(data.errors)
        : (data.errors || 'Shopify API error');
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    return NextResponse.json({ variant: data.variant });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
