import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { canAccessShopLocations } from '../../../../lib/shopifyInventory';

/** GET — verify read_locations (and at least one location) before GWEB inventory sync */
export async function GET() {
  try {
    const { token, domain } = await getShopifyToken();
    const result = await canAccessShopLocations(domain, token);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.error },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      locationCount: result.locationCount,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
