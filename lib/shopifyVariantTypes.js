import { shopifyGraphql } from './shopifyProductLookup';
import {
  fetchProductOptionsGraphql,
  fetchProductVariants,
  optionValueNamesFromGraphql,
} from './variantGroupService';
import {
  collectOptionValuesFromVariants,
  filterOptionsForUi,
  isDefaultTitleOnlyOptions,
  isPlaceholderOptionName,
  isPlaceholderOptionValue,
  isSubVariantDiscriminatorOption,
  orderVariantTypes,
  PRIMARY_OPTION_CATALOG,
  optionValuesToRestPayload,
  productOptionTypes,
  SUB_VARIANT_DISCRIMINATOR_OPTION,
  unionVariantTypesWithLiveValues,
  variantToOptionPayload,
} from './variantModel';

const OPTION_FIELDS = ['option1', 'option2', 'option3'];

const LEAVE_AS_IS = 'LEAVE_AS_IS';

const OPTION_UPDATE = `
  mutation ProductOptionUpdate(
    $productId: ID!
    $option: OptionUpdateInput!
    $optionValuesToAdd: [OptionValueCreateInput!]
    $optionValuesToUpdate: [OptionValueUpdateInput!]
    $optionValuesToDelete: [ID!]
    $variantStrategy: ProductOptionUpdateVariantStrategy
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToAdd: $optionValuesToAdd
      optionValuesToUpdate: $optionValuesToUpdate
      optionValuesToDelete: $optionValuesToDelete
      variantStrategy: $variantStrategy
    ) {
      userErrors { field message code }
    }
  }
`;

const OPTIONS_CREATE = `
  mutation ProductOptionsCreate(
    $productId: ID!
    $options: [OptionCreateInput!]!
    $variantStrategy: ProductOptionCreateVariantStrategy
  ) {
    productOptionsCreate(
      productId: $productId
      options: $options
      variantStrategy: $variantStrategy
    ) {
      userErrors { field message code }
    }
  }
`;

const OPTIONS_DELETE = `
  mutation ProductOptionsDelete(
    $productId: ID!
    $options: [ID!]!
    $strategy: ProductOptionDeleteStrategy
  ) {
    productOptionsDelete(
      productId: $productId
      options: $options
      strategy: $strategy
    ) {
      userErrors { field message code }
    }
  }
`;

/** Resolves duplicate variants when removing an option (Admin GraphQL 2024-10+). */
const DELETE_OPTION_STRATEGY = 'POSITION';

function productGid(productId) {
  return `gid://shopify/Product/${productId}`;
}

function throwUserErrors(userErrors, fallback) {
  if (userErrors?.length) {
    const err = new Error(userErrors.map(e => e.message).filter(Boolean).join('; ') || fallback);
    err.statusCode = 400;
    throw err;
  }
}

/** @param {{ name: string, values: string[] }[]} types */
export function validateVariantTypesInput(types) {
  if (!Array.isArray(types)) return ['types must be an array'];
  if (types.length > 3) return ['Maximum 3 option types allowed'];
  const errors = [];
  types.forEach((t, i) => {
    const name = String(t?.name || '').trim();
    if (!name) errors.push(`Type ${i + 1}: name is required`);
    const values = Array.isArray(t?.values) ? t.values : [];
    if (!values.length || !values.some(v => String(v).trim())) {
      errors.push(`Type "${name || i + 1}" must have at least one value`);
    }
  });
  return errors;
}

function normalizeTargetTypes(types) {
  const normalized = types
    .slice(0, 3)
    .map(t => ({
      name: String(t.name).trim(),
      values: [...new Set(
        (t.values || []).map(v => String(v).trim()).filter(Boolean),
      )],
    }))
    .filter(t => t.name && t.values.length);
  return orderVariantTypes(normalized);
}

function isDefaultTitleOnly(options) {
  return isDefaultTitleOnlyOptions(options);
}

async function runOptionUpdate(domain, token, productId, variables) {
  const data = await shopifyGraphql(domain, token, OPTION_UPDATE, {
    productId: productGid(productId),
    variantStrategy: LEAVE_AS_IS,
    optionValuesToAdd: [],
    optionValuesToUpdate: [],
    optionValuesToDelete: [],
    ...variables,
  });
  throwUserErrors(data?.productOptionUpdate?.userErrors, 'productOptionUpdate failed');
}

