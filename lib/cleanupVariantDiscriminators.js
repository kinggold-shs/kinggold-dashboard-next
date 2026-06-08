/**
 * One-time cleanup utility to remove the synthetic Code-option / ·SKU-suffix workaround
 * that was added to variants to satisfy Shopify's uniqueness requirement before the
 * per-level uniqueness rule was implemented.
 *
 * Two legacy patterns:
 *  (A) Suffix products  — 3 real customer option types; last option stored as `base·SKU`.
 *      Safe to auto-clean when all stripped last-values are still unique across the product.
 *  (B) Code products    — 2 real types + a synthetic "Code" option3 holding the SKU.
 *      Cannot be auto-removed without potentially merging distinct variants; these are
 *      reported as "manual migration needed" so the operator can add a real 3rd type.
 */
import { getPublicApiBaseUrl } from './publicEnv';
import {
  filterCustomerOptionTypes,
  findMainVariant,
  isSubVariantDiscriminatorOption,
  normalizeOptionValuesForUi,
  optionValuesToRestPayload,
  productOptionTypes,
  stripOptionValueForDisplay,
  SUB_VARIANT_VALUE_SUFFIX_SEP,
  variantToOptionPayload,
} from './variantModel';
import { fetchProductVariants } from './variantGroupService';
import { fetchAllPublishedProducts } from './repairVariantOptions';

