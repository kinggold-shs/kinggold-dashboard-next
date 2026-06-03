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

/** Primary Shopify option dimensions for jewelry (first slots when both present). */
export const PRIMARY_OPTION_CATALOG = ['Karat', 'Size'];

const PRIMARY_OPTION_RANK = new Map(
  PRIMARY_OPTION_CATALOG.map((name, index) => [name.toLowerCase(), index]),
);

/** @param {string} name */
export function isPlaceholderOptionName(name) {
  return String(name || '').trim() === 'Title';
}

/** @param {string} value */
export function isPlaceholderOptionValue(value) {
  return String(value || '').trim() === 'Default Title';
}

/** @param {string} title */
export function isPlaceholderVariantTitle(title) {
  const t = String(title || '').trim();
  return !t || isPlaceholderOptionValue(t);
}

/**
 * UI label for variant title — never surfaces Shopify's "Default Title".
 * @param {{ title?: string, sku?: string, option1?: string, option2?: string, option3?: string } | null} variant
 * @param {string|number} mco
 * @param {boolean} [isMain]
 * @returns {string}
 */
export function displayVariantTitle(variant, mco, isMain = false) {
  if (!variant) return '';

  const raw = String(variant.title || '').trim();
  if (raw && !isPlaceholderOptionValue(raw)) return raw;

  if (isMain) {
    const sku = String(variant.sku || mco || '').trim();
    return sku || 'Main product';
  }

  const sku = String(variant.sku || '').trim();
  if (sku) return sku;

  const parts = OPTION_FIELDS
    .map(field => variant[field])
    .filter(v => v && !isPlaceholderOptionValue(v))
    .map(v => String(v).trim());
  if (parts.length) return parts.join(' / ');

  return '';
}

/**
 * @param {{ name?: string, values?: string[] }[]} options
 * @returns {{ name: string, values: string[] }[]}
 */
/**
 * @param {{ name?: string, values?: string[] }[]} types
 * @returns {{ name: string, values: string[] }[]}
 */
