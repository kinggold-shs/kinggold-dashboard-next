import { shopifyGraphql } from './shopifyProductLookup';
import { fetchProductVariants } from './variantGroupService';
import {
  optionValuesToRestPayload,
  productOptionTypes,
  variantToOptionPayload,
} from './variantModel';

const LEAVE_AS_IS = 'LEAVE_AS_IS';

const PRODUCT_OPTIONS_QUERY = `
  query ProductVariantTypes($id: ID!) {
    product(id: $id) {
      id
      options {
        id
        name
        position
        values
        optionValues {
          id
          name
        }
      }
    }
  }
`;

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
    $variantStrategy: ProductOptionDeleteVariantStrategy
  ) {
    productOptionsDelete(
      productId: $productId
      options: $options
      variantStrategy: $variantStrategy
    ) {
      userErrors { field message code }
    }
  }
`;

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
  return types
    .slice(0, 3)
    .map(t => ({
      name: String(t.name).trim(),
      values: [...new Set(
        (t.values || []).map(v => String(v).trim()).filter(Boolean),
      )],
    }))
    .filter(t => t.name && t.values.length);
}

function isDefaultTitleOnly(options) {
  if (!options?.length || options.length !== 1) return false;
  const opt = options[0];
  const name = String(opt.name || '').trim();
  const values = opt.values || [];
  return name === 'Title' && values.length === 1 && values[0] === 'Default Title';
}

async function fetchProductOptions(domain, token, productId) {
  const data = await shopifyGraphql(domain, token, PRODUCT_OPTIONS_QUERY, {
    id: productGid(productId),
  });
  return data?.product?.options || [];
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
    variantStrategy: LEAVE_AS_IS,
  });
  throwUserErrors(data?.productOptionsDelete?.userErrors, 'productOptionsDelete failed');
}

async function convertDefaultTitleOption(domain, token, productId, titleOption, targetType) {
  const firstValue = targetType.values[0];
  const defaultValueNode = (titleOption.optionValues || []).find(
    v => v.name === 'Default Title',
  );
  const optionValuesToUpdate = defaultValueNode
    ? [{ id: defaultValueNode.id, name: firstValue }]
    : [];
  const optionValuesToAdd = targetType.values
    .filter(v => v !== firstValue)
    .map(name => ({ name }));

  await runOptionUpdate(domain, token, productId, {
    option: { id: titleOption.id, name: targetType.name },
    optionValuesToUpdate,
    optionValuesToAdd,
    optionValuesToDelete: [],
  });
}

async function syncOptionValues(domain, token, productId, currentOption, targetType) {
  const currentNames = new Set((currentOption.optionValues || []).map(v => v.name));
  const targetNames = new Set(targetType.values);
  const optionValuesToAdd = targetType.values
    .filter(name => !currentNames.has(name))
    .map(name => ({ name }));
  const optionValuesToDelete = (currentOption.optionValues || [])
    .filter(v => !targetNames.has(v.name))
    .map(v => v.id);

  const updates = { name: targetType.name };
  if (currentOption.name !== targetType.name) {
    updates.name = targetType.name;
  }

  if (
    currentOption.name !== targetType.name
    || optionValuesToAdd.length
    || optionValuesToDelete.length
  ) {
    await runOptionUpdate(domain, token, productId, {
      option: { id: currentOption.id, name: targetType.name },
      optionValuesToAdd,
      optionValuesToUpdate: [],
      optionValuesToDelete,
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

async function ensureVariantsHaveOptionPositions(domain, token, productId, optionTypes, mco) {
  const product = await fetchProductVariants(domain, token, productId);
  if (!product?.variants?.length) return;

  const types = productOptionTypes(optionTypes.length ? optionTypes : product.options);

  for (const variant of product.variants) {
    const selected = variantToOptionPayload(variant, types);
    const isMain = mco != null && String(variant.sku) === String(mco);
    let changed = false;

    types.forEach(type => {
      if (!selected[type.name] && type.values?.length) {
        selected[type.name] = isMain ? type.values[0] : (type.values[0] || '');
        changed = true;
      }
    });

    if (!changed) continue;

    const restOptions = optionValuesToRestPayload(types, selected);
    const needsPatch = types.some((type, index) => {
      const field = ['option1', 'option2', 'option3'][index];
      return String(variant[field] || '') !== String(restOptions[field] || '');
    });

    if (needsPatch) {
      await restUpdateVariant(domain, token, variant.id, restOptions);
    }
  }
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

  const targetTypes = normalizeTargetTypes(types);
  let currentOptions = await fetchProductOptions(domain, token, productId);

  if (isDefaultTitleOnly(currentOptions) && targetTypes.length > 0) {
    await convertDefaultTitleOption(
      domain,
      token,
      productId,
      currentOptions[0],
      targetTypes[0],
    );
    currentOptions = await fetchProductOptions(domain, token, productId);
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
        currentOptions = await fetchProductOptions(domain, token, productId);
      } else {
        const opt = currentOptions.find(o => o.name === target.name);
        await syncOptionValues(domain, token, productId, opt, target);
        currentOptions = await fetchProductOptions(domain, token, productId);
      }
    }
  } else {
    const targetNames = new Set(targetTypes.map(t => t.name));

    const toDelete = currentOptions
      .filter(o => !targetNames.has(o.name))
      .sort((a, b) => (b.position || 0) - (a.position || 0))
      .map(o => o.id);
    await runOptionsDelete(domain, token, productId, toDelete);
    currentOptions = await fetchProductOptions(domain, token, productId);

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
      currentOptions = await fetchProductOptions(domain, token, productId);
    }
  }

  const refreshed = await fetchProductVariants(domain, token, productId);
  const finalTypes = productOptionTypes(refreshed?.options || targetTypes);
  await ensureVariantsHaveOptionPositions(domain, token, productId, finalTypes, mco);

  const result = await fetchProductVariants(domain, token, productId);
  if (!result) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }
  return result;
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
      if (!name || name === 'Title') continue;
      const values = (opt.values || []).map(v => String(v)).filter(Boolean);
      if (!byName.has(name)) {
        byName.set(name, new Set());
      }
      const set = byName.get(name);
      values.forEach(v => set.add(v));
    }
  }

  return Array.from(byName.entries())
    .map(([name, valueSet]) => ({
      name,
      values: Array.from(valueSet).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
