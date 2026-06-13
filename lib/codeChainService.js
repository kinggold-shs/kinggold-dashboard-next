import {
  fetchProductVariants,
  fetchVariantCodeGroupsMetafield,
  saveVariantCodeGroupsMetafield,
} from './variantGroupService';
import { fetchFn6ByMco, roundedFn6Price } from './fn6Server';
import { ensureProductOptionValuesForSelections } from './shopifyVariantTypes';
import {
  applyVariantInventoryFromBody,
  canAccessShopLocations,
} from './shopifyInventory';
import {
  buildMetafieldGroups,
  filterCustomerOptionTypes,
  findMainVariant,
  optionValuesToRestPayload,
  productOptionTypes,
  variantToOptionPayload,
} from './variantModel';
import { formatGwebWeightDisplay, upsertVariantGwebWeightMetafield } from './gwebWeightMetafield';

export const CODE_CHAINS_VERSION = 2;
export const CODE_CHAINS_NAMESPACE = 'custom';
export const CODE_CHAINS_KEY = 'code_chains';
export const CODE_CHAINS_METAFIELD_TYPE = 'json';
export const PROCESSED_ORDERS_NAMESPACE = 'custom';
export const PROCESSED_ORDERS_KEY = 'code_chain_processed_lines';
export const PROCESSED_ORDERS_TYPE = 'json';

const OPTION_FIELDS = ['option1', 'option2', 'option3'];

const EMPTY_CHAINS = () => ({
  version: CODE_CHAINS_VERSION,
  updatedAt: new Date().toISOString(),
  chains: [],
});

/** @typedef {{ key: string, optionValues: Record<string, string>, codes: string[], activeIndex: number, soldCodes: string[], activeVariantId?: number|null }} CodeChain */

/** @param {Record<string, string>} optionValues */
export function buildChainKey(optionValues) {
  const entries = Object.entries(optionValues || {})
    .map(([name, value]) => [String(name).trim(), String(value || '').trim()])
    .filter(([name, value]) => name && value)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([name, value]) => `${name}:${value}`).join('|');
}

/** @param {unknown} raw */
export function parseCodeChains(raw) {
  if (raw == null || raw === '') return EMPTY_CHAINS();
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Invalid code_chains JSON');
    }
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('code_chains must be an object');
  }
  const chains = Array.isArray(data.chains) ? data.chains.map(normalizeChain) : [];
  return {
    version: Number(data.version) || CODE_CHAINS_VERSION,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    chains,
  };
}

/** @param {unknown} chain */
function normalizeChain(chain) {
  const c = chain && typeof chain === 'object' ? chain : {};
  const optionValues = {};
  if (c.optionValues && typeof c.optionValues === 'object') {
    for (const [k, v] of Object.entries(c.optionValues)) {
      const name = String(k).trim();
      const value = String(v || '').trim();
      if (name && value) optionValues[name] = value;
    }
  }
  const codes = Array.isArray(c.codes)
    ? c.codes.map(code => String(code).trim()).filter(Boolean)
    : [];
  const soldCodes = Array.isArray(c.soldCodes)
    ? c.soldCodes.map(code => String(code).trim()).filter(Boolean)
    : [];
  let activeIndex = Number(c.activeIndex);
  if (!Number.isFinite(activeIndex) || activeIndex < 0) activeIndex = 0;
  if (activeIndex >= codes.length && codes.length > 0) activeIndex = codes.length;
  const key = String(c.key || buildChainKey(optionValues));
  const activeVariantId = c.activeVariantId != null ? Number(c.activeVariantId) : null;
  return {
    key,
    optionValues,
    codes,
    activeIndex,
    soldCodes,
    activeVariantId: Number.isFinite(activeVariantId) ? activeVariantId : null,
  };
}

/** @param {CodeChain} chain */
export function getActiveCode(chain) {
  if (!chain?.codes?.length) return null;
  if (chain.activeIndex >= chain.codes.length) return null;
  return chain.codes[chain.activeIndex] || null;
}

