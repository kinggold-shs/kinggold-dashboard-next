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

/** Default Karat value preset when adding the Karat type (user may change). */
export const DEFAULT_KARAT_PRESET = ['18K'];

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

  const skuForStrip = String(variant.sku || '').trim();
  const parts = OPTION_FIELDS
    .map(field => variant[field])
    .filter(v => v && !isPlaceholderOptionValue(v))
    .map(v => stripShopifyOnlyOptionSuffix(String(v).trim(), skuForStrip));
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
      values: normalizeOptionValuesForUi(Array.isArray(o.values) ? o.values : []),
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
  const variantSku = String(variant?.sku || '').trim();
  const unassigned = OPTION_FIELDS
    .map(field => variant?.[field])
    .filter(value => value && !isPlaceholderOptionValue(value))
    .map(value => stripShopifyOnlyOptionSuffix(String(value).trim(), variantSku));

  (optionTypes || []).forEach((type, index) => {
    const allowed = new Set(
      (type.values || [])
        .map(v => stripShopifyOnlyOptionSuffix(String(v).trim()))
        .filter(Boolean),
    );

    const fieldIndex = shopifyOptions?.length
      ? resolveOptionFieldIndex(shopifyOptions, type.name)
      : index;
    if (fieldIndex < 0) return;

    const slotValue = variant?.[OPTION_FIELDS[fieldIndex]];
    const slotStr = slotValue && !isPlaceholderOptionValue(slotValue)
      ? String(slotValue).trim()
      : null;

    let chosen = null;
    if (slotStr) {
      chosen = slotStr;
    } else if (allowed.size) {
      const matchIdx = unassigned.findIndex(v => allowed.has(v));
      if (matchIdx >= 0) chosen = unassigned[matchIdx];
    }

    if (!chosen) return;

    chosen = stripShopifyOnlyOptionSuffix(chosen, variantSku);
    selectedByName[type.name] = chosen;
    const usedIdx = unassigned.indexOf(chosen);
    if (usedIdx >= 0) unassigned.splice(usedIdx, 1);
  });

  return selectedByName;
}

/**
 * Option values assigned on variant slots, keyed by option type name.
 * @param {{ option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ name?: string, position?: number }[]} shopifyOptions
 * @param {{ name: string }[]} [optionTypes]
 * @returns {Map<string, Set<string>>}
 */
export function collectOptionValuesFromVariants(variants, shopifyOptions, optionTypes) {
  const byName = new Map();
  const types = optionTypes?.length
    ? optionTypes
    : (shopifyOptions || [])
      .map(o => ({ name: String(o?.name || '').trim() }))
      .filter(t => t.name && !isPlaceholderOptionName(t.name));

  for (const type of types) {
    const idx = resolveOptionFieldIndex(shopifyOptions, type.name);
    if (idx < 0) continue;
    const field = OPTION_FIELDS[idx];
    const seen = byName.get(type.name) || new Set();
    for (const variant of variants || []) {
      const raw = variant?.[field];
      const v = raw && !isPlaceholderOptionValue(raw)
        ? stripOptionValueForDisplay(String(raw).trim(), variant?.sku)
        : '';
      if (v) seen.add(v);
    }
    if (seen.size) byName.set(type.name, seen);
  }
  return byName;
}

/**
 * Union live variant slot values into each type's values list (prevents orphaning assignments).
 * @param {{ name: string, values?: string[] }[]} types
 * @param {{ option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ name?: string, position?: number }[]} shopifyOptions
 * @returns {{ name: string, values: string[] }[]}
 */
