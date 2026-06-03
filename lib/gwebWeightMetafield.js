/**
 * GWEB weight (`go_cr`) on Shopify variants — metafield, not a product option.
 * Definition: namespace `custom`, key `gweb_weight`, type single_line_text_field (e.g. "4.91g").
 */

export const GWEB_WEIGHT_METAFIELD_NAMESPACE = 'custom';
export const GWEB_WEIGHT_METAFIELD_KEY = 'gweb_weight';
export const GWEB_WEIGHT_METAFIELD_TYPE = 'single_line_text_field';

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

export async function fetchVariantGwebWeightMetafield(domain, token, variantId) {
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

  const metafield = (data.metafields || []).find(
    m => m.namespace === GWEB_WEIGHT_METAFIELD_NAMESPACE
      && m.key === GWEB_WEIGHT_METAFIELD_KEY,
  );
  return {
    metafieldId: metafield?.id ?? null,
    value: metafield?.value != null ? String(metafield.value) : null,
  };
}

/**
 * @returns {Promise<{ updated: boolean }>}
 */
export async function upsertVariantGwebWeightMetafield(domain, token, variantId, weightDisplay) {
  const value = String(weightDisplay || '').trim();
  if (!value) return { updated: false };

  const { metafieldId, value: current } = await fetchVariantGwebWeightMetafield(
    domain,
    token,
    variantId,
  );

  if (gwebWeightValuesMatch(current, value)) {
    return { updated: false };
  }

  const metafieldBody = {
    namespace: GWEB_WEIGHT_METAFIELD_NAMESPACE,
    key: GWEB_WEIGHT_METAFIELD_KEY,
    type: GWEB_WEIGHT_METAFIELD_TYPE,
    value,
  };

  if (metafieldId) {
    const res = await fetch(
      `https://${domain}/admin/api/2024-10/metafields/${metafieldId}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ metafield: metafieldBody }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = typeof data.errors === 'object'
        ? JSON.stringify(data.errors)
        : (data.errors || 'Failed to update gweb_weight metafield');
      throw new Error(errMsg);
    }
    return { updated: true };
  }

  const res = await fetch(
    `https://${domain}/admin/api/2024-10/variants/${variantId}/metafields.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        metafield: {
          ...metafieldBody,
          owner_resource: 'variant',
          owner_id: Number(variantId),
        },
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data.errors === 'object'
      ? JSON.stringify(data.errors)
      : (data.errors || 'Failed to create gweb_weight metafield');
    throw new Error(errMsg);
  }
  return { updated: true };
}