/** @param {CodeChain} chain */
export function getNextCode(chain) {
  const nextIndex = (chain?.activeIndex ?? 0) + 1;
  if (!chain?.codes?.length || nextIndex >= chain.codes.length) return null;
  return chain.codes[nextIndex] || null;
}

/** @param {CodeChain} chain */
export function isChainAvailable(chain) {
  return getActiveCode(chain) != null;
}

/**
 * Advance chain after a sale. Mutates and returns the chain.
 * @param {CodeChain} chain
 * @param {string} soldSku
 */
export function advanceChain(chain, soldSku) {
  const sku = String(soldSku || '').trim();
  const active = getActiveCode(chain);
  if (!active || active !== sku) {
    throw new Error(`Sold SKU ${sku} does not match active code ${active || '(none)'}`);
  }
  const soldCodes = [...(chain.soldCodes || [])];
  if (!soldCodes.includes(sku)) soldCodes.push(sku);
  return {
    ...chain,
    soldCodes,
    activeIndex: chain.activeIndex + 1,
    activeVariantId: null,
  };
}

/**
 * Cartesian product of customer option type values for chain row scaffolding.
 * @param {{ name: string, values: string[] }[]} customerOptionTypes
 * @param {{ name?: string, values?: string[] }[]} shopifyOptions
 */
export function enumerateChainOptionCombos(customerOptionTypes, shopifyOptions) {
  const types = filterCustomerOptionTypes(customerOptionTypes);
  if (!types.length) return [];

  const valueLists = types.map(type => {
    const fromType = (type.values || []).filter(Boolean);
    if (fromType.length) return fromType;
    const shopifyOpt = (shopifyOptions || []).find(
      o => String(o.name || '').trim().toLowerCase() === type.name.toLowerCase(),
    );
    return (shopifyOpt?.values || []).filter(Boolean);
  });

  if (valueLists.some(list => !list.length)) return [];

  /** @param {number} idx @param {Record<string, string>} acc */
  function build(idx, acc) {
    if (idx >= types.length) {
      const optionValues = { ...acc };
      return [{ key: buildChainKey(optionValues), optionValues, codes: [], activeIndex: 0, soldCodes: [] }];
    }
    const type = types[idx];
    const results = [];
    for (const value of valueLists[idx]) {
      results.push(...build(idx + 1, { ...acc, [type.name]: String(value) }));
    }
    return results;
  }

  return build(0, {});
}

/**
 * Merge saved chains with scaffold combos (preserve saved data, add empty rows for new combos).
 * @param {CodeChain[]} savedChains
 * @param {CodeChain[]} scaffoldChains
 */
export function mergeChainsWithScaffold(savedChains, scaffoldChains) {
  const byKey = new Map((savedChains || []).map(c => [c.key, c]));
  const merged = (scaffoldChains || []).map(scaffold => {
    const existing = byKey.get(scaffold.key);
    if (existing) return existing;
    return scaffold;
  });
  for (const chain of savedChains || []) {
    if (!merged.some(c => c.key === chain.key)) {
      merged.push(chain);
    }
  }
  return merged;
}

/**
 * Seed empty chains and ensure the main variant row starts with the page MCO as code #1 (active).
 * @param {CodeChain[]} chains
 * @param {{ id?: number|string, sku?: string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ name?: string, values?: string[] }[]} shopifyOptions
 * @param {string|number} mco
 */
export function applyChainDefaults(chains, variants, shopifyOptions, mco) {
  const pageCode = String(mco || '').trim();
  if (!pageCode) return chains || [];

  const optionTypes = productOptionTypes(shopifyOptions);
  const customerTypes = filterCustomerOptionTypes(optionTypes);
  const main = findMainVariant(variants, pageCode);

  return (chains || []).map(chain => {
    const isMainChain = main
      && variantMatchesOptionValues(main, chain.optionValues, customerTypes, shopifyOptions);

    if (isMainChain) {
      return ensureMainChainPageCode(chain, pageCode);
    }

    if ((chain.codes || []).length) return chain;

    const match = (variants || []).find(v =>
      variantMatchesOptionValues(v, chain.optionValues, customerTypes, shopifyOptions),
    );
    const sku = String(match?.sku || '').trim();
    if (!sku) return chain;

    return {
      ...chain,
      codes: [sku],
      activeIndex: 0,
      soldCodes: chain.soldCodes || [],
    };
  });
}

