/**
 * Single source of truth for "is this SKU sold?".
 *
 * The compound rule (both must be true):
 *   1. Stock signal — Gweb `qt <= 0` (out of stock in real life).
 *   2. Sale record — a prior confirmed sale exists for this exact SKU, satisfied by
 *      EITHER a Shopify paid order (soldSnapshot != null) OR the SKU appearing in
 *      a product's `custom.code_chains.soldCodes[]` (chain-tracked sale).
 *
 * Gweb `qt == 0` alone is NOT a sold verdict: a sync glitch, manual correction,
 * or never-stocked item can all show 0. The sale record is what disambiguates.
 */

/**
 * Sale-record half of the compound rule.
 * @param {object|null|undefined} soldSnapshot  result of getSoldPriceForSku(...) (non-null = past paid order)
 * @param {boolean} isInSoldCodes               whether the SKU is in custom.code_chains.soldCodes[]
 * @returns {boolean}
 */
export function hasPriorSale(soldSnapshot, isInSoldCodes) {
  return soldSnapshot != null || isInSoldCodes === true;
}

/**
 * Stock half: Gweb quantity is 0 or negative.
 * null / undefined / NaN return false (unknown stock is NOT sold).
 * @param {unknown} qt
 * @returns {boolean}
 */
export function gwebIsOutOfStock(qt) {
  if (qt == null || qt === '') return false;
  const n = Number(qt);
  if (!Number.isFinite(n)) return false;
  return n <= 0;
}

/**
 * Compound sold verdict: stock <= 0 AND a prior sale record.
 * @param {{ gwebQt?: unknown, soldSnapshot?: object|null, isInSoldCodes?: boolean }} args
 * @returns {boolean}
 */
export function isSkuSold({ gwebQt, soldSnapshot, isInSoldCodes } = {}) {
  if (!gwebIsOutOfStock(gwebQt)) return false;
  return hasPriorSale(soldSnapshot, isInSoldCodes);
}
