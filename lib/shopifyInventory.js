import { shopifyGraphql } from './shopifyProductLookup';

/** Parse GWEB quantity from variant create/update request body. */
export function parseInventoryQuantityFromBody(body) {
  if (!body || body.inventory_management !== 'shopify' || body.inventory_quantity == null) {
    return null;
  }
  const qty = parseInt(String(body.inventory_quantity), 10);
  if (!Number.isFinite(qty) || qty < 0) return null;
  return qty;
}

/** REST variant fields to enable Shopify tracking (quantity may need a follow-up set). */
export function restVariantInventoryFields(quantity) {
  if (quantity == null) return {};
  return {
    inventory_management: 'shopify',
    inventory_quantity: quantity,
  };
}

function variantGid(variantId) {
  const id = String(variantId).trim();
  if (!id) return null;
  return id.startsWith('gid://') ? id : `gid://shopify/ProductVariant/${id}`;
}

/** Minimal locations query (id only) — avoids isActive / fulfillsOnlineOrders scope needs. */
const LOCATIONS_QUERY = `
  query ShopLocations {
    locations(first: 10) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const VARIANT_INVENTORY_ITEM_QUERY = `
  query VariantInventoryItem($id: ID!) {
    productVariant(id: $id) {
      inventoryItem {
        id
        tracked
      }
    }
  }
`;

const INVENTORY_ACTIVATE_MUTATION = `
  mutation InventoryActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int!) {
    inventoryActivate(
      inventoryItemId: $inventoryItemId
      locationId: $locationId
      available: $available
    ) {
      userErrors { field message }
    }
  }
`;

const SET_ON_HAND_MUTATION = `
  mutation InventorySetOnHand($input: InventorySetOnHandQuantitiesInput!) {
    inventorySetOnHandQuantities(input: $input) {
      userErrors { field message }
    }
  }
`;

/** User-facing message for Shopify scope / field access errors. */
export function formatShopifyInventoryAccessError(err) {
  const msg = err?.message || String(err);
  if (/read_locations/i.test(msg) || /\bisActive\b/i.test(msg)) {
    return (
      'Shopify app is missing the read_locations access scope (required to list stock locations). '
      + 'In Shopify Admin → Settings → Apps → your custom app → Configuration, enable read_locations, '
      + 'reinstall or re-authorize the app, then retry.'
    );
  }
  if (/write_inventory/i.test(msg)) {
    return (
      'Shopify app is missing the write_inventory access scope (required to set on-hand quantities). '
      + 'Enable write_inventory on the custom app and re-authorize, then retry.'
    );
  }
  return msg;
}

function pickStockLocation(locations) {
  const node = (locations || []).map(edge => edge?.node).find(n => n?.id);
  return node || null;
}

function mutationUserErrors(payload, key) {
  const errors = payload?.[key]?.userErrors;
  if (!errors?.length) return null;
  return errors.map(e => e.message).filter(Boolean).join('; ');
}

/**
 * Preflight: can this token list at least one location for inventory sync?
 * @returns {Promise<{ ok: true, locationId: string, locationCount: number } | { ok: false, code: string, error: string }>}
 */
export async function canAccessShopLocations(domain, token) {
  try {
    const locationData = await shopifyGraphql(domain, token, LOCATIONS_QUERY);
    const edges = locationData?.locations?.edges || [];
    const location = pickStockLocation(edges);
    if (!location?.id) {
      return {
        ok: false,
        code: 'no_locations',
        error: 'No Shopify locations found. Add a location in Shopify Admin → Settings → Locations before syncing inventory.',
      };
    }
    return { ok: true, locationId: location.id, locationCount: edges.length };
  } catch (err) {
    return {
      ok: false,
      code: 'access_denied',
      error: formatShopifyInventoryAccessError(err),
    };
  }
}

/** True when the request body will trigger GWEB → Shopify on-hand sync after variant save. */
export function bodyRequestsInventorySync(body) {
  return parseInventoryQuantityFromBody(body) != null;
}

/**
 * Set on-hand quantity at the shop's primary location (2024-10 GraphQL).
 * Enables tracking at the location when the item is not yet stocked there.
 */
export async function setVariantOnHandQuantity(domain, token, variantId, quantity) {
  const qty = parseInt(String(quantity), 10);
  if (!Number.isFinite(qty) || qty < 0) return;

  const variantGidValue = variantGid(variantId);
  if (!variantGidValue) return;

  let variantData;
  try {
    variantData = await shopifyGraphql(domain, token, VARIANT_INVENTORY_ITEM_QUERY, {
      id: variantGidValue,
    });
  } catch (err) {
    throw new Error(formatShopifyInventoryAccessError(err));
  }
  const inventoryItemId = variantData?.productVariant?.inventoryItem?.id;
  if (!inventoryItemId) return;

  const preflight = await canAccessShopLocations(domain, token);
  if (!preflight.ok) {
    throw new Error(preflight.error);
  }
  const locationId = preflight.locationId;

  const setInput = {
    reason: 'correction',
    setQuantities: [
      {
        inventoryItemId,
        locationId,
        quantity: qty,
      },
    ],
  };

  let setResult;
  try {
    setResult = await shopifyGraphql(domain, token, SET_ON_HAND_MUTATION, { input: setInput });
  } catch (err) {
    throw new Error(formatShopifyInventoryAccessError(err));
  }
  const setErr = mutationUserErrors(setResult, 'inventorySetOnHandQuantities');
  if (!setErr) return;

  let activateResult;
  try {
    activateResult = await shopifyGraphql(domain, token, INVENTORY_ACTIVATE_MUTATION, {
      inventoryItemId,
      locationId,
      available: qty,
    });
  } catch (err) {
    throw new Error(formatShopifyInventoryAccessError(err));
  }
  const activateErr = mutationUserErrors(activateResult, 'inventoryActivate');
  if (activateErr) {
    throw new Error(formatShopifyInventoryAccessError(new Error(activateErr)));
  }
}

/** Apply REST inventory fields and sync on-hand qty after variant save. */
export async function applyVariantInventoryFromBody(domain, token, body, variantId) {
  const qty = parseInventoryQuantityFromBody(body);
  if (qty == null || variantId == null) return null;
  await setVariantOnHandQuantity(domain, token, variantId, qty);
  return qty;
}