/** @param {CodeChain} chain @param {string} pageCode */
function ensureMainChainPageCode(chain, pageCode) {
  const soldCodes = [...(chain.soldCodes || [])];
  const pageSold = soldCodes.includes(pageCode);
  let codes = [...(chain.codes || [])];

  if (!codes.length) {
    return { ...chain, codes: [pageCode], activeIndex: 0, soldCodes };
  }

  if (pageSold) {
    return chain;
  }

  if (codes[0] !== pageCode) {
    codes = [pageCode, ...codes.filter(c => c !== pageCode)];
  }

  return { ...chain, codes, activeIndex: 0, soldCodes };
}

/**
 * Whether a chain row corresponds to the main variant (page MCO) option combo.
 * @param {CodeChain} chain
 * @param {{ id?: number|string, sku?: string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ name?: string, values?: string[] }[]} shopifyOptions
 * @param {string|number} mco
 */
export function isMainVariantChain(chain, variants, shopifyOptions, mco) {
  const pageCode = String(mco || '').trim();
  if (!pageCode) return false;
  const optionTypes = productOptionTypes(shopifyOptions);
  const customerTypes = filterCustomerOptionTypes(optionTypes);
  const main = findMainVariant(variants, pageCode);
  return Boolean(
    main && variantMatchesOptionValues(main, chain.optionValues, customerTypes, shopifyOptions),
  );
}

/**
 * @param {CodeChain[]} chains
 * @param {{ id?: number|string, sku?: string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {{ name?: string, values?: string[] }[]} shopifyOptions
 * @param {string|number} mco
 */
export function enrichChainsForClient(chains, variants, shopifyOptions, mco) {
  return (chains || []).map(chain => ({
    ...chain,
    isMainChain: isMainVariantChain(chain, variants, shopifyOptions, mco),
    activeCode: getActiveCode(chain),
    nextCode: getNextCode(chain),
    available: isChainAvailable(chain),
  }));
}

/**
 * @param {{ chains: CodeChain[] }} payload
 * @param {{ name: string, values: string[] }[]} customerOptionTypes
 */
export function validateCodeChains(payload, customerOptionTypes) {
  const errors = [];
  if (!payload || !Array.isArray(payload.chains)) {
    return ['chains must be an array'];
  }

  const types = filterCustomerOptionTypes(customerOptionTypes);
  const typeNames = new Set(types.map(t => t.name));
  const usedCodes = new Set();

  payload.chains.forEach((chain, index) => {
    const label = `Chain ${index + 1} (${chain.key || 'unknown'})`;
    if (!chain.optionValues || typeof chain.optionValues !== 'object') {
      errors.push(`${label}: optionValues required`);
      return;
    }
    for (const name of Object.keys(chain.optionValues)) {
      if (!typeNames.has(name)) {
        errors.push(`${label}: unknown option ${name}`);
      }
    }
    if (!chain.codes?.length) {
      errors.push(`${label}: at least one code is required`);
    }
    (chain.codes || []).forEach(code => {
      if (usedCodes.has(code)) {
        errors.push(`${label}: duplicate code ${code} across chains`);
      }
      usedCodes.add(code);
    });
    const activeIndex = Number(chain.activeIndex);
    if (!Number.isFinite(activeIndex) || activeIndex < 0) {
      errors.push(`${label}: activeIndex must be >= 0`);
    }
    if (chain.codes?.length && activeIndex > chain.codes.length) {
      errors.push(`${label}: activeIndex exceeds code list length`);
    }
  });

  return errors;
}

