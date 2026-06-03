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

/** REST + client payload: enable Shopify tracking from GWEB quantity. */
export function shopifyInventoryPayloadFromGwebQty(gwebQty) {
  const qty = gwebQty != null ? Number(gwebQty) : null;
  if (qty == null || !Number.isFinite(qty) || qty < 0) return {};
  return {
    inventory_management: 'shopify',
    inventory_quantity: Math.trunc(qty),
  };
}
