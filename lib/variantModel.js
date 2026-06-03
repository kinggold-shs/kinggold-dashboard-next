import { slugifyHandle } from './shopifyProductLookup';

/** @param {string} value */
export function slug(value) {
  return slugifyHandle(value);
}

/**
 * @param {{ id: number|string, sku?: string }[]} variants
 * @param {string|number} mco
 */
export function findMainVariant(variants, mco) {
  const mcoStr = String(mco);
  const match = (variants || []).find(v => String(v.sku) === mcoStr);
  return match || (variants || [])[0] || null;
}

/**
 * @param {string|number} mco
 * @param {string[]} optionValues ordered by option position
 * @param {string[]} existingSkus
 */
export function deriveSubSku(mco, optionValues, existingSkus) {
  const joined = (optionValues || []).filter(Boolean).join('-');
  const slugPart = slug(joined);
  const base = slugPart ? `${mco}-${slugPart}` : String(mco);
  const reserved = new Set((existingSkus || []).map(s => String(s)).filter(Boolean));
  if (!reserved.has(base)) return base;
  let n = 2;
  while (reserved.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const OPTION_FIELDS = ['option1', 'option2', 'option3'];

/**
 * @param {{ option1?: string, option2?: string, option3?: string }} variant
 * @param {{ name: string, values?: string[] }[]} optionTypes
 * @returns {Record<string, string>}
 */
export function variantToOptionPayload(variant, optionTypes) {
  const selectedByName = {};
  (optionTypes || []).forEach((type, index) => {
    const value = variant?.[OPTION_FIELDS[index]];
    if (value) selectedByName[type.name] = String(value);
  });
  return selectedByName;
}

/**
 * @param {{ name: string }[]} optionTypes
 * @param {Record<string, string>} selectedByName
 */
export function optionValuesToRestPayload(optionTypes, selectedByName) {
  const payload = {};
  (optionTypes || []).forEach((type, index) => {
    const value = selectedByName?.[type.name];
    payload[OPTION_FIELDS[index]] = value != null && value !== '' ? String(value) : '';
  });
  return payload;
}

/**
 * @param {{ name?: string, values?: string[] }[] | { options?: { name?: string, values?: string[] }[] }} productOrOptions
 * @returns {{ name: string, values: string[] }[]}
 */
export function productOptionTypes(productOrOptions) {
  const opts = Array.isArray(productOrOptions)
    ? productOrOptions
    : (productOrOptions?.options || []);
  return opts
    .filter(o => o?.name && String(o.name).trim())
    .slice(0, 3)
    .map(o => ({
      name: String(o.name).trim(),
      values: (Array.isArray(o.values) ? o.values : [])
        .map(v => String(v))
        .filter(Boolean),
    }));
}

/**
 * @param {{ id: number|string, sku?: string }} main
 * @param {{ id: number|string, sku?: string }[]} subs
 */
export function buildMetafieldGroups(main, subs) {
  if (!main || !subs?.length) {
    return { groups: [] };
  }
  return {
    groups: [{
      mainVariantId: Number(main.id),
      mainSku: String(main.sku || ''),
      subVariantIds: subs.map(v => Number(v.id)),
      subSkus: subs.map(v => String(v.sku || '')),
    }],
  };
}