/** @param {{ chains: CodeChain[] }} payload */
export function serializeCodeChains(payload) {
  return {
    version: CODE_CHAINS_VERSION,
    updatedAt: new Date().toISOString(),
    chains: (payload.chains || []).map(c => ({
      key: c.key || buildChainKey(c.optionValues),
      optionValues: c.optionValues || {},
      codes: (c.codes || []).map(code => String(code).trim()).filter(Boolean),
      activeIndex: Number(c.activeIndex) || 0,
      soldCodes: (c.soldCodes || []).map(code => String(code).trim()).filter(Boolean),
      activeVariantId: c.activeVariantId != null ? Number(c.activeVariantId) : null,
    })),
  };
}

export async function fetchCodeChainsMetafield(domain, token, productId) {
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
    m => m.namespace === CODE_CHAINS_NAMESPACE && m.key === CODE_CHAINS_KEY,
  );
  if (!metafield) {
    return { metafieldId: null, payload: EMPTY_CHAINS() };
  }
  return {
    metafieldId: metafield.id,
    payload: parseCodeChains(metafield.value),
  };
}

export async function saveCodeChainsMetafield(domain, token, productId, payload, existingMetafieldId = null) {
  const body = JSON.stringify(serializeCodeChains(payload));
  const metafieldBody = {
    namespace: CODE_CHAINS_NAMESPACE,
    key: CODE_CHAINS_KEY,
    type: CODE_CHAINS_METAFIELD_TYPE,
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
    return parseCodeChains(data.metafield?.value);
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
  return parseCodeChains(data.metafield?.value);
}

function variantMatchesOptionValues(variant, optionValues, optionTypes, shopifyOptions) {
  const payload = variantToOptionPayload(variant, optionTypes, shopifyOptions);
  return Object.entries(optionValues || {}).every(
    ([name, value]) => String(payload[name] || '').trim() === String(value).trim(),
  );
}

function findVariantBySku(variants, sku) {
  const code = String(sku || '').trim();
  return (variants || []).find(v => String(v.sku || '').trim() === code) || null;
}

async function createOrUpdateVariantForCode(domain, token, productId, {
  sku,
  optionValues,
  optionTypes,
  shopifyOptions,
  variants,
  available,
}) {
  const code = String(sku || '').trim();
  if (!code) return null;

  const { item } = await fetchFn6ByMco(code);
  if (!item) {
    throw new Error(`FN6 code not found: ${code}`);
  }

  await ensureProductOptionValuesForSelections(domain, token, productId, optionValues);

  const refreshed = await fetchProductVariants(domain, token, productId);
  const freshOptions = refreshed?.options || shopifyOptions;
  const freshOptionTypes = productOptionTypes(freshOptions);
  const restOptions = optionValuesToRestPayload(freshOptionTypes, optionValues, freshOptions);
  const price = roundedFn6Price(item);
  const inventoryBody = {
    inventory_management: 'shopify',
    inventory_quantity: available ? 1 : 0,
  };

  let existing = findVariantBySku(refreshed?.variants || variants, code);
  if (!existing) {
    existing = (refreshed?.variants || variants || []).find(
      v => variantMatchesOptionValues(v, optionValues, freshOptionTypes, freshOptions),
    );
  }

  if (existing) {
    const variant = { id: Number(existing.id), sku: code };
    if (price) variant.price = price;
    Object.assign(variant, inventoryBody);
    for (const field of OPTION_FIELDS) {
      if (restOptions[field] !== undefined) variant[field] = restOptions[field];
    }
    const res = await fetch(`https://${domain}/admin/api/2024-10/variants/${existing.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ variant }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Failed to update variant'),
      );
    }
    await applyVariantInventoryFromBody(domain, token, inventoryBody, existing.id);
    const weightStr = formatGwebWeightDisplay(item?.go_cr);
    if (weightStr) {
      await upsertVariantGwebWeightMetafield(domain, token, existing.id, weightStr);
    }
    return data.variant;
  }

  const variant = { sku: code, ...inventoryBody };
  if (price) variant.price = price;
  for (const field of OPTION_FIELDS) {
    if (restOptions[field] !== undefined) variant[field] = restOptions[field];
  }

  const res = await fetch(`https://${domain}/admin/api/2024-10/products/${productId}/variants.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ variant }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Failed to create variant'),
    );
  }
  const created = data.variant;
  if (created?.id) {
    await applyVariantInventoryFromBody(domain, token, inventoryBody, created.id);
    const weightStr = formatGwebWeightDisplay(item?.go_cr);
    if (weightStr) {
      await upsertVariantGwebWeightMetafield(domain, token, created.id, weightStr);
    }
  }
  return created;
}

/** Set binary inventory on an existing variant without changing SKU/options. */
async function setVariantAvailability(domain, token, variantId, available) {
  const qty = available ? 1 : 0;
  const body = { inventory_management: 'shopify', inventory_quantity: qty };
  await fetch(`https://${domain}/admin/api/2024-10/variants/${variantId}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ variant: { id: Number(variantId), ...body } }),
  });
  await applyVariantInventoryFromBody(domain, token, body, variantId);
}

/**
 * Sync one chain to Shopify: active code available (qty 1), sold codes unavailable (qty 0).
 * @param {CodeChain} chain
 */
export async function syncChainToShopify(domain, token, productId, chain, productContext) {
  const shopifyOptions = productContext?.options || [];
  const optionTypes = productOptionTypes(shopifyOptions);
  const variants = productContext?.variants || [];

  const activeCode = getActiveCode(chain);
  const soldSet = new Set(chain.soldCodes || []);

  for (const soldCode of soldSet) {
    const soldVariant = findVariantBySku(variants, soldCode);
    if (soldVariant?.id) {
      await setVariantAvailability(domain, token, soldVariant.id, false);
    }
  }

  if (!activeCode) {
    const matchVariant = variants.find(
      v => variantMatchesOptionValues(v, chain.optionValues, optionTypes, shopifyOptions),
    );
    if (matchVariant?.id) {
      await setVariantAvailability(domain, token, matchVariant.id, false);
    }
    return { ...chain, activeVariantId: null };
  }

  const activeVariant = await createOrUpdateVariantForCode(domain, token, productId, {
    sku: activeCode,
    optionValues: chain.optionValues,
    optionTypes,
    shopifyOptions,
    variants,
    available: true,
  });

  return {
    ...chain,
    activeVariantId: activeVariant?.id ? Number(activeVariant.id) : chain.activeVariantId,
  };
}

/** Sync all chains and rebuild variant_code_groups metafield. */
export async function syncAllChainsToShopify(domain, token, productId, payload, mco) {
  const preflight = await canAccessShopLocations(domain, token);
  if (!preflight.ok) {
    throw new Error(preflight.error);
  }

  let product = await fetchProductVariants(domain, token, productId);
  if (!product) throw new Error('Product not found');

  const syncedChains = [];
  for (const chain of payload.chains || []) {
    product = await fetchProductVariants(domain, token, productId);
    const synced = await syncChainToShopify(domain, token, productId, chain, product);
    syncedChains.push(synced);
  }

  product = await fetchProductVariants(domain, token, productId);
  const activeVariants = syncedChains
    .map(chain => {
      const code = getActiveCode(chain);
      if (!code) return null;
      return findVariantBySku(product.variants, code);
    })
    .filter(Boolean);

  const main = findMainVariant(product.variants, mco);
  const subs = activeVariants.filter(v => !main || Number(v.id) !== Number(main.id));
  const groupsPayload = buildMetafieldGroups(main || activeVariants[0], subs);
  const { metafieldId } = await fetchVariantCodeGroupsMetafield(domain, token, productId);
  await saveVariantCodeGroupsMetafield(domain, token, productId, groupsPayload, metafieldId);

  return {
    chains: syncedChains,
    variants: product.variants,
  };
}

/** Process order line — advance matching chain. */
export async function processOrderLineForChains(domain, token, productId, sku, mco) {
  const { metafieldId, payload } = await fetchCodeChainsMetafield(domain, token, productId);
  if (!payload.chains?.length) return { advanced: false, reason: 'no_chains' };

  const code = String(sku || '').trim();
  const chainIndex = payload.chains.findIndex(chain => getActiveCode(chain) === code);
  if (chainIndex < 0) return { advanced: false, reason: 'not_active_code' };

  const chain = payload.chains[chainIndex];
  const advanced = advanceChain(chain, code);
  const nextChains = [...payload.chains];
  nextChains[chainIndex] = advanced;

  const saved = await saveCodeChainsMetafield(
    domain,
    token,
    productId,
    { chains: nextChains },
    metafieldId,
  );

  await syncAllChainsToShopify(domain, token, productId, saved, mco);

  return {
    advanced: true,
    chainKey: chain.key,
    soldCode: code,
    nextCode: getActiveCode(advanced),
  };
}

export async function fetchProcessedOrderLines(domain, token) {
  const res = await fetch(`https://${domain}/admin/api/2024-10/metafields.json?namespace=${PROCESSED_ORDERS_NAMESPACE}&key=${PROCESSED_ORDERS_KEY}`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  const data = await res.json();
  if (!res.ok) return { metafieldId: null, lineIds: new Set() };
  const metafield = (data.metafields || [])[0];
  if (!metafield) return { metafieldId: null, lineIds: new Set() };
  let parsed = [];
  try {
    parsed = JSON.parse(metafield.value);
  } catch {
    parsed = [];
  }
  return {
    metafieldId: metafield.id,
    lineIds: new Set(Array.isArray(parsed) ? parsed.map(String) : []),
  };
}

export async function markOrderLineProcessed(domain, token, existingMetafieldId, lineIds) {
  const next = [...lineIds];
  const body = JSON.stringify(next.slice(-5000));
  const metafieldBody = {
    namespace: PROCESSED_ORDERS_NAMESPACE,
    key: PROCESSED_ORDERS_KEY,
    type: PROCESSED_ORDERS_TYPE,
    value: body,
  };
  if (existingMetafieldId) {
    await fetch(`https://${domain}/admin/api/2024-10/metafields/${existingMetafieldId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ metafield: metafieldBody }),
    });
    return;
  }
  await fetch(`https://${domain}/admin/api/2024-10/metafields.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      metafield: {
        ...metafieldBody,
        owner_resource: 'shop',
      },
    }),
  });
}

