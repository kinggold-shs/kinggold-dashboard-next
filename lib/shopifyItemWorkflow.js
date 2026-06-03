import { mergeToBodyHtml } from './fn6Spec';

export const PRODUCT_TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Chain', 'Pendant', 'Bangle', 'Other'];

export async function parseApiJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 100);
    throw new Error(
      `Shopify API returned non-JSON (${res.status}). `
        + 'Ensure /api/shopify routes are served by Next (not a static SPA). '
        + (preview ? `Body: ${preview}` : ''),
    );
  }
}

export function shopifyLookupUrl(item) {
  const params = new URLSearchParams({ sku: String(item.mco) });
  if (item.idis?.trim()) params.set('title', item.idis.trim());
  return `/api/shopify/products/by-sku?${params}`;
}

export async function fetchShopifyProducts(pageInfo = '', limit = 20) {
  const url = pageInfo
    ? `/api/shopify/products?limit=${limit}&page_info=${encodeURIComponent(pageInfo)}`
    : `/api/shopify/products?limit=${limit}`;
  const res = await fetch(url);
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to fetch products');
  return data;
}

export async function lookupShopifyProduct(item) {
  const res = await fetch(shopifyLookupUrl(item));
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || `Failed to check Shopify (HTTP ${res.status})`);
  return data;
}

export async function publishShopifyItem(payload) {
  const res = await fetch('/api/shopify/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to publish');
  return data;
}

export async function updateShopifyItem(productId, payload) {
  const res = await fetch(`/api/shopify/products/${productId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to update');
  return data;
}

export async function removeShopifyItem(productId) {
  const res = await fetch(`/api/shopify/products/${encodeURIComponent(String(productId))}`, {
    method: 'DELETE',
  });
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to delete');
  return data;
}

export async function addShopifyProductImage(productId, src) {
  const res = await fetch(`/api/shopify/products/${encodeURIComponent(String(productId))}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src }),
  });
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to add image');
  return data;
}

export async function removeShopifyProductImage(productId, imageId) {
  const res = await fetch(
    `/api/shopify/products/${encodeURIComponent(String(productId))}/images/${encodeURIComponent(String(imageId))}`,
    { method: 'DELETE' },
  );
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to delete image');
  return data;
}

export async function fetchVariantGroups(productId) {
  const res = await fetch(`/api/shopify/products/${encodeURIComponent(String(productId))}/variant-groups`);
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to load variant groups');
  return data;
}

export async function saveVariantGroups(productId, variantCodeGroups) {
  const res = await fetch(`/api/shopify/products/${encodeURIComponent(String(productId))}/variant-groups`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantCodeGroups }),
  });
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to save variant groups');
  return data;
}

export async function createShopifyVariant(productId, variantData) {
  const res = await fetch(`/api/shopify/products/${encodeURIComponent(String(productId))}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(variantData),
  });
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to create variant');
  return data;
}

export async function updateShopifyVariant(productId, variantId, variantData) {
  const res = await fetch(
    `/api/shopify/products/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variantData),
    },
  );
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to update variant');
  return data;
}

export async function deleteShopifyVariant(productId, variantId) {
  const res = await fetch(
    `/api/shopify/products/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}`,
    { method: 'DELETE' },
  );
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to delete variant');
  return data;
}

export async function fetchVariantOptionSuggestions() {
  const res = await fetch('/api/shopify/variant-options');
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to load variant option suggestions');
  return data;
}

export async function updateProductVariantTypes(productId, { types, mco }) {
  const res = await fetch(
    `/api/shopify/products/${encodeURIComponent(String(productId))}/variant-types`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ types, mco }),
    },
  );
  const data = await parseApiJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to update variant types');
  return data;
}

export function buildPublishPayload({
  title,
  description,
  spec,
  productType,
  price,
  status,
  sku,
  imageUrls,
}) {
  return {
    title,
    body_html: mergeToBodyHtml(description, spec),
    product_type: productType,
    price,
    status,
    sku: String(sku),
    images: imageUrls.map(src => ({ src })),
  };
}
