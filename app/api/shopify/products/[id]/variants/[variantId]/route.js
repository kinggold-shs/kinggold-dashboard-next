import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../../lib/shopify';

/** PUT — update sku, price, option1/2/3 */
export async function PUT(request, { params }) {
  try {
    const { variantId } = await params;
    const body = await request.json();
    const { token, domain } = await getShopifyToken();

    const variant = { id: Number(variantId) };
    if (body.sku !== undefined) variant.sku = String(body.sku);
    if (body.price !== undefined) variant.price = String(Number(body.price).toFixed(2));
    if (body.option1 !== undefined) variant.option1 = String(body.option1);
    if (body.option2 !== undefined) variant.option2 = String(body.option2);
    if (body.option3 !== undefined) variant.option3 = String(body.option3);

    const res = await fetch(`https://${domain}/admin/api/2024-10/variants/${variantId}.json`, {
      method: 'PUT',
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

/** DELETE — remove a single variant */
export async function DELETE(request, { params }) {
  try {
    const { id, variantId } = await params;
    const { token, domain } = await getShopifyToken();

    const res = await fetch(
      `https://${domain}/admin/api/2024-10/products/${id}/variants/${variantId}.json`,
      {
        method: 'DELETE',
        headers: { 'X-Shopify-Access-Token': token },
      },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = typeof data.errors === 'object'
        ? JSON.stringify(data.errors)
        : (data.errors || 'Shopify API error');
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