/**
 * Migrate existing sub-variant SKUs into per-option chains grouped by option combo.
 * @param {{ id: number|string, sku?: string, option1?: string, option2?: string, option3?: string }[]} variants
 * @param {string|number} mco
 * @param {{ name: string, values: string[] }[]} customerOptionTypes
 * @param {{ name?: string, position?: number, values?: string[] }[]} shopifyOptions
 */
export function migrateSubVariantsToChains(variants, mco, customerOptionTypes, shopifyOptions) {
  const main = findMainVariant(variants, mco);
  const optionTypes = filterCustomerOptionTypes(customerOptionTypes);
  const chainMap = new Map();
  const pageCode = String(mco || '').trim();

  for (const variant of variants || []) {
    if (main && Number(variant.id) === Number(main.id)) continue;
    const sku = String(variant.sku || '').trim();
    if (!sku) continue;
    const optionValues = variantToOptionPayload(variant, optionTypes, shopifyOptions);
    const key = buildChainKey(optionValues);
    if (!chainMap.has(key)) {
      chainMap.set(key, {
        key,
        optionValues,
        codes: [],
        activeIndex: 0,
        soldCodes: [],
      });
    }
    chainMap.get(key).codes.push(sku);
  }

  if (main && pageCode) {
    const optionValues = variantToOptionPayload(main, optionTypes, shopifyOptions);
    const key = buildChainKey(optionValues);
    if (!chainMap.has(key)) {
      chainMap.set(key, {
        key,
        optionValues,
        codes: [],
        activeIndex: 0,
        soldCodes: [],
      });
    }
    const chain = chainMap.get(key);
    chain.codes = chain.codes.filter(c => c !== pageCode);
    chain.codes.unshift(pageCode);
    chain.activeIndex = 0;
  }

  return { chains: [...chainMap.values()] };
}