export function orderVariantTypes(types) {
  return (types || [])
    .map(t => ({
      name: String(t?.name || '').trim(),
      values: Array.isArray(t?.values) ? [...t.values] : [],
    }))
    .filter(t => t.name)
    .sort((a, b) => {
      const ra = PRIMARY_OPTION_RANK.get(a.name.toLowerCase());
      const rb = PRIMARY_OPTION_RANK.get(b.name.toLowerCase());
      const rankA = ra != null ? ra : PRIMARY_OPTION_CATALOG.length;
      const rankB = rb != null ? rb : PRIMARY_OPTION_CATALOG.length;
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 3);
}

export function filterOptionsForUi(options) {
  const filtered = (options || [])
    .filter(o => o?.name && String(o.name).trim() && !isPlaceholderOptionName(o.name))
    .map(o => ({
      name: String(o.name).trim(),
      values: (Array.isArray(o.values) ? o.values : [])
        .map(v => String(v))
        .filter(v => Boolean(v) && !isPlaceholderOptionValue(v)),
    }));
  return orderVariantTypes(filtered);
}

/**
 * @param {{ name?: string, values?: string[] }[] | { options?: { name?: string, values?: string[] }[] }} productOrOptions
 * @returns {boolean}
 */
export function isDefaultTitleOnlyOptions(productOrOptions) {
  const opts = Array.isArray(productOrOptions)
    ? productOrOptions
    : (productOrOptions?.options || []);
  if (!opts?.length || opts.length !== 1) return false;
  const opt = opts[0];
  const values = opt.values || [];
  return (
    isPlaceholderOptionName(opt.name)
    && values.length === 1
    && isPlaceholderOptionValue(values[0])
  );
}

/**
 * Shopify REST option1/2/3 index for an option name (uses product option position).
 * @param {{ name?: string, position?: number }[]} [shopifyOptions] full product.options from REST
 * @param {string} optionName
 * @returns {number} 0–2, or -1 when not found
 */
export function resolveOptionFieldIndex(shopifyOptions, optionName) {
  const name = String(optionName || '').trim();
  if (!name || !shopifyOptions?.length) return -1;

  const match = shopifyOptions.find(
    o => String(o?.name || '').trim() === name && !isPlaceholderOptionName(o.name),
  );
  if (!match) return -1;

  const pos = Number(match.position);
  if (Number.isFinite(pos) && pos >= 1 && pos <= 3) return pos - 1;

  const idx = shopifyOptions.indexOf(match);
  return idx >= 0 && idx < 3 ? idx : -1;
}

/**
 * @param {{ option1?: string, option2?: string, option3?: string }} variant
 * @param {{ name: string, values?: string[] }[]} optionTypes
 * @param {{ name?: string, position?: number, values?: string[] }[]} [shopifyOptions]
 * @returns {Record<string, string>}
 */
export function variantToOptionPayload(variant, optionTypes, shopifyOptions) {
  const selectedByName = {};
  const unassigned = OPTION_FIELDS
    .map(field => variant?.[field])
    .filter(value => value && !isPlaceholderOptionValue(value))
    .map(value => String(value).trim());

  (optionTypes || []).forEach((type, index) => {
    const allowed = new Set(
      (type.values || []).map(v => String(v).trim()).filter(Boolean),
    );
    if (!allowed.size) return;

    const fieldIndex = shopifyOptions?.length
      ? resolveOptionFieldIndex(shopifyOptions, type.name)
      : index;
    if (fieldIndex < 0) return;

    const slotValue = variant?.[OPTION_FIELDS[fieldIndex]];
    const slotStr = slotValue && !isPlaceholderOptionValue(slotValue)
      ? String(slotValue).trim()
      : null;

    let chosen = null;
    if (slotStr && allowed.has(slotStr)) {
      chosen = slotStr;
    } else {
      const matchIdx = unassigned.findIndex(v => allowed.has(v));
      if (matchIdx >= 0) chosen = unassigned[matchIdx];
    }

    if (!chosen) return;

    selectedByName[type.name] = chosen;
    const usedIdx = unassigned.indexOf(chosen);
    if (usedIdx >= 0) unassigned.splice(usedIdx, 1);
  });

  return selectedByName;
}

/**
 * @param {{ name: string }[]} optionTypes
 * @param {Record<string, string>} selectedByName
 * @param {{ name?: string, position?: number }[]} [shopifyOptions] full product.options (incl. position)
 */
export function optionValuesToRestPayload(optionTypes, selectedByName, shopifyOptions) {
  const payload = {};
  (optionTypes || []).forEach((type, index) => {
    const value = selectedByName?.[type.name];
    if (value == null || value === '') return;

    const fieldIndex = shopifyOptions?.length
      ? resolveOptionFieldIndex(shopifyOptions, type.name)
      : index;
    if (fieldIndex < 0 || fieldIndex > 2) return;

    payload[OPTION_FIELDS[fieldIndex]] = String(value);
  });
  return payload;
}

/**
 * @param {{ name: string }[]} optionTypes
 * @param {Record<string, string>} selectedByName
 * @param {{ name?: string, position?: number, values?: string[] }[]} shopifyOptions
 * @returns {string | null}
 */
export function validateOptionSelectionsAgainstProduct(
  optionTypes,
  selectedByName,
  shopifyOptions,
) {
  if (!shopifyOptions?.length) return null;

  for (const type of optionTypes || []) {
    const value = selectedByName?.[type.name];
    if (!value) continue;

    const fieldIndex = resolveOptionFieldIndex(shopifyOptions, type.name);
    if (fieldIndex < 0) {
      return `Option "${type.name}" is not on this Shopify product yet. Save variant types first, then try again.`;
    }

    const shopOpt = shopifyOptions.find(
      o => String(o?.name || '').trim() === type.name,
    );
    const allowed = new Set(
      (shopOpt?.values || []).map(v => String(v).trim()).filter(Boolean),
    );
    if (allowed.size && !allowed.has(String(value).trim())) {
      return `Value "${value}" for ${type.name} is not on Shopify yet. Save variant types to sync new values, then add the sub-variant.`;
    }
  }
  return null;
}

/**
 * @param {{ name?: string, values?: string[] }[] | { options?: { name?: string, values?: string[] }[] }} productOrOptions
 * @returns {{ name: string, values: string[] }[]}
 */
export function productOptionTypes(productOrOptions) {
  const opts = Array.isArray(productOrOptions)
    ? productOrOptions
    : (productOrOptions?.options || []);
  return filterOptionsForUi(opts);
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

/** @param {string} optionName */
export function isKaratOption(optionName) {
  return String(optionName || '').trim().toLowerCase() === 'karat';
}

/** @param {string} optionName */
export function isSizeOption(optionName) {
  return String(optionName || '').trim().toLowerCase() === 'size';
}

/** GWEB weight is not a customer-facing option dimension. */
export function isGwebWeightOptionName(optionName) {
  return String(optionName || '').trim().toLowerCase() === 'weight';
}

/** @param {{ name?: string }[]} types */
export function filterCustomerOptionTypes(types) {
  return (types || []).filter(t => !isGwebWeightOptionName(t.name));
}

/** @param {string} optionName */
export function isPrimaryCatalogOption(optionName) {
  return PRIMARY_OPTION_RANK.has(String(optionName || '').trim().toLowerCase());
}

/**
 * Options that may repeat across main and sub-variants (same physical item, different SKU).
 * Karat may match on main + subs; Size and other types must be unique per variant.
 * @param {string} optionName
 */
export function allowsSharedOptionValueAcrossVariants(optionName) {
  const n = String(optionName || '').trim().toLowerCase();
  return n === 'karat';
}

/**
 * Suggested types for a new jewelry product (Karat + Size, ordered for Shopify slots 1–2).
 * @param {string[]} [karatValues]
 * @returns {{ name: string, values: string[] }[]}
 */
export function defaultVariantTypesForNewProduct(karatValues = ['18K']) {
  return orderVariantTypes([
    { name: 'Karat', values: karatValues.filter(Boolean) },
    { name: 'Size', values: [] },
  ]);
}

/**
 * Union saved Shopify option catalogs with unsaved variant-type editor draft values.
 * @param {{ name: string, values?: string[] }[]} savedTypes
 * @param {{ name: string, values?: string[] }[]} draftTypes
 * @returns {{ name: string, values: string[] }[]}
 */
export function mergeOptionTypesCatalog(savedTypes, draftTypes) {
  const saved = filterOptionsForUi(Array.isArray(savedTypes) ? savedTypes : []);
  const draft = filterOptionsForUi(Array.isArray(draftTypes) ? draftTypes : []);
  if (!draft.length) return saved;

  const byKey = new Map();
  for (const t of saved) {
    byKey.set(t.name.toLowerCase(), { name: t.name, values: [...t.values] });
  }
  for (const t of draft) {
    const key = t.name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.values = [...new Set([...existing.values, ...t.values])];
    } else {
      byKey.set(key, { name: t.name, values: [...t.values] });
    }
  }

  const ordered = saved.map(t => byKey.get(t.name.toLowerCase())).filter(Boolean);
  for (const t of draft) {
    const key = t.name.toLowerCase();
    if (!saved.some(s => s.name.toLowerCase() === key)) {
      ordered.push(byKey.get(key));
    }
  }
  return orderVariantTypes(ordered);
}

/**
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string } | null} mainVariant
 * @returns {{ id?: number|string, option1?: string, option2?: string, option3?: string }[]}
 */
export function allVariantsForOptionScan(variants, mainVariant) {
  const byId = new Map();
  if (mainVariant?.id != null) {
    byId.set(Number(mainVariant.id), mainVariant);
  }
  for (const v of variants || []) {
    if (v?.id != null) {
      byId.set(Number(v.id), v);
    }
  }
  return [...byId.values()];
}

/**
 * Values already assigned for an option name across main + sub-variants.
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ id?: number|string } | null} mainVariant
 * @param {string} optionName
 * @param {{ name: string }[]} optionTypes
 * @param {number|string | null} [excludeVariantId] variant being edited (its values are not counted as used)
 * @returns {string[]}
 */
export function getUsedOptionValues(
  variants,
  mainVariant,
  optionName,
  optionTypes,
  excludeVariantId = null,
  shopifyOptions = null,
) {
  const used = [];
  const seen = new Set();
  for (const variant of allVariantsForOptionScan(variants, mainVariant)) {
    if (excludeVariantId != null && Number(variant.id) === Number(excludeVariantId)) {
      continue;
    }
    const payload = variantToOptionPayload(variant, optionTypes, shopifyOptions);
    const value = payload[optionName];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    used.push(value);
  }
  return used;
}

/**
 * @param {string[]} allValues
 * @param {string[]} usedValues
 * @param {string} [currentValue]
 * @returns {string[]}
 */
export function filterSelectableOptionValues(allValues, usedValues, currentValue = '') {
  const usedSet = new Set(usedValues || []);
  const current = String(currentValue || '').trim();
  return (allValues || []).filter(val => {
    if (current && val === current) return true;
    return !usedSet.has(val);
  });
}

/**
 * Product + variant-sourced values for one option type (for selects).
 * @param {{ name: string, values?: string[] }} type
 * @param {{ name?: string, values?: string[] }[]} [shopifyOptions]
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string }[]} [variants]
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string } | null} [mainVariant]
 * @returns {string[]}
 */
export function resolveOptionCatalogValues(type, shopifyOptions, variants, mainVariant) {
  const fromType = (type.values || []).map(v => String(v).trim()).filter(Boolean);
  if (fromType.length) return fromType;

  const shopOpt = (shopifyOptions || []).find(
    o => String(o?.name || '').trim() === String(type.name || '').trim(),
  );
  const fromShop = (shopOpt?.values || []).map(v => String(v).trim()).filter(Boolean);
  if (fromShop.length) return fromShop;

  const idx = resolveOptionFieldIndex(shopifyOptions, type.name);
  const seen = new Set();
  const fromVariants = [];
  for (const variant of allVariantsForOptionScan(variants, mainVariant)) {
    if (idx < 0) break;
    const raw = variant?.[OPTION_FIELDS[idx]];
    const v = raw && !isPlaceholderOptionValue(raw) ? String(raw).trim() : '';
    if (v && !seen.has(v)) {
      seen.add(v);
      fromVariants.push(v);
    }
  }
  return fromVariants;
}

/**
 * @param {object} params
 * @returns {{ selectableValues: string[], hint: string | null, disableSelect: boolean }}
 */
export function getOptionSelectUiState({
  typeName,
  catalogValues,
  variants,
  mainVariant,
  optionTypes,
  shopifyOptions,
  excludeVariantId,
  currentValue,
}) {
  const catalog = catalogValues || [];
  if (allowsSharedOptionValueAcrossVariants(typeName)) {
    return { selectableValues: catalog, hint: null, disableSelect: !catalog.length };
  }

  const usedValues = getUsedOptionValues(
    variants,
    mainVariant,
    typeName,
    optionTypes,
    excludeVariantId,
    shopifyOptions,
  );
  const selectableValues = filterSelectableOptionValues(
    catalog,
    usedValues,
    currentValue,
  );

  let hint = null;
  if (!catalog.length) {
    hint = `No ${typeName} values on this product. Add ${typeName} values in variant types above, save, then try again.`;
  } else if (!selectableValues.length) {
    hint = `Every ${typeName} value is already used by another variant. Add another ${typeName} value in variant types, save, then pick one here.`;
  }

  const disableSelect =
    !catalog.length || (!selectableValues.length && !allowsSharedOptionValueAcrossVariants(typeName));

  return {
    selectableValues,
    hint,
    disableSelect,
  };
}

/**
 * Enforces unique option values per variant for Size and other non-shared dimensions.
 * @param {{ name: string }[]} optionTypes
 * @param {Record<string, string>} selectedByName
 * @param {{ id?: number|string }[]} variants
 * @param {{ id?: number|string } | null} mainVariant
 * @param {{ excludeVariantId?: number|string | null }} [opts]
 * @returns {string | null}
 */
export function validateNonKaratOptionUniqueness(
  optionTypes,
  selectedByName,
  variants,
  mainVariant,
  { excludeVariantId = null, shopifyOptions = null } = {},
) {
  for (const type of optionTypes || []) {
    if (allowsSharedOptionValueAcrossVariants(type.name)) continue;
    const value = selectedByName?.[type.name];
    if (!value) continue;
    const used = getUsedOptionValues(
      variants,
      mainVariant,
      type.name,
      optionTypes,
      excludeVariantId,
      shopifyOptions,
    );
    if (used.includes(String(value))) {
      return `${type.name} value "${value}" is already used by another variant. Choose a different ${type.name}.`;
    }
  }
  return null;
}
