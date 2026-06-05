import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../../lib/shopify';
import { ensureProductOptionValuesForSelections } from '../../../../../../../lib/shopifyVariantTypes';
import { fetchProductVariants } from '../../../../../../../lib/variantGroupService';
import {
  applyVariantInventoryFromBody,
  parseInventoryQuantityFromBody,
  restVariantInventoryFields,
} from '../../../../../../../lib/shopifyInventory';
import {
  optionValuesToRestPayload,
  productOptionTypes,
  resolveOptionFieldIndex,
  validateOptionSelectionsAgainstProduct,
} from '../../../../../../../lib/variantModel';

const OPTION_FIELDS = ['option1', 'option2', 'option3'];

function selectedByNameFromBody(body, shopifyOptions, optionTypes) {
  if (body.selections && typeof body.selections === 'object') {
    const selectedByName = {};
    for (const type of optionTypes) {
      const raw = body.selections[type.name];
      if (raw != null && String(raw).trim()) {
        selectedByName[type.name] = String(raw).trim();
      }
    }
    return selectedByName;
  }

  const selectedByName = {};
  for (const type of optionTypes) {
    const idx = resolveOptionFieldIndex(shopifyOptions, type.name);
    if (idx < 0) continue;
    const raw = body[OPTION_FIELDS[idx]];
    if (raw != null && String(raw).trim()) {
      selectedByName[type.name] = String(raw).trim();
    }
  }
  return selectedByName;
}

/** PUT — update sku, price, option1/2/3 */
export async function PUT(request, { params }) {
  try {
    const { id, variantId } = await params;
    const body = await request.json();
    const { token, domain } = await getShopifyToken();

    const product = await fetchProductVariants(domain, token, id);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const shopifyOptions = product.options || [];
    const optionTypes = productOptionTypes(shopifyOptions);
    const selectedByName = selectedByNameFromBody(body, shopifyOptions, optionTypes);

    const validationError = validateOptionSelectionsAgainstProduct(
      optionTypes,
      selectedByName,
      shopifyOptions,
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await ensureProductOptionValuesForSelections(domain, token, id, selectedByName);

    const refreshed = await fetchProductVariants(domain, token, id);
    const freshOptions = refreshed?.options || shopifyOptions;
    const restOptions = optionValuesToRestPayload(
      optionTypes,
      selectedByName,
      freshOptions,
    );

    const variant = { id: Number(variantId) };
    if (body.sku !== undefined) variant.sku = String(body.sku);
    if (body.price !== undefined) variant.price = String(Number(body.price).toFixed(2));
    const inventoryQty = parseInventoryQuantityFromBody(body);
    if (inventoryQty != null) {
      Object.assign(variant, restVariantInventoryFields(inventoryQty));
    }
    for (const field of OPTION_FIELDS) {
      if (restOptions[field] !== undefined) {
        variant[field] = restOptions[field];
      }
    }

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

    const updated = data.variant;
    if (updated?.id) {
      try {
        await applyVariantInventoryFromBody(domain, token, body, updated.id);
      } catch (inventoryErr) {
        return NextResponse.json(
          { error: `Variant updated but inventory sync failed: ${inventoryErr.message}` },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({ variant: updated });
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
