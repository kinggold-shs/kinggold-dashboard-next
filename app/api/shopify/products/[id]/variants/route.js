import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../lib/shopify';
import { ensureProductOptionValuesForSelections } from '../../../../../../lib/shopifyVariantTypes';
import { fetchProductVariants } from '../../../../../../lib/variantGroupService';
import {
  applyVariantInventoryFromBody,
  bodyRequestsInventorySync,
  canAccessShopLocations,
  parseInventoryQuantityFromBody,
  restVariantInventoryFields,
} from '../../../../../../lib/shopifyInventory';
import {
  optionValuesToRestPayload,
  productOptionTypes,
  resolveOptionFieldIndex,
  validateOptionSelectionsAgainstProduct,
} from '../../../../../../lib/variantModel';

const OPTION_FIELDS = ['option1', 'option2', 'option3'];

/** Build selectedByName from request body using Shopify option positions (not UI index). */
function selectedByNameFromBody(body, shopifyOptions, optionTypes) {
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

/** POST — create a new variant on a product */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
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

    if (bodyRequestsInventorySync(body)) {
      const preflight = await canAccessShopLocations(domain, token);
      if (!preflight.ok) {
        return NextResponse.json({ error: preflight.error, code: preflight.code }, { status: 400 });
      }
    }

    const refreshed = await fetchProductVariants(domain, token, id);
    const freshOptions = refreshed?.options || shopifyOptions;
    const restOptions = optionValuesToRestPayload(
      optionTypes,
      selectedByName,
      freshOptions,
    );

    const variant = {};
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

    const created = data.variant;
    if (created?.id) {
      try {
        await applyVariantInventoryFromBody(domain, token, body, created.id);
      } catch (inventoryErr) {
        return NextResponse.json(
          { error: `Variant created but inventory sync failed: ${inventoryErr.message}` },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({ variant: created });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