export function unionVariantTypesWithLiveValues(types, variants, shopifyOptions) {
  const live = collectOptionValuesFromVariants(variants, shopifyOptions, types);
  const expanded = (types || []).map(t => {
    const extra = live.get(t.name);
    if (!extra?.size) {
      const displayValues = normalizeOptionValuesForUi(t.values || []);
      return displayValues.length !== (t.values || []).length
        ? { ...t, values: displayValues }
        : t;
    }
    return {
      ...t,
      values: normalizeOptionValuesForUi([...(t.values || []), ...extra]),
    };
  });
  return orderVariantTypes(expanded);
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
    const displayValue = stripShopifyOnlyOptionSuffix(String(value).trim());
    const allowed = new Set(
      (shopOpt?.values || [])
        .map(v => stripShopifyOnlyOptionSuffix(String(v).trim()))
        .filter(Boolean),
    );
    if (allowed.size && !allowed.has(displayValue)) {
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

/**
 * @param {string} optionName
 * @param {{ shopifyOptions?: { name?: string, position?: number }[] }} [opts]
 */
export function isSizeOption(optionName, { shopifyOptions } = {}) {
  const normalized = String(optionName || '').trim().toLowerCase();
  if (normalized === 'size' || normalized.includes('size')) {
    return true;
  }

  if (shopifyOptions?.length) {
    const fieldIndex = resolveOptionFieldIndex(shopifyOptions, optionName);
    if (fieldIndex === 1) {
      const opt1 = shopifyOptions.find(o => {
        const pos = Number(o?.position);
        return Number.isFinite(pos) && pos === 1;
      }) || shopifyOptions[0];
      if (isKaratOption(opt1?.name)) return true;
    }
  }

  return false;
}

/** GWEB weight is not a customer-facing option dimension. */
export function isGwebWeightOptionName(optionName) {
  return String(optionName || '').trim().toLowerCase() === 'weight';
}

/** Auto-assigned Shopify option3 when duplicate combos need a slot (<3 customer types). */
export const SUB_VARIANT_DISCRIMINATOR_OPTION = 'Code';

/** Shopify-only suffix on the last customer option when all 3 slots are in use. */
export const SUB_VARIANT_VALUE_SUFFIX_SEP = '·';

/** @param {string} optionName */
export function isSubVariantDiscriminatorOption(optionName) {
  return String(optionName || '').trim().toLowerCase() === SUB_VARIANT_DISCRIMINATOR_OPTION.toLowerCase();
}

/** @param {{ name?: string }[]} types */
export function filterCustomerOptionTypes(types) {
  return (types || []).filter(
    t => !isGwebWeightOptionName(t.name) && !isSubVariantDiscriminatorOption(t.name),
  );
}

/** @param {string} optionName */
export function isPrimaryCatalogOption(optionName) {
  return PRIMARY_OPTION_RANK.has(String(optionName || '').trim().toLowerCase());
}

/**
 * Customer-facing options may repeat across main and sub-variants (duplicate combos use Code/SKU suffix).
 * @param {string} optionName
 * @param {{ name?: string, position?: number }[]} [_shopifyOptions]
 */
export function allowsSharedOptionValueAcrossVariants(optionName, _shopifyOptions) {
  if (isGwebWeightOptionName(optionName) || isSubVariantDiscriminatorOption(optionName)) {
    return false;
  }
  return true;
}

/**
 * @param {string} storedValue
 * @param {string} [sku]
 * @returns {string}
 */
export function stripShopifyOnlyOptionSuffix(storedValue, sku) {
  const val = String(storedValue || '').trim();
  if (!val) return val;

  const skuStr = String(sku || '').trim();
  if (skuStr) {
    const suffix = `${SUB_VARIANT_VALUE_SUFFIX_SEP}${skuStr}`;
    if (val.endsWith(suffix)) {
      return val.slice(0, -suffix.length);
    }
  }

  const sepIdx = val.lastIndexOf(SUB_VARIANT_VALUE_SUFFIX_SEP);
  if (sepIdx > 0) {
    const suffixPart = val.slice(sepIdx + SUB_VARIANT_VALUE_SUFFIX_SEP.length);
    if (suffixPart) {
      return val.slice(0, sepIdx);
    }
  }

  return val;
}

/** @param {string} storedValue @param {string} [sku] */
export function stripOptionValueForDisplay(storedValue, sku) {
  return stripShopifyOnlyOptionSuffix(storedValue, sku);
}

/**
 * Strip suffixes and dedupe (e.g. keep `3.070` when `3.070·86000021` also exists).
 * @param {string[]} values
 * @param {string} [sku]
 * @returns {string[]}
 */
export function normalizeOptionValuesForUi(values, sku) {
  const seen = new Set();
  const out = [];
  for (const raw of values || []) {
    const base = stripOptionValueForDisplay(String(raw).trim(), sku);
    if (!base || isPlaceholderOptionValue(base) || seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out;
}

/**
 * @param {{ name?: string, position?: number }[]} shopifyOptions
 * @returns {{ karat: { name: string } | null, size: { name: string } | null }}
 */
function primaryOptionDefs(shopifyOptions) {
  const opts = shopifyOptions || [];
  return {
    karat: opts.find(o => isKaratOption(o.name)) || null,
    size: opts.find(o => isSizeOption(o.name, { shopifyOptions: opts })) || null,
  };
}

/**
 * Karat + Size combo key (legacy; prefer customerOptionComboKey).
 * @param {Record<string, string>} selectedByName
 * @param {{ name?: string, position?: number }[]} shopifyOptions
 * @returns {string}
 */
export function primaryOptionComboKey(selectedByName, shopifyOptions) {
  const { karat, size } = primaryOptionDefs(shopifyOptions);
  const k = karat ? String(selectedByName?.[karat.name] || '').trim() : '';
  const s = size ? String(selectedByName?.[size.name] || '').trim() : '';
  if (!k && !s) return '';
  return `${k}\0${s}`;
}

/**
 * Full customer-option combo key for duplicate detection (Shopify requires unique option1/2/3).
 * @param {Record<string, string>} selectedByName
 * @param {{ name: string }[]} optionTypes
 * @param {{ name?: string, position?: number }[]} [_shopifyOptions]
 * @returns {string}
 */
export function customerOptionComboKey(selectedByName, optionTypes, _shopifyOptions) {
  const customerTypes = filterCustomerOptionTypes(optionTypes);
  const parts = customerTypes.map(
    t => String(selectedByName?.[t.name] || '').trim(),
  );
  if (!parts.length || parts.every(p => !p)) return '';
  return parts.join('\0');
}

/**
 * @param {{ option1?: string, option2?: string, option3?: string }} variant
 * @param {{ name: string }[]} optionTypes
 * @param {{ name?: string, position?: number }[]} shopifyOptions
 * @returns {string}
 */
export function variantPrimaryOptionComboKey(variant, optionTypes, shopifyOptions) {
  const payload = variantToOptionPayload(variant, optionTypes, shopifyOptions);
  return primaryOptionComboKey(payload, shopifyOptions);
}

/**
 * True when another variant already uses the same Karat + Size selection.
 * @param {Record<string, string>} selectedByName
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ name?: string, position?: number }[]} shopifyOptions
 * @param {{ name: string }[]} optionTypes
 * @param {number|string | null} [excludeVariantId]
 * @returns {boolean}
 */
export function hasDuplicatePrimaryOptionCombo(
  selectedByName,
  variants,
  shopifyOptions,
  optionTypes,
  excludeVariantId = null,
) {
  return hasDuplicateCustomerOptionCombo(
    selectedByName,
    variants,
    shopifyOptions,
    optionTypes,
    excludeVariantId,
  );
}

/**
 * True when another variant already uses the same customer-option selection combo.
 * @param {Record<string, string>} selectedByName
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ name?: string, position?: number }[]} shopifyOptions
 * @param {{ name: string }[]} optionTypes
 * @param {number|string | null} [excludeVariantId]
 * @returns {boolean}
 */
export function hasDuplicateCustomerOptionCombo(
  selectedByName,
  variants,
  shopifyOptions,
  optionTypes,
  excludeVariantId = null,
) {
  const targetKey = customerOptionComboKey(selectedByName, optionTypes, shopifyOptions);
  if (!targetKey) return false;

  for (const variant of variants || []) {
    if (excludeVariantId != null && Number(variant.id) === Number(excludeVariantId)) {
      continue;
    }
    const payload = variantToOptionPayload(variant, optionTypes, shopifyOptions);
    if (customerOptionComboKey(payload, optionTypes, shopifyOptions) === targetKey) {
      return true;
    }
  }
  return false;
}

/**
 * Suggested types for a new jewelry product (Karat + Size, ordered for Shopify slots 1–2).
 * @param {string[]} [karatValues]
 * @returns {{ name: string, values: string[] }[]}
 */
export function defaultVariantTypesForNewProduct(karatValues = DEFAULT_KARAT_PRESET) {
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
 * When `precedingSelections` is provided (all preceding types filled in), only counts
 * values from variants whose preceding types match — so the same last-type value can
 * appear with a different preceding combination (e.g. different size, same weight).
 * @param {{ id?: number|string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ id?: number|string } | null} mainVariant
 * @param {string} optionName
 * @param {{ name: string }[]} optionTypes
 * @param {number|string | null} [excludeVariantId]
 * @param {{ name?: string }[] | null} [shopifyOptions]
 * @param {Record<string, string> | null} [precedingSelections] current values of all preceding types
 * @returns {string[]}
 */
export function getUsedOptionValues(
  variants,
  mainVariant,
  optionName,
  optionTypes,
  excludeVariantId = null,
  shopifyOptions = null,
  precedingSelections = null,
) {
  const used = [];
  const seen = new Set();
  const precedingTypes = precedingSelections != null
    ? (optionTypes || []).filter(t => t.name !== optionName)
    : [];

  for (const variant of allVariantsForOptionScan(variants, mainVariant)) {
    if (excludeVariantId != null && Number(variant.id) === Number(excludeVariantId)) {
      continue;
    }
    const payload = variantToOptionPayload(variant, optionTypes, shopifyOptions);

    // Context-aware filtering: skip variants whose preceding types differ from the current selection.
    if (precedingSelections != null && precedingTypes.length > 0) {
      const hasMismatch = precedingTypes.some(t => {
        const existingRaw = payload[t.name];
        const selectedRaw = precedingSelections[t.name];
        if (!existingRaw || !selectedRaw) return false;
        return stripOptionValueForDisplay(String(existingRaw).trim()).toLowerCase()
          !== stripOptionValueForDisplay(String(selectedRaw).trim()).toLowerCase();
      });
      if (hasMismatch) continue;
    }

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
  const fromType = normalizeOptionValuesForUi(type.values || []);
  if (fromType.length) return fromType;

  const shopOpt = (shopifyOptions || []).find(
    o => String(o?.name || '').trim() === String(type.name || '').trim(),
  );
  const fromShop = normalizeOptionValuesForUi(shopOpt?.values || []);
  if (fromShop.length) return fromShop;

  const idx = resolveOptionFieldIndex(shopifyOptions, type.name);
  const fromVariants = [];
  for (const variant of allVariantsForOptionScan(variants, mainVariant)) {
    if (idx < 0) break;
    const raw = variant?.[OPTION_FIELDS[idx]];
    const v = raw && !isPlaceholderOptionValue(raw)
      ? stripOptionValueForDisplay(String(raw).trim(), variant?.sku)
      : '';
    if (v && !fromVariants.includes(v)) {
      fromVariants.push(v);
    }
  }
  return fromVariants;
}

/**
 * @param {object} params
 * @returns {{ selectableValues: string[], displayValue: string, hint: string | null, disableSelect: boolean }}
 */
export function getOptionSelectUiState({
  typeName,
  catalogValues,
  currentValue = '',
  variantSku = '',
}) {
  const selectableValues = normalizeOptionValuesForUi(catalogValues || []);
  const displayValue = currentValue
    ? stripOptionValueForDisplay(String(currentValue).trim(), variantSku)
    : '';
  let hint = null;
  if (!selectableValues.length) {
    hint = `No ${typeName} values on this product. Add ${typeName} values in variant types above, save, then try again.`;
  }
  return {
    selectableValues,
    displayValue,
    hint,
    disableSelect: !selectableValues.length,
  };
}

/**
 * No-op: client does not restrict variant option combinations beyond Shopify's own
 * native uniqueness check (which fires when all 3 option slots produce an exact duplicate).
 * Kept as a stub so call sites compile unchanged.
 * @returns {null}
 */
// eslint-disable-next-line no-unused-vars
export function validateLastOptionUniqueness(_optionTypes, _selectedByName, _variants, _mainVariant, _opts) {
  return null;
}

/**
 * @deprecated Use validateLastOptionUniqueness instead.
 * @type {typeof validateLastOptionUniqueness}
 */
export const validateNonKaratOptionUniqueness = validateLastOptionUniqueness;
