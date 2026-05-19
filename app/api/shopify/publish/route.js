import { NextResponse } from 'next/server';

async function getShopifyToken(domain, clientId, clientSecret) {
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token fetch failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

export async function POST(request) {
  try {
    const { title, body_html, product_type, price, sku, images } = await request.json();

    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!domain || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Shopify not configured. Add SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET to environment variables.' },
        { status: 500 }
      );
    }

    const token = await getShopifyToken(domain, clientId, clientSecret);

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

    const res = await fetch(
      `https://${domain}/admin/api/2024-10/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify(product),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      const errMsg = typeof data.errors === 'object'
        ? JSON.stringify(data.errors)
        : (data.errors || 'Shopify API error');
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
