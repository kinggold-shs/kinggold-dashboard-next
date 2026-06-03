import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import {
  applyVariantInventoryFromBody,
  parseInventoryQuantityFromBody,
  restVariantInventoryFields,
} from '../../../../lib/shopifyInventory';

export async function POST(request) {
  try {
    const body = await request.json();
    const { title, body_html, product_type, price, sku, images } = body;
    const { token, domain } = await getShopifyToken();

    const inventoryQty = parseInventoryQuantityFromBody(body);
    const variantFields = {
      price: String(Number(price).toFixed(2)),
      sku: String(sku),
      ...(inventoryQty != null
        ? restVariantInventoryFields(inventoryQty)
        : { inventory_management: null }),
    };

    const product = {
      product: {
        title,
        body_html,
        vendor: 'KingGold',
        product_type: product_type || 'Gold Jewelry',
        status: 'active',
        variants: [variantFields],
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

    const createdVariant = data.product?.variants?.[0];
    if (createdVariant?.id) {
      try {
        await applyVariantInventoryFromBody(domain, token, body, createdVariant.id);
      } catch (inventoryErr) {
        return NextResponse.json(
          { error: `Product published but inventory sync failed: ${inventoryErr.message}` },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      product: data.product,
      shopUrl: `https://${domain}/products/${data.product.handle}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