const OPTION_FIELDS = ['option1', 'option2', 'option3'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasDiscriminatorOption(shopifyOptions) {
  return (shopifyOptions || []).some(o => isSubVariantDiscriminatorOption(o.name));
}

/**
 * True when at least one option value in the product catalog contains the ·SKU separator.
 */
function hasSuffixedValues(shopifyOptions) {
  for (const opt of shopifyOptions || []) {
    for (const v of opt.values || []) {
      if (String(v || '').includes(SUB_VARIANT_VALUE_SUFFIX_SEP)) return true;
    }
  }
  return false;
}

/**
 * For a "suffix product" (3 customer types with ·SKU in last option values):
 * - Strip suffix from all last-option slots on all variants.
 * - Verify uniqueness of stripped values before applying.
 * Returns { stripped, conflicts, changes } where:
 *   stripped = variants with clean values ready to write
 *   conflicts = variants whose stripped last value clashes with another
 *   changes = list of { variantId, sku, lastTypeName, from, to }
 */
function planSuffixStrip(variants, shopifyOptions, customerTypes) {
  const lastType = customerTypes[customerTypes.length - 1];
  if (!lastType) return { stripped: [], conflicts: [], changes: [] };

  const lastFieldIdx = (shopifyOptions || []).findIndex(o => o.name === lastType.name);
  const lastField = lastFieldIdx >= 0 ? OPTION_FIELDS[lastFieldIdx] : null;
  if (!lastField) return { stripped: [], conflicts: [], changes: [] };

  // Build a map: variantId → { raw, stripped }
  const plan = [];
  for (const v of variants || []) {
    const raw = String(v?.[lastField] || '').trim();
    if (!raw) continue;
    const clean = stripOptionValueForDisplay(raw, v?.sku);
    plan.push({ variant: v, raw, clean });
  }

  // Detect collisions among stripped values
  const seenClean = new Map(); // clean value → first variantId that claimed it
  const conflicts = [];
  const stripped = [];
  const changes = [];

  for (const { variant, raw, clean } of plan) {
    const prev = seenClean.get(clean.toLowerCase());
    if (prev != null) {
      conflicts.push({
        variantId: variant.id,
        sku: variant.sku,
        lastTypeName: lastType.name,
        value: clean,
        clashesWithVariantId: prev,
      });
    } else {
      seenClean.set(clean.toLowerCase(), variant.id);
      if (raw !== clean) {
        stripped.push(variant);
        changes.push({
          variantId: variant.id,
          sku: variant.sku,
          lastTypeName: lastType.name,
          from: raw,
          to: clean,
        });
      }
    }
  }

  return { stripped, conflicts, changes };
}

async function restUpdateVariantField(domain, token, variantId, field, value) {
  const res = await fetch(`https://${domain}/admin/api/2024-10/variants/${variantId}.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ variant: { id: Number(variantId), [field]: value } }),
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

// ---------------------------------------------------------------------------
// Per-product cleanup
// ---------------------------------------------------------------------------

/**
 * Analyse and optionally clean one product.
 * @param {object} params
 * @param {string} params.domain
 * @param {string} params.token
 * @param {string|number} params.productId
 * @param {string|number} params.mco
 * @param {boolean} [params.dryRun=true]
 * @returns {Promise<object>}
 */
export async function cleanupProductVariantDiscriminators({
  domain,
  token,
  productId,
  mco,
  dryRun = true,
}) {
  const product = await fetchProductVariants(domain, token, productId);
  if (!product) throw new Error('Product not found');

  const variants = product.variants || [];
  const shopifyOptions = product.options || [];
  const allOptionTypes = productOptionTypes(shopifyOptions);
  const customerTypes = filterCustomerOptionTypes(allOptionTypes);

  const hasCode = hasDiscriminatorOption(shopifyOptions);
  const hasSuffix = hasSuffixedValues(shopifyOptions);

  if (!hasCode && !hasSuffix) {
    return {
      dryRun,
      productId,
      mco,
      status: 'clean',
      message: 'No legacy Code option or ·SKU suffix found.',
      stripped: [],
      conflicts: [],
      manualMigration: null,
    };
  }

  // ── Pattern A: suffix products (3 customer types, ·SKU on last option) ──
  if (hasSuffix && !hasCode && customerTypes.length >= 3) {
    const { stripped, conflicts, changes } = planSuffixStrip(variants, shopifyOptions, customerTypes);
    const lastFieldIdx = shopifyOptions.findIndex(
      o => o.name === customerTypes[customerTypes.length - 1].name,
    );
    const lastField = lastFieldIdx >= 0 ? OPTION_FIELDS[lastFieldIdx] : null;

    const appliedChanges = [];
    const errors = [];

    if (!dryRun && changes.length && lastField) {
      for (const change of changes) {
        try {
          await restUpdateVariantField(domain, token, change.variantId, lastField, change.to);
          appliedChanges.push({ ...change, applied: true });
        } catch (err) {
          errors.push({ variantId: change.variantId, sku: change.sku, error: err.message });
        }
      }
    }

    return {
      dryRun,
      productId,
      mco,
      status: conflicts.length ? 'partial_conflict' : (changes.length ? 'stripped' : 'clean'),
      stripped: dryRun ? changes : appliedChanges,
      conflicts,
      manualMigration: null,
      errors,
    };
  }

  // ── Pattern B: Code products (2 real types + synthetic Code) ──
  if (hasCode) {
    // Determine whether removing Code would leave all remaining combos unique.
    // If yes: safe to delete Code (rare case). If no: manual migration needed.
    const codeOption = shopifyOptions.find(o => isSubVariantDiscriminatorOption(o.name));
    const customerOnlyTypes = customerTypes; // Code is already filtered from customerTypes

    const combosSeen = new Map();
    let canAutoRemove = true;
    for (const v of variants) {
      const payload = variantToOptionPayload(v, customerOnlyTypes, shopifyOptions);
      const key = customerOnlyTypes.map(t => String(payload[t.name] || '').trim().toLowerCase()).join('\0');
      if (combosSeen.has(key)) {
        canAutoRemove = false;
        break;
      }
      combosSeen.set(key, v.id);
    }

    return {
      dryRun,
      productId,
      mco,
      status: canAutoRemove ? 'code_safe_to_remove' : 'manual_migration_needed',
      stripped: [],
      conflicts: [],
      manualMigration: canAutoRemove
        ? null
        : {
            message:
              `Product has ${variants.length} variants that differ only by the synthetic "Code" option. ` +
              `Add a real 3rd variant type (e.g. Weight) with a unique value for each variant, ` +
              `then use the repair tool to re-assign option values before removing Code.`,
            codeOptionId: codeOption?.id ?? null,
            variantCount: variants.length,
          },
    };
  }

  return {
    dryRun,
    productId,
    mco,
    status: 'unknown',
    message: 'Could not determine cleanup pattern.',
    stripped: [],
    conflicts: [],
    manualMigration: null,
  };
}

// ---------------------------------------------------------------------------
// Bulk cleanup (all active products)
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {string} params.domain
 * @param {string} params.token
 * @param {boolean} [params.dryRun=true]
 */
export async function cleanupAllProductVariantDiscriminators({ domain, token, dryRun = true }) {
  const products = await fetchAllPublishedProducts(domain, token);

  const results = [];
  let processedCount = 0;

  for (const product of products) {
    processedCount += 1;
    const productId = String(product.id);
    const title = product.title || '';
    const firstVariantSku = String(product.variants?.[0]?.sku || '').trim();

    if (!firstVariantSku) {
      results.push({ productId, title, status: 'skipped', reason: 'No variant SKU' });
      continue;
    }

    try {
      const result = await cleanupProductVariantDiscriminators({
        domain,
        token,
        productId,
        mco: firstVariantSku,
        dryRun,
      });
      results.push({ productId, title, sku: firstVariantSku, ...result });
    } catch (err) {
      results.push({
        productId,
        title,
        sku: firstVariantSku,
        status: 'error',
        error: err.message || 'Cleanup failed',
      });
    }
  }

  const summary = {
    clean: results.filter(r => r.status === 'clean').length,
    stripped: results.filter(r => r.status === 'stripped').length,
    partialConflict: results.filter(r => r.status === 'partial_conflict').length,
    manualMigration: results.filter(r => r.status === 'manual_migration_needed').length,
    codeSafeToRemove: results.filter(r => r.status === 'code_safe_to_remove').length,
    errors: results.filter(r => r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  return {
    dryRun,
    total: products.length,
    processed: processedCount,
    summary,
    results,
  };
}
