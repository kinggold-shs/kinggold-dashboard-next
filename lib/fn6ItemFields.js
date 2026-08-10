/** FN6 / GWEB item field helpers (API uses `qt` for quantity). */

export const FN6_DASH = '—';

export function fn6Quantity(item) {
  if (!item) return null;
  const raw = item.qt ?? item.quantity;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** True when GWEB reports stock available for sub-variant assign (qty > 0). */
export function fn6HasAssignableStock(item) {
  const qty = fn6Quantity(item);
  return qty != null && qty > 0;
}

/**
 * Stock gate for FN6 pickers — GWEB quantity is authoritative; Shopify listing is not.
 * @returns {'in_stock' | 'out_of_stock' | 'unknown'}
 */
export function fn6StockStatus(item) {
  const qty = fn6Quantity(item);
  if (qty == null) return 'unknown';
  return qty > 0 ? 'in_stock' : 'out_of_stock';
}

export function formatFn6Weight(item) {
  if (item?.go_cr == null || item.go_cr === '') return FN6_DASH;
  return `${Number(item.go_cr).toFixed(3)} g`;
}

export function formatFn6Currency(v) {
  if (v == null || Number.isNaN(Number(v))) return FN6_DASH;
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

/**
 * GWEB carries two different per-gram charges and they are easy to confuse:
 *
 *   tot_pg / totus_pg  مصنعيه الجرام — the making charge, GHS14's "مصنعيه الجرام"
 *   tot_cr / totus_cr  اجمالي الاجر  — that charge × go_cr, GHS14's "اجمالي الاجر"
 *   prc / prcus        سعر البيـع    — the per-gram selling charge added to the
 *                                      18K rate: price = round5((pr18 + prc) × weight)
 *
 * The scan card used to label `prc` as "Mfg / g", which is the wrong number and
 * also the reason editing an item's weight appeared to leave the making charge
 * untouched — `prc` is per gram, so it never moves. Only اجمالي الاجر does.
 */

/** مصنعيه الجرام — the per-gram making charge. Does not change with weight. */
export function formatFn6MfgPerGram(item) {
  if (Number(item?.totus_pg) > 0) return `$${Number(item.totus_pg).toFixed(2)} /g`;
  if (Number(item?.tot_pg) > 0) return `${formatFn6Currency(item.tot_pg)} /g`;
  return FN6_DASH;
}

/**
 * اجمالي الاجر — the making charge for the whole piece.
 *
 * Derived from مصنعيه الجرام × weight rather than read from the stored
 * tot_cr / totus_cr, so it always reflects the weight currently on the record.
 * The stored column is only a fallback for rows that carry a total but no rate.
 */
export function formatFn6MfgTotal(item) {
  const weight = Number(item?.go_cr);
  const hasWeight = Number.isFinite(weight) && weight > 0;

  if (Number(item?.totus_pg) > 0) {
    const total = hasWeight ? Number(item.totus_pg) * weight : Number(item?.totus_cr);
    return Number.isFinite(total) && total > 0 ? `$${total.toFixed(2)}` : FN6_DASH;
  }
  if (Number(item?.tot_pg) > 0) {
    const total = hasWeight ? Number(item.tot_pg) * weight : Number(item?.tot_cr);
    return Number.isFinite(total) && total > 0 ? formatFn6Currency(total) : FN6_DASH;
  }
  if (Number(item?.totus_cr) > 0) return `$${Number(item.totus_cr).toFixed(2)}`;
  if (Number(item?.tot_cr) > 0) return formatFn6Currency(item.tot_cr);
  return FN6_DASH;
}

/** سعر البيـع per gram — the charge that actually sits inside the customer price. */
export function formatFn6SellChargePerGram(item) {
  if (Number(item?.prcus) > 0) return `$${Number(item.prcus).toFixed(2)} /g`;
  if (Number(item?.prc) > 0) return `${formatFn6Currency(item.prc)} /g`;
  return FN6_DASH;
}

/** First variant on the product that defines Shopify inventory tracking. */
export function productInventoryManagement(variants = []) {
  const tracked = (variants || []).find(
    v => v.inventory_management && String(v.inventory_management) !== 'null',
  );
  return tracked?.inventory_management || null;
}

export function shouldSyncInventoryToShopify(variants) {
  return productInventoryManagement(variants) === 'shopify';
}

/** Binary Shopify inventory payload — available (1) or unavailable (0). */
export function shopifyBinaryInventoryPayload(available) {
  return {
    inventory_management: 'shopify',
    inventory_quantity: available ? 1 : 0,
  };
}

/** @deprecated Use shopifyBinaryInventoryPayload for chain-based availability. */
export function shopifyInventoryPayloadFromGwebQty(gwebQty) {
  const qty = gwebQty != null ? Number(gwebQty) : null;
  if (qty == null || !Number.isFinite(qty) || qty < 0) return {};
  return shopifyBinaryInventoryPayload(qty > 0);
}
