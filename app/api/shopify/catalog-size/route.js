import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { shopifyGraphql } from '../../../../lib/shopifyProductLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only diagnostic: how many products/variants are in the live Shopify
 * catalog. Nothing in the repo records this — needed to size the bulk
 * price-sync operation (does a full-catalog sweep fit inside one gold-rate
 * tick?) and confirm the Bulk Operations API is the right tool for it.
 */
const COUNT_QUERY = `
  query CatalogSize {
    productsCount { count }
    productVariantsCount { count }
  }
`;

export async function GET() {
  try {
    const { token, domain } = await getShopifyToken();
    const data = await shopifyGraphql(domain, token, COUNT_QUERY, {});
    return NextResponse.json({
      products: data?.productsCount?.count ?? null,
      variants: data?.productVariantsCount?.count ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
