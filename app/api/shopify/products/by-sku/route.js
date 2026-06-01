import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../lib/shopify';

const QUERY = `
  query ProductBySku($query: String!) {
    productVariants(first: 1, query: $query) {
      edges {
        node {
          id
          price
          sku
          product {
            id
            title
            status
            bodyHtml
            productType
            handle
            images(first: 20) {
              edges {
                node {
                  id
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`;

function gidToNumericId(gid) {
  if (!gid) return null;
  const parts = String(gid).split('/');
  return parts[parts.length - 1] || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku')?.trim();
    if (!sku) {
      return NextResponse.json({ error: 'sku is required' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();

    const res = await fetch(`https://${domain}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { query: `sku:${sku}` },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.errors?.[0]?.message || 'Shopify GraphQL error' },
        { status: res.status },
      );
    }

    if (data.errors?.length) {
      return NextResponse.json({ error: data.errors[0].message }, { status: 400 });
    }

    const variant = data.data?.productVariants?.edges?.[0]?.node;
    if (!variant?.product) {
      return NextResponse.json({ found: false });
    }

    const product = variant.product;
    const productId = gidToNumericId(product.id);
    const variantId = gidToNumericId(variant.id);
    const images = (product.images?.edges || []).map(({ node }) => ({
      id: gidToNumericId(node.id),
      url: node.url,
    }));

    return NextResponse.json({
      found: true,
      productId,
      variantId,
      title: product.title,
      status: product.status?.toLowerCase() || 'active',
      product_type: product.productType || '',
      price: variant.price,
      body_html: product.bodyHtml || '',
      images,
      shopUrl: product.handle ? `https://${domain}/products/${product.handle}` : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