async function runOptionsCreate(domain, token, productId, options) {
  const data = await shopifyGraphql(domain, token, OPTIONS_CREATE, {
    productId: productGid(productId),
    options,
    variantStrategy: LEAVE_AS_IS,
  });
  throwUserErrors(data?.productOptionsCreate?.userErrors, 'productOptionsCreate failed');
}

async function runOptionsDelete(domain, token, productId, optionIds) {
  if (!optionIds.length) return;
  const data = await shopifyGraphql(domain, token, OPTIONS_DELETE, {
    productId: productGid(productId),
    options: optionIds,
    strategy: DELETE_OPTION_STRATEGY,
  });
  throwUserErrors(data?.productOptionsDelete?.userErrors, 'productOptionsDelete failed');
}

async function convertDefaultTitleOption(domain, token, productId, titleOption, targetType) {
  const firstValue = targetType.values[0];
  const currentNames = optionValueNamesFromGraphql(titleOption);
  const defaultValueNode = (titleOption.optionValues || []).find(
    v => isPlaceholderOptionValue(v.name),
  );
  const optionValuesToUpdate = defaultValueNode?.id && firstValue && defaultValueNode.name !== firstValue
    ? [{ id: defaultValueNode.id, name: firstValue }]
    : [];
  const optionValuesToAdd = targetType.values
    .filter(v => v !== firstValue && !currentNames.has(v))
    .map(name => ({ name }));

  await runOptionUpdate(domain, token, productId, {
    option: { id: titleOption.id, name: targetType.name },
    optionValuesToUpdate,
    optionValuesToAdd,
    optionValuesToDelete: [],
  });
}

async function syncOptionValues(domain, token, productId, currentOption, targetType) {
  const renamingFromTitle = isPlaceholderOptionName(currentOption.name)
    && !isPlaceholderOptionName(targetType.name);
  const currentNames = optionValueNamesFromGraphql(currentOption);
  const targetNames = new Set(targetType.values);

  try {
    const product = await fetchProductVariants(domain, token, productId);
    if (product?.variants?.length) {
      const liveByName = collectOptionValuesFromVariants(
        product.variants,
        product.options || [],
        [{ name: targetType.name }],
      );
      const live = liveByName.get(targetType.name);
      if (live) {
        live.forEach(v => targetNames.add(v));
      }
    }
  } catch {
    // proceed with draft target values only
  }
  const optionValuesToAdd = targetType.values
    .filter(name => !currentNames.has(name))
    .map(name => ({ name }));
  let optionValuesToDelete = (currentOption.optionValues || [])
    .filter(v => !targetNames.has(v.name))
    .map(v => v.id);
  const optionValuesToUpdate = [];

  if (renamingFromTitle) {
    const placeholderNode = (currentOption.optionValues || []).find(
      v => isPlaceholderOptionValue(v.name),
    );
    const firstTarget = targetType.values[0];
    if (placeholderNode && firstTarget && placeholderNode.name !== firstTarget) {
      optionValuesToUpdate.push({ id: placeholderNode.id, name: firstTarget });
      const placeholderIdx = optionValuesToDelete.indexOf(placeholderNode.id);
      if (placeholderIdx >= 0) optionValuesToDelete.splice(placeholderIdx, 1);
    } else if (placeholderNode && !firstTarget) {
      optionValuesToDelete = optionValuesToDelete.filter(id => id !== placeholderNode.id);
    }
  }

  const nameChanged = currentOption.name !== targetType.name;
  if (
    nameChanged
    || renamingFromTitle
    || optionValuesToAdd.length
    || optionValuesToDelete.length
    || optionValuesToUpdate.length
  ) {
    await runOptionUpdate(domain, token, productId, {
      option: { id: currentOption.id, name: targetType.name },
      optionValuesToAdd,
      optionValuesToUpdate,
      optionValuesToDelete,
    });
  }
}

/** Retry pass: GraphQL optionValues are authoritative; add any target values still missing. */
async function ensureTargetOptionValuesPresent(domain, token, productId, targetTypes) {
  for (const target of targetTypes) {
    const options = await fetchProductOptionsGraphql(domain, token, productId);
    const opt = options.find(o => o.name === target.name);
    if (!opt) continue;

    const present = optionValueNamesFromGraphql(opt);
    const missing = target.values.filter(name => !present.has(name));
    if (!missing.length) continue;

    await runOptionUpdate(domain, token, productId, {
      option: { id: opt.id, name: target.name },
      optionValuesToAdd: missing.map(name => ({ name })),
      optionValuesToUpdate: [],
      optionValuesToDelete: [],
    });
  }
}

