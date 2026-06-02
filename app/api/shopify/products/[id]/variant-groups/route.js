import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../lib/shopify';
import { shopifyGraphql } from '../../../../../../lib/shopifyProductLookup';
import {
  fetchProductVariants,
  fetchVariantCodeGroupsMetafield,
  parseVariantCodeGroups,
  saveVariantCodeGroupsMetafield,
  validateVariantCodeGroups,
} from '../../../../../../lib/variantGroupService';

async function loadProductContext(domain, token, productId) {
  const product = await fetchProductVariants(domain, token, productId, shopifyGraphql);
  if (!product) {
    return { error: 'Product not found', status: 404 };
  }
  return { product };
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const productId = String(id).trim();
    if (!productId) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();
    const ctx = await loadProductContext(domain, token, productId);
    if (ctx.error) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const { metafieldId, payload } = await fetchVariantCodeGroupsMetafield(domain, token, productId);

    return NextResponse.json({
      productId,
      metafieldId,
      variantCodeGroups: payload,
      variants: ctx.product.variants,
      productTitle: ctx.product.title,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const productId = String(id).trim();
    if (!productId) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    const body = await request.json();
    const incoming = body.variantCodeGroups ?? body;
    let payload;
    try {
      payload = parseVariantCodeGroups(incoming);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();
    const ctx = await loadProductContext(domain, token, productId);
    if (ctx.error) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const validationErrors = validateVariantCodeGroups(payload, ctx.product.variants);
    if (validationErrors.length) {
      return NextResponse.json({ error: validationErrors.join('; ') }, { status: 400 });
    }

    const { metafieldId } = await fetchVariantCodeGroupsMetafield(domain, token, productId);
    const saved = await saveVariantCodeGroupsMetafield(
      domain,
      token,
      productId,
      payload,
      metafieldId,
    );

    return NextResponse.json({
      productId,
      variantCodeGroups: saved,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
