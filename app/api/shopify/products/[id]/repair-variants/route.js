import { NextResponse } from 'next/server';
import { repairProductVariantOptions } from '../../../../../../lib/repairVariantOptions';
import { getShopifyToken } from '../../../../../../lib/shopify';

/** POST — dry-run or apply variant option repairs */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const productId = String(id).trim();
    if (!productId) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const mco = body.mco != null ? String(body.mco).trim() : '';
    if (!mco) {
      return NextResponse.json({ error: 'mco is required in request body' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();
    const result = await repairProductVariantOptions({
      domain,
      token,
      productId,
      mco,
      dryRun,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
