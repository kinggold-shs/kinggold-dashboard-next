/** @param {string} gid */
export function gidToNumericId(gid) {
  if (!gid) return null;
  const parts = String(gid).split('/');
  return parts[parts.length - 1] || null;
}

/** Collect image URLs from Shopify GraphQL product (images + media). */
export function extractProductImages(product) {
  const urls = new Map();

  for (const { node } of product.images?.edges || []) {
    if (node?.url) urls.set(node.url, { id: gidToNumericId(node.id), url: node.url });
  }

  for (const { node } of product.media?.edges || []) {
    const url = node?.image?.url || node?.preview?.image?.url;
    if (url) urls.set(url, { id: gidToNumericId(node.id), url });
  }

  return Array.from(urls.values());
}

const VARIANT_QUERY = `
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
            descriptionHtml
            productType
            handle
            images(first: 20) {
              edges { node { id url } }
            }
            media(first: 20) {
              edges {
                node {
                  id
                  ... on MediaImage {
                    image { url }
                  }
                }
              }
            }
            variants(first: 1) {
              edges { node { id price sku inventoryQuantity inventoryItem { tracked } } }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_SEARCH_QUERY = `
  query ProductSearch($query: String!) {
    products(first: 1, query: $query) {
      edges {
        node {
          id
          title
          status
          descriptionHtml
          productType
          handle
          images(first: 20) {
            edges { node { id url } }
          }
          media(first: 20) {
            edges {
              node {
                id
                ... on MediaImage {
                  image { url }
                }
              }
            }
          }
          variants(first: 10) {
            edges { node { id price sku inventoryQuantity inventoryItem { tracked } } }
          }
        }
      }
    }
  }
`;

export async function shopifyGraphql(domain, token, query, variables) {
  const res = await fetch(`https://${domain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(data.errors[0].message);
  }
  return data.data;
}

export function slugifyHandle(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function variantInventoryFields(variant) {
  const tracked = variant.inventoryItem?.tracked === true;
  const qty = variant.inventoryQuantity;
  return {
    inventory_quantity: qty != null ? Number(qty) : null,
    inventory_tracked: tracked,
  };
}

function packFromVariant(variant) {
  const product = variant.product;
  return {
    found: true,
    productId: gidToNumericId(product.id),
    variantId: gidToNumericId(variant.id),
    title: product.title,
    status: product.status?.toLowerCase() || 'active',
    product_type: product.productType || '',
    price: variant.price,
    ...variantInventoryFields(variant),
    body_html: product.descriptionHtml || '',
    images: extractProductImages(product),
    handle: product.handle,
    matchedBy: 'variant',
  };
}

function packFromProduct(product, preferredSku) {
  const variants = product.variants?.edges || [];
  let variant = variants[0]?.node;
  if (preferredSku) {
    const match = variants.find(({ node }) => String(node.sku) === String(preferredSku));
    if (match) variant = match.node;
  }
  return {
    found: true,
    productId: gidToNumericId(product.id),
    variantId: variant ? gidToNumericId(variant.id) : null,
    title: product.title,
    status: product.status?.toLowerCase() || 'active',
    product_type: product.productType || '',
    price: variant?.price ?? null,
    ...(variant ? variantInventoryFields(variant) : { inventory_quantity: null, inventory_tracked: false }),
    body_html: product.descriptionHtml || '',
    images: extractProductImages(product),
    handle: product.handle,
    matchedBy: 'product_search',
  };
}

/**
 * Find a Shopify product by inventory code / title (multiple search strategies).
 */
export async function findShopifyProduct(domain, token, { sku, title, handle }) {
  const variantQueries = [
    `sku:${sku}`,
    `sku:"${sku}"`,
    `barcode:${sku}`,
    `barcode:"${sku}"`,
  ];

  for (const q of variantQueries) {
    const data = await shopifyGraphql(domain, token, VARIANT_QUERY, { query: q });
    const variant = data?.productVariants?.edges?.[0]?.node;
    if (variant?.product) return packFromVariant(variant);
  }

  const titleTrim = title?.trim() || '';
  const slug = titleTrim ? slugifyHandle(titleTrim) : '';
  const productQueries = new Set([
    sku,
    `sku:${sku}`,
    titleTrim ? `title:"${titleTrim}"` : null,
    titleTrim ? `title:*${titleTrim.split(/\s+/)[0]}*` : null,
    handle?.trim() ? `handle:${handle.trim()}` : null,
    slug ? `handle:${slug}` : null,
  ].filter(Boolean));

  for (const q of productQueries) {
    const data = await shopifyGraphql(domain, token, PRODUCT_SEARCH_QUERY, { query: q });
    const product = data?.products?.edges?.[0]?.node;
    if (product) return packFromProduct(product, sku);
  }

  return { found: false };
}
