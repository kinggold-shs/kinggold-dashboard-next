import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../lib/shopify';
import { reconcileProductVariantTypes } from '../../../../../../lib/shopifyVariantTypes';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const productId = String(id).trim();
    if (!productId) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    const body = await request.json();
    const types = body.types;
    const mco = body.mco != null ? String(body.mco) : undefined;

    if (!Array.isArray(types)) {
      return NextResponse.json({ error: 'types must be an array' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();

    try {
      const product = await reconcileProductVariantTypes(domain, token, productId, types, mco);
      return NextResponse.json({
        productId,
        options: product.options,
        variants: product.variants,
        productTitle: product.title,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return NextResponse.json({ error: err.message }, { status });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
