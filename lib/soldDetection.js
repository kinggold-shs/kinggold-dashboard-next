/**
 * Single source of truth for "is this SKU sold?".
 *
 * PRIMARY signal — a confirmed paid sale exists for this exact SKU:
 *   - a Shopify paid order lists the SKU in its `kg_paid_snapshot` items[]
 *     (soldSnapshot != null), OR
 *   - the SKU appears in a product's `custom.code_chains.soldCodes[]`
 *     (chain-tracked sale, advanced by the orders/paid webhook).
 *
 * The paid-order snapshot is the source of truth (matches what /history shows).
 * Gweb `qt` is a SECONDARY, supporting signal — it often lags behind the Shopify
 * sale because Gweb syncs independently, so we must NOT gate the sold verdict
 * on `qt <= 0`. A SKU with a paid Shopify order is sold regardless of what Gweb
 * currently reports.
 *
 * `qt <= 0` alone is NOT a sold verdict (sync glitch / manual correction /
 * never-stocked item). The sale record is what disambiguates.
 */

/**
 * Sale-record half of the rule. A prior confirmed sale exists.
 * @param {object|null|undefined} soldSnapshot  result of getSoldPriceForSku(...) (non-null = past paid order)
 * @param {boolean} isInSoldCodes               whether the SKU is in custom.code_chains.soldCodes[]
 * @returns {boolean}
 */
export function hasPriorSale(soldSnapshot, isInSoldCodes) {
  return soldSnapshot != null || isInSoldCodes === true;
}

/**
 * Gweb stock signal: quantity is 0 or negative.
 * null / undefined / NaN return false (unknown stock is NOT out-of-stock).
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
 * Sold verdict.
 *
 * SOLD when a prior confirmed sale exists (paid Shopify order OR chain soldCodes).
 * Gweb `qt <= 0` alone is not enough; a paid order alone IS enough.
 *
 * @param {{ gwebQt?: unknown, soldSnapshot?: object|null, isInSoldCodes?: boolean }} args
 * @returns {boolean}
 */
export function isSkuSold({ gwebQt, soldSnapshot, isInSoldCodes } = {}) {
  return hasPriorSale(soldSnapshot, isInSoldCodes);
}
