import { NextResponse } from 'next/server';
import { cleanupAllProductVariantDiscriminators } from '../../../../../lib/cleanupVariantDiscriminators';
import { getShopifyToken } from '../../../../../lib/shopify';

/** POST — dry-run or apply cleanup of legacy Code-option / ·SKU-suffix discriminators
 *  Body: { dryRun: boolean }  (default: true)
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;

    const { token, domain } = await getShopifyToken();
    const result = await cleanupAllProductVariantDiscriminators({ domain, token, dryRun });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
