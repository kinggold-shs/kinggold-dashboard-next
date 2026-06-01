import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../../lib/shopify';

/** DELETE — remove one product image */
export async function DELETE(request, { params }) {
  try {
    const { id, imageId } = await params;
    const { token, domain } = await getShopifyToken();

    const res = await fetch(
      `https://${domain}/admin/api/2024-10/products/${id}/images/${imageId}.json`,
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
