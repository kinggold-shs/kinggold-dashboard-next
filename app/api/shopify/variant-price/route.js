import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { shopifyGraphql } from '../../../../lib/shopifyProductLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VARIANT_PRICE_QUERY = `
  query VariantPriceBySku($query: String!) {
    productVariants(first: 1, query: $query) {
      edges {
        node {
          id
          sku
          price
          metafields(namespace: "custom", first: 10) {
            edges { node { key value } }
          }
        }
      }
    }
  }
`;

/** Read-only diagnostic: current Shopify variant.price + gweb_* metafields for a SKU. */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = (searchParams.get('sku') ?? '').trim();
    if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });

    const { token, domain } = await getShopifyToken();
    const data = await shopifyGraphql(domain, token, VARIANT_PRICE_QUERY, { query: `sku:${sku}` });
    const variant = data?.productVariants?.edges?.[0]?.node;
    if (!variant) return NextResponse.json({ found: false });

    const metafields = {};
    for (const edge of variant.metafields?.edges || []) {
      metafields[edge.node.key] = edge.node.value;
    }

    return NextResponse.json({
      found: true,
      sku: variant.sku,
      price: variant.price,
      metafields,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
