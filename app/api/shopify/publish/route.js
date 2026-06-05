import { NextResponse } from 'next/server';
import { refreshVariantPrice } from '../../../../lib/refreshVariantPrice';
import { getShopifyToken } from '../../../../lib/shopify';
import {
  applyVariantInventoryFromBody,
  parseInventoryQuantityFromBody,
  restVariantInventoryFields,
} from '../../../../lib/shopifyInventory';

export async function POST(request) {
  try {
    const body = await request.json();
    const { title, body_html, product_type, price, sku, images, vendor, tags, collectionIds } = body;
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
        vendor: vendor || 'KingGold',
        tags: tags || '',
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

    if (sku) {
      try {
        await refreshVariantPrice(String(sku));
      } catch {
        // publish succeeded; live GWEB sync is best-effort
      }
    }

    const collectWarnings = [];
    const productId = data.product?.id;
    if (productId && Array.isArray(collectionIds) && collectionIds.length > 0) {
      for (const collectionId of collectionIds) {
        const cid = Number(collectionId);
        if (!cid) continue;
        try {
          const collectRes = await fetch(`https://${domain}/admin/api/2024-10/collects.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': token,
            },
            body: JSON.stringify({
              collect: { product_id: productId, collection_id: cid },
            }),
          });
          if (!collectRes.ok) {
            const collectData = await collectRes.json().catch(() => ({}));
            const errMsg = typeof collectData.errors === 'object'
              ? JSON.stringify(collectData.errors)
              : (collectData.errors || `HTTP ${collectRes.status}`);
            collectWarnings.push(`collection ${cid}: ${errMsg}`);
          }
        } catch (collectErr) {
          collectWarnings.push(`collection ${cid}: ${collectErr.message}`);
        }
      }
    }

    return NextResponse.json({
      product: data.product,
      shopUrl: `https://${domain}/products/${data.product.handle}`,
      ...(collectWarnings.length > 0 ? { collectWarnings } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
