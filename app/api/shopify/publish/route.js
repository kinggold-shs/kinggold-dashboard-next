import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';

export async function POST(request) {
  try {
    const { title, body_html, product_type, price, sku, images } = await request.json();
    const { token, domain } = await getShopifyToken();

    const product = {
      product: {
        title,
        body_html,
        vendor: 'KingGold',
        product_type: product_type || 'Gold Jewelry',
        status: 'active',
        variants: [{
          price: String(Number(price).toFixed(2)),
          sku: String(sku),
          inventory_management: null,
        }],
        images: (images || []),
      },
    };

    const res = await fetch(`https://${domain}/admin/api/2024-10/products.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify(product),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Shopify API error');
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    return NextResponse.json({
      product: data.product,
      shopUrl: `https://${domain}/products/${data.product.handle}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
