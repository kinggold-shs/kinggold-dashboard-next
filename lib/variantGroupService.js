/** @typedef {{ mainVariantId: number, mainSku: string, subVariantIds: number[], subSkus: string[] }} VariantCodeGroup */
/** @typedef {{ version: number, updatedAt: string, groups: VariantCodeGroup[] }} VariantCodeGroupsPayload */

export const VARIANT_CODE_GROUPS_VERSION = 1;
export const VARIANT_CODE_GROUPS_NAMESPACE = 'custom';
export const VARIANT_CODE_GROUPS_KEY = 'variant_code_groups';
export const VARIANT_CODE_GROUPS_METAFIELD_TYPE = 'json';

const EMPTY_PAYLOAD = () => ({
  version: VARIANT_CODE_GROUPS_VERSION,
  updatedAt: new Date().toISOString(),
  groups: [],
});

/** @param {unknown} raw */
export function parseVariantCodeGroups(raw) {
  if (raw == null || raw === '') return EMPTY_PAYLOAD();
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Invalid variant_code_groups JSON');
    }
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('variant_code_groups must be an object');
  }
  const version = Number(data.version) || VARIANT_CODE_GROUPS_VERSION;
  const groups = Array.isArray(data.groups) ? data.groups.map(normalizeGroup) : [];
  return {
    version,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    groups,
  };
}

/** @param {unknown} group */
function normalizeGroup(group) {
  const g = group && typeof group === 'object' ? group : {};
  const subVariantIds = Array.isArray(g.subVariantIds)
    ? g.subVariantIds.map(id => Number(id)).filter(id => Number.isFinite(id))
    : [];
  const subSkus = Array.isArray(g.subSkus) ? g.subSkus.map(s => String(s)) : [];
  return {
    mainVariantId: Number(g.mainVariantId) || 0,
    mainSku: String(g.mainSku || ''),
    subVariantIds,
    subSkus: subSkus.length ? subSkus : subVariantIds.map(() => ''),
  };
}

/**
 * @param {VariantCodeGroupsPayload} payload
 * @param {{ id: number|string, sku?: string }[]} productVariants
 */
export function validateVariantCodeGroups(payload, productVariants) {
  const errors = [];
  const variantById = new Map(
    productVariants.map(v => [Number(v.id), v]),
  );
  const variantIds = new Set(variantById.keys());
  const usedIds = new Set();

  if (!payload || typeof payload !== 'object') {
    return ['Payload is required'];
  }
  if (!Array.isArray(payload.groups)) {
    return ['groups must be an array'];
  }

  if (payload.groups.length === 0) {
    return [];
  }

  payload.groups.forEach((group, index) => {
    const label = `Group ${index + 1}`;
    const mainId = Number(group.mainVariantId);
    if (!mainId || !variantIds.has(mainId)) {
      errors.push(`${label}: main variant must belong to this product`);
    }
    if (usedIds.has(mainId)) {
      errors.push(`${label}: duplicate variant id ${mainId}`);
    }
    usedIds.add(mainId);

    const subs = group.subVariantIds || [];
    if (!subs.length) {
      errors.push(`${label}: at least one sub variant is required`);
    }
    subs.forEach((subId, subIndex) => {
      const sid = Number(subId);
      if (!sid || !variantIds.has(sid)) {
        errors.push(`${label}: sub variant ${subIndex + 1} must belong to this product`);
      }
      if (sid === mainId) {
        errors.push(`${label}: sub variant cannot equal main variant`);
      }
      if (usedIds.has(sid)) {
        errors.push(`${label}: duplicate variant id ${sid}`);
      }
      usedIds.add(sid);
    });

    const mainVariant = variantById.get(mainId);
    if (mainVariant && group.mainSku && String(mainVariant.sku || '') !== String(group.mainSku)) {
      errors.push(`${label}: mainSku does not match Shopify variant SKU`);
    }
  });

  return errors;
}

/** @param {VariantCodeGroupsPayload} payload */
export function serializeVariantCodeGroups(payload) {
  const groups = (payload.groups || []).map(g => ({
    mainVariantId: Number(g.mainVariantId),
    mainSku: String(g.mainSku || ''),
    subVariantIds: (g.subVariantIds || []).map(id => Number(id)),
    subSkus: (g.subSkus || []).map(s => String(s)),
  }));
  return {
    version: VARIANT_CODE_GROUPS_VERSION,
    updatedAt: new Date().toISOString(),
    groups,
  };
}

/** @param {{ name?: string }[]} productOptions */
function mapRestVariant(variant, productOptions) {
  const optionFields = ['option1', 'option2', 'option3'];
  const selectedOptions = optionFields
    .map((field, index) => {
      const value = variant[field];
      if (!value) return null;
      return {
        name: productOptions[index]?.name || `Option ${index + 1}`,
        value: String(value),
      };
    })
    .filter(Boolean);

  return {
    id: Number(variant.id),
    sku: variant.sku || '',
    title: variant.title || '',
    price: variant.price,
    selectedOptions,
    option1: variant.option1 || '',
    option2: variant.option2 || '',
    option3: variant.option3 || '',
  };
}

export async function fetchProductVariants(domain, token, productId) {
  const res = await fetch(`https://${domain}/admin/api/2024-10/products/${productId}.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(
      typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Failed to load product'),
    );
  }

  const product = data?.product;
  if (!product) return null;

  const productOptions = Array.isArray(product.options) ? product.options : [];
  const variants = (product.variants || []).map(v => mapRestVariant(v, productOptions));
  return { title: product.title, variants, options: productOptions };
}

export async function fetchVariantCodeGroupsMetafield(domain, token, productId) {
  const res = await fetch(`https://${domain}/admin/api/2024-10/products/${productId}/metafields.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Failed to load metafield'),
    );
  }

  const metafield = (data.metafields || []).find(
    m => m.namespace === VARIANT_CODE_GROUPS_NAMESPACE && m.key === VARIANT_CODE_GROUPS_KEY,
  );
  if (!metafield) {
    return { metafieldId: null, payload: EMPTY_PAYLOAD() };
  }
  return {
    metafieldId: metafield.id,
    payload: parseVariantCodeGroups(metafield.value),
  };
}

export async function saveVariantCodeGroupsMetafield(domain, token, productId, payload, existingMetafieldId = null) {
  const body = JSON.stringify(serializeVariantCodeGroups(payload));
  const metafieldBody = {
    namespace: VARIANT_CODE_GROUPS_NAMESPACE,
    key: VARIANT_CODE_GROUPS_KEY,
    type: VARIANT_CODE_GROUPS_METAFIELD_TYPE,
    value: body,
  };

  if (existingMetafieldId) {
    const res = await fetch(`https://${domain}/admin/api/2024-10/metafields/${existingMetafieldId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ metafield: metafieldBody }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Failed to update metafield'),
      );
    }
    return parseVariantCodeGroups(data.metafield?.value);
  }

  const res = await fetch(`https://${domain}/admin/api/2024-10/products/${productId}/metafields.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      metafield: {
        ...metafieldBody,
        owner_resource: 'product',
        owner_id: productId,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Failed to create metafield'),
    );
  }
  return parseVariantCodeGroups(data.metafield?.value);
}
