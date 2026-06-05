import { TYPE_LABELS } from '../constants/fn6';
import { getPublicApiBaseUrl } from './publicEnv';
import { ensureProductOptionValuesForSelections } from './shopifyVariantTypes';
import {
  buildMetafieldGroups,
  findMainVariant,
  filterCustomerOptionTypes,
  isKaratOption,
  isPlaceholderOptionValue,
  optionValuesToRestPayload,
  productOptionTypes,
  resolveOptionCatalogValues,
  resolveOptionFieldIndex,
  slug,
  variantToOptionPayload,
} from './variantModel';
import {
  fetchProductVariants,
  fetchVariantCodeGroupsMetafield,
  saveVariantCodeGroupsMetafield,
} from './variantGroupService';

const OPTION_FIELDS = ['option1', 'option2', 'option3'];

async function fetchFn6ByMco(sku) {
  const normalizedSku = String(sku || '').trim();
  if (!normalizedSku) return { item: null, normalizedSku };

  const base = getPublicApiBaseUrl();
  const fn6Res = await fetch(
    `${base}/Sup/api/fn6/by-mco/${encodeURIComponent(normalizedSku)}/`,
  );

  if (fn6Res.status === 404) {
    return { item: null, normalizedSku };
  }

  if (!fn6Res.ok) {
    const text = await fn6Res.text().catch(() => '');
    throw new Error(`FN6 fetch failed: ${fn6Res.status}${text ? ` ${text}` : ''}`);
  }

  const item = await fn6Res.json();
  return { item, normalizedSku };
}

function karatLabelFromFn6(item) {
  if (!item) return null;
  const co = item.co;
  if (co == null || co === '') return null;
  return TYPE_LABELS[co] || `${co}K`;
}

function skuSuffixAfterMco(sku, mco) {
  const skuStr = String(sku || '').trim();
  const mcoStr = String(mco || '').trim();
  if (!skuStr || !mcoStr) return '';
  if (skuStr === mcoStr) return '';
  const prefix = `${mcoStr}-`;
  if (!skuStr.startsWith(prefix)) return null;
  let suffix = skuStr.slice(prefix.length);
  suffix = suffix.replace(/-\d+$/, '');
  return suffix;
}

function matchOptionValueFromSuffix(suffixSlug, catalogValues) {
  if (!suffixSlug) return null;
  const parts = suffixSlug.split('-').filter(Boolean);
  const partSet = new Set(parts);

  for (const value of catalogValues) {
    const valueSlug = slug(value);
    if (partSet.has(valueSlug)) return value;
  }

  for (const value of catalogValues) {
    const valueSlug = slug(value);
    if (suffixSlug === valueSlug || suffixSlug.endsWith(`-${valueSlug}`) || suffixSlug.startsWith(`${valueSlug}-`)) {
      return value;
    }
  }

  return null;
}

function variantNeedsRepair(variant, mainVariant, optionTypes, shopifyOptions, variants) {
  const current = variantToOptionPayload(variant, optionTypes, shopifyOptions);
  const isMain = mainVariant && Number(variant.id) === Number(mainVariant.id);

  for (const type of optionTypes) {
    if (current[type.name]) continue;

    const othersHave = (variants || []).some(v => {
      if (Number(v.id) === Number(variant.id)) return false;
      const sel = variantToOptionPayload(v, optionTypes, shopifyOptions);
      return Boolean(sel[type.name]);
    });

    const shopOpt = (shopifyOptions || []).find(
      o => String(o?.name || '').trim() === type.name,
    );
    const catalogHas = (shopOpt?.values || []).some(
      v => v && !isPlaceholderOptionValue(v),
    );

    if (!othersHave && !catalogHas) continue;

    if (isMain) {
      if (othersHave || catalogHas) return true;
    } else {
      const fieldIdx = resolveOptionFieldIndex(shopifyOptions, type.name);
      if (fieldIdx >= 1 || isKaratOption(type.name)) {
        return true;
      }
      if (fieldIdx === 0 && othersHave) return true;
    }
  }

  if (!isMain) {
    const rawOpt2 = variant?.option2;
    const opt2Empty = !rawOpt2 || isPlaceholderOptionValue(rawOpt2);
    if (opt2Empty) {
      const mainOpt2 = mainVariant?.option2;
      const mainHasOpt2 = mainOpt2 && !isPlaceholderOptionValue(mainOpt2);
      const othersHaveSize = (variants || []).some(v => {
        if (Number(v.id) === Number(variant.id)) return false;
        const o2 = v?.option2;
        return o2 && !isPlaceholderOptionValue(o2);
      });
      const hasSecondOption = (shopifyOptions || []).some(
        o => Number(o?.position) === 2 || resolveOptionFieldIndex(shopifyOptions, o?.name) === 1,
      );
      if (mainHasOpt2 || othersHaveSize || hasSecondOption) return true;
    }
  }

  return false;
}