async function restUpdateVariant(domain, token, variantId, body) {
  const res = await fetch(`https://${domain}/admin/api/2024-10/variants/${variantId}.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ variant: { id: Number(variantId), ...body } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data.errors === 'object'
      ? JSON.stringify(data.errors)
      : (data.errors || 'Failed to update variant');
    const err = new Error(errMsg);
    err.statusCode = res.status;
    throw err;
  }
}

async function stripPlaceholderFromVariants(domain, token, productId) {
  const product = await fetchProductVariants(domain, token, productId);
  if (!product?.variants?.length) return;

  for (const variant of product.variants) {
    const patch = {};
    let changed = false;
    for (const field of ['option1', 'option2', 'option3']) {
      if (isPlaceholderOptionValue(variant[field])) {
        patch[field] = '';
        changed = true;
      }
    }
    if (changed) {
      await restUpdateVariant(domain, token, variant.id, patch);
    }
  }
}

/** Map variant option fields to current product types; clear stale values from removed options. */
async function realignVariantsToProductOptions(domain, token, productId, optionTypes, mco) {
  const product = await fetchProductVariants(domain, token, productId);
  if (!product?.variants?.length) return;

  const types = productOptionTypes(optionTypes.length ? optionTypes : product.options);

  for (const variant of product.variants) {
    const selected = variantToOptionPayload(variant, types, product.options);
    const isMain = mco != null && String(variant.sku) === String(mco);

    types.forEach(type => {
      if (!selected[type.name] && type.values?.length && isMain) {
        selected[type.name] = type.values[0];
      }
    });

    const restOptions = optionValuesToRestPayload(types, selected, product.options);
    const patch = {};
    for (const field of OPTION_FIELDS) {
      const next = restOptions[field] ?? variant[field] ?? '';
      if (String(variant[field] || '') !== String(next || '')) {
        patch[field] = next;
      }
    }

    if (Object.keys(patch).length) {
      await restUpdateVariant(domain, token, variant.id, patch);
    }
  }
}

async function ensureVariantsHaveOptionPositions(domain, token, productId, optionTypes, mco) {
  await realignVariantsToProductOptions(domain, token, productId, optionTypes, mco);
}

/**
 * @param {string} domain
 * @param {string} token
 * @param {string|number} productId
 * @param {{ name: string, values: string[] }[]} types
 * @param {string|number} [mco]
 */
export async function reconcileProductVariantTypes(domain, token, productId, types, mco) {
  const validationErrors = validateVariantTypesInput(types);
  if (validationErrors.length) {
    const err = new Error(validationErrors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  let targetTypes = normalizeTargetTypes(types);
  try {
    const liveProduct = await fetchProductVariants(domain, token, productId);
    if (liveProduct?.variants?.length) {
      targetTypes = unionVariantTypesWithLiveValues(
        targetTypes,
        liveProduct.variants,
        liveProduct.options || [],
      );
    }
  } catch {
    // proceed with submitted types only
  }

  let currentOptions = await fetchProductOptionsGraphql(domain, token, productId);

  if (isDefaultTitleOnly(currentOptions) && targetTypes.length > 0) {
    await convertDefaultTitleOption(
      domain,
      token,
      productId,
      currentOptions[0],
      targetTypes[0],
    );
    currentOptions = await fetchProductOptionsGraphql(domain, token, productId);
    const remaining = targetTypes.slice(1);
    for (let i = 0; i < remaining.length; i++) {
      const target = remaining[i];
      const exists = currentOptions.some(o => o.name === target.name);
      if (!exists) {
        await runOptionsCreate(domain, token, productId, [{
          name: target.name,
          position: currentOptions.length + 1,
          values: target.values.map(name => ({ name })),
        }]);
        currentOptions = await fetchProductOptionsGraphql(domain, token, productId);
      } else {
        const opt = currentOptions.find(o => o.name === target.name);
        await syncOptionValues(domain, token, productId, opt, target);
        currentOptions = await fetchProductOptionsGraphql(domain, token, productId);
      }
    }
  } else {
    const targetNames = new Set(targetTypes.map(t => t.name));

    const toDelete = currentOptions
      .filter(o => !targetNames.has(o.name))
      .sort((a, b) => (b.position || 0) - (a.position || 0))
      .map(o => o.id);
    await runOptionsDelete(domain, token, productId, toDelete);
    currentOptions = await fetchProductOptionsGraphql(domain, token, productId);
    const interimTypes = productOptionTypes(
      targetTypes.length ? targetTypes : currentOptions,
    );
    await ensureVariantsHaveOptionPositions(domain, token, productId, interimTypes, mco);

    for (let i = 0; i < targetTypes.length; i++) {
      const target = targetTypes[i];
      let existing = currentOptions.find(o => o.name === target.name);
      if (!existing && currentOptions[i] && !targetNames.has(currentOptions[i].name)) {
        existing = currentOptions[i];
      }

      if (!existing) {
        await runOptionsCreate(domain, token, productId, [{
          name: target.name,
          position: i + 1,
          values: target.values.map(name => ({ name })),
        }]);
      } else {
        await syncOptionValues(domain, token, productId, existing, target);
      }
      currentOptions = await fetchProductOptionsGraphql(domain, token, productId);
    }
  }

  await ensureTargetOptionValuesPresent(domain, token, productId, targetTypes);

  const refreshed = await fetchProductVariants(domain, token, productId);
  const finalTypes = productOptionTypes(refreshed?.options || targetTypes);
  await ensureVariantsHaveOptionPositions(domain, token, productId, finalTypes, mco);
  await stripPlaceholderFromVariants(domain, token, productId);

  const result = await fetchProductVariants(domain, token, productId);
  if (!result) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }
  if (result.options) {
    result.options = filterOptionsForUi(result.options);
  }
  return result;
}

/**
 * Ensures each selected option value exists on the product (GraphQL) before REST variant create/update.
 * @param {string} domain
 * @param {string} token
 * @param {string|number} productId
 * @param {Record<string, string>} selectionsByName
 */
export async function ensureProductOptionValuesForSelections(
  domain,
  token,
  productId,
  selectionsByName,
) {
  const targetTypes = Object.entries(selectionsByName || {})
    .filter(([, value]) => value != null && String(value).trim())
    .map(([name, value]) => ({
      name: String(name).trim(),
      values: [String(value).trim()],
    }))
    .filter(t => t.name);
  if (!targetTypes.length) return;
  await ensureTargetOptionValuesPresent(domain, token, productId, targetTypes);
}

/**
 * Ensures the auto-assigned Code option exists when duplicate Karat+Size sub-variants need option3.
 * @param {string} domain
 * @param {string} token
 * @param {string|number} productId
 * @param {string} [initialValue] first SKU value when creating the option
 */
export async function ensureSubVariantDiscriminatorOption(
  domain,
  token,
  productId,
  initialValue = '',
) {
  const options = await fetchProductOptionsGraphql(domain, token, productId);
  if (options.some(o => isSubVariantDiscriminatorOption(o.name))) return;

  if (options.length >= 3) {
    const err = new Error(
      'Cannot add sub-variant: product already has 3 option types and no Code slot for duplicate Karat+Size.',
    );
    err.statusCode = 400;
    throw err;
  }

  const skuValue = String(initialValue || '').trim();
  await runOptionsCreate(domain, token, productId, [{
    name: SUB_VARIANT_DISCRIMINATOR_OPTION,
    position: options.length + 1,
    values: skuValue ? [{ name: skuValue }] : [],
  }]);
}

/** Dedupe option names from catalog products GraphQL */
export async function fetchVariantOptionSuggestions(domain, token, limit = 80) {
  const query = `
    query VariantOptionSuggestions($first: Int!) {
      products(first: $first) {
        edges {
          node {
            options {
              name
              values
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphql(domain, token, query, { first: limit });
  const byName = new Map();

  for (const { node } of data?.products?.edges || []) {
    for (const opt of node?.options || []) {
      const name = String(opt?.name || '').trim();
      if (!name || isPlaceholderOptionName(name)) continue;
      const values = (opt.values || [])
        .map(v => String(v))
        .filter(v => Boolean(v) && !isPlaceholderOptionValue(v));
      if (!byName.has(name)) {
        byName.set(name, new Set());
      }
      const set = byName.get(name);
      values.forEach(v => set.add(v));
    }
  }

  const options = Array.from(byName.entries())
    .map(([name, valueSet]) => ({
      name,
      values: Array.from(valueSet).sort(),
    }));

  for (const primaryName of PRIMARY_OPTION_CATALOG) {
    const key = primaryName.toLowerCase();
    if (!options.some(o => o.name.toLowerCase() === key)) {
      options.push({ name: primaryName, values: [] });
    }
  }

  return orderVariantTypes(options);
}
