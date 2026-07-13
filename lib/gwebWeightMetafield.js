/**
 * GWEB per-item data on Shopify variants — metafields, not product options.
 * Written by refreshVariantPrice / codeChainService; read by the live-price
 * theme JS to compute 18K prices locally.
 *
 * Definitions:
 *   custom.gweb_weight     (single_line_text_field, e.g. "4.91g")
 *   custom.gweb_prc        (number_decimal, EGP extra/making charge)
 *   custom.gweb_prcus      (number_decimal, USD extra/making charge)
 *   custom.gweb_pr18_used  (number_decimal, the pr18 rate the current
 *                           variant.price was actually computed from —
 *                           written atomically with the price so the two
 *                           can never disagree)
 */

export const GWEBMETA_NAMESPACE = 'custom';

export const GWEB_WEIGHT_METAFIELD_KEY = 'gweb_weight';
export const GWEB_WEIGHT_METAFIELD_TYPE = 'single_line_text_field';

export const GWEB_PRC_METAFIELD_KEY = 'gweb_prc';
export const GWEB_PRC_METAFIELD_TYPE = 'number_decimal';

export const GWEB_PRCUS_METAFIELD_KEY = 'gweb_prcus';
export const GWEB_PRCUS_METAFIELD_TYPE = 'number_decimal';

export const GWEB_PR18_USED_METAFIELD_KEY = 'gweb_pr18_used';
export const GWEB_PR18_USED_METAFIELD_TYPE = 'number_decimal';

/** Display string written to Shopify and returned by refresh-price (e.g. 4.91g). */
export function formatGwebWeightDisplay(goCr) {
  if (goCr == null || goCr === '') return null;
  const n = Number(goCr);
  if (!Number.isFinite(n)) return null;
  return `${n.toFixed(2)}g`;
}

function normalizeWeightToken(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const match = raw.match(/^([\d.]+)g?$/);
  if (!match) return raw;
  const num = Number(match[1]);
  return Number.isFinite(num) ? `${num.toFixed(2)}g` : raw;
}

export function gwebWeightValuesMatch(a, b) {
  if (a == null || a === '' || b == null || b === '') {
    return String(a ?? '') === String(b ?? '');
  }
  return normalizeWeightToken(a) === normalizeWeightToken(b);
}

/** Fetch all custom.gweb_* metafields for a variant. Returns map of {key: value}. */
export async function fetchVariantGwebMetafields(domain, token, variantId) {
  const res = await fetch(
    `https://${domain}/admin/api/2024-10/variants/${variantId}/metafields.json`,
    { headers: { 'X-Shopify-Access-Token': token } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data.errors === 'object'
      ? JSON.stringify(data.errors)
      : (data.errors || 'Failed to load variant metafields');
    throw new Error(errMsg);
  }
  const out = {};
  for (const m of data.metafields || []) {
    if (m.namespace === GWEBMETA_NAMESPACE) {
      out[m.key] = m.value != null ? String(m.value) : null;
    }
  }
  return out;
}

/** Legacy weight metafield lookup (kept for backward compat). */
export async function fetchVariantGwebWeightMetafield(domain, token, variantId) {
  const all = await fetchVariantGwebMetafields(domain, token, variantId);
  return {
    metafieldId: null,
    value: all[GWEB_WEIGHT_METAFIELD_KEY] ?? null,
  };
}

async function findMetafieldId(domain, token, variantId, key) {
  const res = await fetch(
    `https://${domain}/admin/api/2024-10/variants/${variantId}/metafields.json`,
    { headers: { 'X-Shopify-Access-Token': token } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const found = (data.metafields || []).find(
    (m) => m.namespace === GWEBMETA_NAMESPACE && m.key === key,
  );
  return found?.id ?? null;
}

/** Upsert a single custom.* metafield on a variant. */
export async function upsertVariantMetafield(domain, token, variantId, key, type, value) {
  if (value == null || value === '') return { updated: false };
  const stringValue = String(value);
  const metafieldId = await findMetafieldId(domain, token, variantId, key);
  const metafieldBody = {
    namespace: GWEBMETA_NAMESPACE,
    key,
    type,
    value: stringValue,
  };
  if (metafieldId) {
    const res = await fetch(
      `https://${domain}/admin/api/2024-10/metafields/${metafieldId}.json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ metafield: metafieldBody }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || `Failed to update ${key}`);
      throw new Error(errMsg);
    }
    return { updated: true };
  }
  const res = await fetch(
    `https://${domain}/admin/api/2024-10/variants/${variantId}/metafields.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        metafield: { ...metafieldBody, owner_resource: 'variant', owner_id: Number(variantId) },
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || `Failed to create ${key}`);
    throw new Error(errMsg);
  }
  return { updated: true };
}

/**
 * @returns {Promise<{ updated: boolean }>}
 */
export async function upsertVariantGwebWeightMetafield(domain, token, variantId, weightDisplay) {
  if (!weightDisplay) return { updated: false };
  const current = (await fetchVariantGwebMetafields(domain, token, variantId))[GWEB_WEIGHT_METAFIELD_KEY] ?? null;
  if (gwebWeightValuesMatch(current, weightDisplay)) return { updated: false };
  return upsertVariantMetafield(domain, token, variantId, GWEB_WEIGHT_METAFIELD_KEY, GWEB_WEIGHT_METAFIELD_TYPE, weightDisplay);
}

/** Upsert the EGP extra-charge metafield (gweb_prc). */
export async function upsertVariantGwebPrcMetafield(domain, token, variantId, prc) {
  if (prc == null || prc === '' || Number(prc) === 0) return { updated: false };
  return upsertVariantMetafield(domain, token, variantId, GWEB_PRC_METAFIELD_KEY, GWEB_PRC_METAFIELD_TYPE, prc);
}

/** Upsert the USD extra-charge metafield (gweb_prcus). */
export async function upsertVariantGwebPrcusMetafield(domain, token, variantId, prcus) {
  if (prcus == null || prcus === '' || Number(prcus) === 0) return { updated: false };
  return upsertVariantMetafield(domain, token, variantId, GWEB_PRCUS_METAFIELD_KEY, GWEB_PRCUS_METAFIELD_TYPE, prcus);
}

/** Upsert the pr18 rate that produced the current variant.price (gweb_pr18_used). */
export async function upsertVariantGwebPr18UsedMetafield(domain, token, variantId, pr18) {
  if (pr18 == null || pr18 === '' || !(Number(pr18) > 0)) return { updated: false };
  return upsertVariantMetafield(domain, token, variantId, GWEB_PR18_USED_METAFIELD_KEY, GWEB_PR18_USED_METAFIELD_TYPE, pr18);
}