async function buildRepairSelections(variant, mco, optionTypes, shopifyOptions, variants, mainVariant) {
  const sku = String(variant.sku || '').trim();
  const { item } = await fetchFn6ByMco(sku);
  if (!item) {
    return { error: `FN6 not found for SKU ${sku}` };
  }

  const selections = {};
  const customerTypes = filterCustomerOptionTypes(optionTypes);

  for (const type of customerTypes) {
    if (isKaratOption(type.name)) {
      const karat = karatLabelFromFn6(item);
      if (!karat) {
        return { error: `No karat (co) on FN6 for ${sku}` };
      }
      selections[type.name] = karat;
    }
  }

  const suffix = skuSuffixAfterMco(sku, mco);
  if (suffix === null) {
    return { error: `SKU ${sku} does not match main MCO pattern ${mco}-*` };
  }

  const nonKaratTypes = customerTypes.filter(t => !isKaratOption(t.name));
  for (const type of nonKaratTypes) {
    const catalogValues = resolveOptionCatalogValues(
      type,
      shopifyOptions,
      variants,
      mainVariant,
    );
    const matched = matchOptionValueFromSuffix(suffix, catalogValues);
    if (!matched) {
      return { error: `Could not resolve ${type.name} from SKU ${sku} (suffix: ${suffix || '(none)'})` };
    }
    selections[type.name] = matched;
  }

  return { selections };
}

async function updateShopifyVariantOptions(domain, token, productId, variantId, optionTypes, selectedByName, shopifyOptions) {
  await ensureProductOptionValuesForSelections(domain, token, productId, selectedByName);

  const refreshed = await fetchProductVariants(domain, token, productId);
  const freshOptions = refreshed?.options || shopifyOptions;
  const restOptions = optionValuesToRestPayload(optionTypes, selectedByName, freshOptions);

  const variant = { id: Number(variantId) };
  for (const field of OPTION_FIELDS) {
    if (restOptions[field] !== undefined) {
      variant[field] = restOptions[field];
    }
  }

  const res = await fetch(`https://${domain}/admin/api/2024-10/variants/${variantId}.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ variant }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data.errors === 'object'
      ? JSON.stringify(data.errors)
      : (data.errors || 'Shopify API error');
    throw new Error(errMsg);
  }

  return data.variant;
}

/**
 * Repair broken variant option assignments for a Shopify product.
 * @param {object} params
 * @param {string} params.domain
 * @param {string} params.token
 * @param {string|number} params.productId
 * @param {string|number} params.mco
 * @param {boolean} [params.dryRun=true]
 */
export async function repairProductVariantOptions({
  domain,
  token,
  productId,
  mco,
  dryRun = true,
}) {
  const product = await fetchProductVariants(domain, token, productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const variants = product.variants || [];
  const shopifyOptions = product.options || [];
  const optionTypes = filterCustomerOptionTypes(productOptionTypes(shopifyOptions));
  const mainVariant = findMainVariant(variants, mco);

  if (variants.length < 2) {
    return {
      dryRun,
      repaired: [],
      skipped: [],
      errors: [],
      message: 'Product has fewer than 2 variants — nothing to repair.',
    };
  }

  const repaired = [];
  const skipped = [];
  const errors = [];

  const candidates = variants.filter(v =>
    variantNeedsRepair(v, mainVariant, optionTypes, shopifyOptions, variants),
  );

  for (const variant of candidates) {
    const before = variantToOptionPayload(variant, optionTypes, shopifyOptions);

    try {
      const built = await buildRepairSelections(
        variant,
        mco,
        optionTypes,
        shopifyOptions,
        variants,
        mainVariant,
      );

      if (built.error) {
        skipped.push({
          variantId: variant.id,
          sku: variant.sku,
          reason: built.error,
          before,
        });
        continue;
      }

      const selections = built.selections;
      const entry = {
        variantId: variant.id,
        sku: variant.sku,
        before,
        after: selections,
      };

      if (!dryRun) {
        await updateShopifyVariantOptions(
          domain,
          token,
          productId,
          variant.id,
          optionTypes,
          selections,
          shopifyOptions,
        );
        entry.applied = true;
      }

      repaired.push(entry);
    } catch (err) {
      errors.push({
        variantId: variant.id,
        sku: variant.sku,
        error: err.message || 'Repair failed',
      });
    }
  }

  if (!dryRun && repaired.length > 0) {
    try {
      const refreshed = await fetchProductVariants(domain, token, productId);
      const main = findMainVariant(refreshed.variants, mco);
      const subs = (refreshed.variants || []).filter(
        v => !main || Number(v.id) !== Number(main.id),
      );
      const payload = buildMetafieldGroups(main, subs);
      const { metafieldId } = await fetchVariantCodeGroupsMetafield(domain, token, productId);
      await saveVariantCodeGroupsMetafield(domain, token, productId, payload, metafieldId);
    } catch (err) {
      errors.push({
        variantId: null,
        sku: null,
        error: `Variant groups metafield sync failed: ${err.message}`,
      });
    }
  }

  return { dryRun, repaired, skipped, errors };
}
