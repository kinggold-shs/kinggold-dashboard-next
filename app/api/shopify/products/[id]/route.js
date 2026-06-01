import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../lib/shopify';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { token, domain } = await getShopifyToken();

    const update = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.body_html !== undefined) update.body_html = body.body_html;
    if (body.product_type !== undefined) update.product_type = body.product_type;
    if (body.status !== undefined) update.status = body.status;
    if (body.images !== undefined) {
      update.images = body.images;
    }

    if (body.price !== undefined) {
      const variantPayload = {
        price: String(Number(body.price).toFixed(2)),
      };
      if (body.variant_id != null) {
        variantPayload.id = Number(body.variant_id);
      }
      update.variants = [variantPayload];
    }

    const res = await fetch(`https://${domain}/admin/api/2024-10/products/${id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ product: update }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Shopify API error');
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    return NextResponse.json({ product: data.product });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { token, domain } = await getShopifyToken();

    const res = await fetch(`https://${domain}/admin/api/2024-10/products/${id}.json`, {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.errors || 'Shopify API error' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
