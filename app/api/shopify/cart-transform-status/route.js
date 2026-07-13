import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { shopifyGraphql } from '../../../../lib/shopifyProductLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only diagnostic: is the kg-cart-price cart_transform Function
 * actually registered/active on this shop? Determines whether checkout
 * prices are computed live (via the Function reading shop.pr18 +
 * variant weight/prc metafields) or fall back to the variant's stored
 * base price (which only updates when something explicitly refreshes it).
 */
const CART_TRANSFORMS_QUERY = `
  query CartTransformStatus {
    cartTransforms(first: 10) {
      nodes {
        id
        functionId
        blockOnFailure
      }
    }
  }
`;

export async function GET() {
  try {
    const { token, domain } = await getShopifyToken();
    const data = await shopifyGraphql(domain, token, CART_TRANSFORMS_QUERY, {});
    const nodes = data?.cartTransforms?.nodes || [];
    return NextResponse.json({ active: nodes.length > 0, cartTransforms: nodes });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
