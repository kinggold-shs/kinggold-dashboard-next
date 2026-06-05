import { NextResponse } from 'next/server';
import { repairAllProductVariantOptions } from '../../../../../lib/repairVariantOptions';
import { getShopifyToken } from '../../../../../lib/shopify';

/** POST — dry-run or apply variant option repairs for all published products */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;

    const { token, domain } = await getShopifyToken();
    const result = await repairAllProductVariantOptions({
      domain,
      token,
      dryRun,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
