// The one pricing formula — mirrors _compute_item_18k_price in
// Gweb/Cod/shopify_sync.py, including the catalog (gco) making-charge
// branches. Those two branches used to be missing here, so this path priced
// pieces off a stale piece-level prc while GWEB billed the catalog charge.
// Making-charge priority, first match wins:
//   gcoPrUs (catalog USD/g) > prcus (piece USD/g) > gcoPr (catalog EGP/g) > prc (piece EGP/g)
export function computeFn6Price({ pr18, usdRate, weight, prc, prcus, gcoPr, gcoPrUs }) {
  if (!Number.isFinite(pr18) || pr18 <= 0) return null;
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const rate = Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 1;
  const p = Number.isFinite(prc) ? prc : 0;
  const pu = Number.isFinite(prcus) ? prcus : 0;
  const cp = Number.isFinite(gcoPr) ? gcoPr : 0;
  const cpu = Number.isFinite(gcoPrUs) ? gcoPrUs : 0;
  let total;
  if (cpu > 0) {
    total = ((cpu + pr18 / rate) * weight) * rate;
  } else if (pu > 0) {
    const totus = (pu + pr18 / rate) * weight;
    total = totus * rate;
  } else if (cp > 0) {
    total = (cp + pr18) * weight;
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
    gcoPr: Number(item.gco_pr),
    gcoPrUs: Number(item.gco_pr_us),
  });
  return roundToNearest5(raw);
}
