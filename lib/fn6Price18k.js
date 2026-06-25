// The one pricing formula — identical to copy-of-king-gold-dazzle/assets/kg-live-price.js
export function computeFn6Price({ pr18, usdRate, weight, prc, prcus }) {
  if (!Number.isFinite(pr18) || pr18 <= 0) return null;
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const rate = Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 1;
  const p = Number.isFinite(prc) ? prc : 0;
  const pu = Number.isFinite(prcus) ? prcus : 0;
  let total;
  if (pu > 0) {
    const totus = (pu + pr18 / rate) * weight;
    total = totus * rate;
  } else if (p > 0) {
    total = (p + pr18) * weight;
  } else {
    total = pr18 * weight;
  }
  return Math.sign(total) * Math.floor(Math.abs(total) + 0.5);
}

export function roundToNearest5(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n / 5) * 5;
}

export function applyFn6Price18k(item, pr18, usdRate) {
  const raw = computeFn6Price({
    pr18: Number(pr18),
    usdRate: Number(usdRate),
    weight: Number(item.go_cr),
    prc: Number(item.prc),
    prcus: Number(item.prcus),
  });
  return roundToNearest5(raw);
}
