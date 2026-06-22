/**
 * Force 18K pricing for kinggold items that come back tagged as 21K.
 *
 * The Gweb backend (kinggoldretail.e-jewelry-softwarehouse.com) currently
 * returns FN6 items with `co = 21` for the kinggold branch, so the Gweb
 * serializer computes 21K gold price per gram and 21K total price. The
 * kinggold client is 18K-only, so this helper recomputes the price to 18K
 * client-side using the exact same formula as the Gweb serializer
 * (Gweb/Sup/api/serializers.py Fn6Serializer.get_price / get_gold_price).
 *
 * Guard: only transforms items currently tagged co == 21. Once the Gweb DB
 * is fixed to co == 18, this becomes a no-op and can be removed.
 */

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fn6GoldPrice21PerGram(item) {
  return toNum(item?.gold_price);
}

function compute18kTotDr({ goldPrice18, rate, goCr, prcus, prc }) {
  if (prcus > 0) {
    const totus = (prcus + goldPrice18 / rate) * goCr;
    return totus * rate;
  }
  if (prc > 0) {
    return (prc + goldPrice18) * goCr;
  }
  return goldPrice18 * goCr;
}

function roundHalfAway(n) {
  return Math.sign(n) * Math.floor(Math.abs(n) + 0.5);
}

/**
 * Recompute 18K gold_price + total price for an FN6 item and set them on
 * the item, along with `co = 18`. Returns the same item for chaining.
 * No-op when `item.co` is not 21.
 */
export function applyFn6Price18k(item) {
  if (!item || item.co !== 21) return item;

  const gold21 = fn6GoldPrice21PerGram(item);
  if (gold21 == null) return item;

  const gold18 = (gold21 * 6) / 7;
  const rate = toNum(item.dollar) ?? 1;
  const goCr = toNum(item.go_cr) ?? 0;
  const prcus = toNum(item.prcus) ?? 0;
  const prc = toNum(item.prc) ?? 0;

  const totDr = compute18kTotDr({ goldPrice18: gold18, rate, goCr, prcus, prc });

  item.co = 18;
  item.gold_price = gold18;
  item.price = roundHalfAway(totDr);
  return item;
}

/** Apply 18K transform to a list of items, in place. */
export function applyFn6Price18kList(items) {
  if (!Array.isArray(items)) return items;
  for (const it of items) applyFn6Price18k(it);
  return items;
}

/** Apply 18K transform to either a single item or a paginated list payload. */
export function applyFn6Price18kPayload(payload) {
  if (!payload) return payload;
  if (Array.isArray(payload)) return applyFn6Price18kList(payload);
  if (Array.isArray(payload.results)) {
    applyFn6Price18kList(payload.results);
    return payload;
  }
  applyFn6Price18k(payload);
  return payload;
}

/** Rounded 18K total price as a string (Shopify-friendly, nearest EGP). */
export function roundedFn6Price18k(item) {
  const v = item?.price;
  if (v == null || v === '') return null;
  return String(roundHalfAway(Number(v)));
}

/** Detect whether a response URL is an FN6 endpoint we should transform. */
export function isFn6EndpointUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\/Sup\/api\/fn6(\/|\?|$)/.test(url);
}
