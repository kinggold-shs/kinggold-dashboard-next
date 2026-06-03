'use client';

import { Loader2 } from 'lucide-react';
import { TYPE_COLORS, TYPE_LABELS } from '../constants/fn6';
import {
  FN6_DASH,
  fn6Quantity,
  formatFn6Currency,
  formatFn6Weight,
} from '../lib/fn6ItemFields';

function InventoryCompare({ gwebQty, shopifyQty, shopifyTracked }) {
  if (gwebQty == null && shopifyQty == null && shopifyTracked == null) return null;

  const gwebLabel = gwebQty != null ? String(gwebQty) : FN6_DASH;
  const shopifyLabel =
    shopifyTracked && shopifyQty != null
      ? String(shopifyQty)
      : shopifyTracked === false
        ? 'Not tracked'
        : FN6_DASH;

  const mismatch =
    shopifyTracked &&
    gwebQty != null &&
    shopifyQty != null &&
    Number(gwebQty) !== Number(shopifyQty);

  return (
    <div className="col-span-2 sm:col-span-3 space-y-2 pt-1 border-t border-border/60">
      <h5 className="dialog-section-title">Inventory (read-only)</h5>
      <div className="grid grid-cols-2 gap-2 max-w-md">
        <div className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5">
          <span className="text-[11px] text-muted-foreground block">GWEB qty</span>
          <span className="text-sm font-medium tabular-nums">{gwebLabel}</span>
        </div>
        <div className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5">
          <span className="text-[11px] text-muted-foreground block">Shopify qty</span>
          <span
            className={`text-sm font-medium tabular-nums ${mismatch ? 'text-amber-800 dark:text-amber-400' : ''}`}
          >
            {shopifyLabel}
          </span>
        </div>
      </div>
      {mismatch ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-500">
          GWEB and Shopify quantities differ on the listed product.
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, value, id }) {
  const fieldId = id || `fn6-meta-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="flex flex-col gap-0.5 min-w-0" role="group" aria-labelledby={fieldId}>
      <span
        id={fieldId}
        className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </span>
      <span className="text-sm font-medium text-foreground truncate">{value ?? FN6_DASH}</span>
    </div>
  );
}

/**
 * Read-only GWEB/FN6 item fields from fn6Api (list or getByMco).
 */
export default function Fn6ItemMetadataPanel({
  item,
  loading = false,
  className = '',
  shopifyInventoryQuantity = null,
  shopifyInventoryTracked = null,
  showInventoryCompare = false,
}) {
  if (loading) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-border/80 bg-muted/10 px-3 py-4 text-sm text-muted-foreground ${className}`}
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
        Loading item details from GWEB…
      </div>
    );
  }

  if (!item?.mco) return null;

  const typeColor = TYPE_COLORS[item.co] || 'oklch(55% 0 0)';

  return (
    <section
      className={`dialog-section space-y-3 ${className}`}
      aria-label={`GWEB details for ${item.mco}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        {item.gold_photo_url ? (
          <div className="rounded-md overflow-hidden border bg-muted/20 size-16 shrink-0">
            <img
              src={item.gold_photo_url}
              alt=""
              className="size-full object-cover"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-mono font-medium">{item.mco}</code>
            {item.co != null ? (
              <span
                className="type-badge text-xs"
                style={{
                  background: `color-mix(in oklch, ${typeColor} 12%, transparent)`,
                  color: typeColor,
                  border: `1px solid color-mix(in oklch, ${typeColor} 22%, transparent)`,
                }}
              >
                {TYPE_LABELS[item.co] || `${item.co}K`}
              </span>
            ) : null}
          </div>
          {item.idis ? (
            <p className="text-sm text-muted-foreground leading-snug">{item.idis}</p>
          ) : null}
        </div>
      </div>

      <div>
        <h5 className="dialog-section-title mb-2">Specifications</h5>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5">
          <Field label="Weight" value={formatFn6Weight(item)} />
          <Field
            label="GWEB quantity"
            value={fn6Quantity(item) != null ? String(fn6Quantity(item)) : FN6_DASH}
          />
          <Field label="Total price" value={formatFn6Currency(item.price)} />
          <Field label="Gold price / g" value={formatFn6Currency(item.gold_price)} />
          <Field label="USD rate" value={
            item.dollar != null ? `$1 = EGP ${Number(item.dollar).toFixed(2)}` : FN6_DASH
          }
          />
          {item.tot_cr != null && Number(item.tot_cr) !== 0 ? (
            <Field label="Total credit" value={formatFn6Weight({ go_cr: item.tot_cr })} />
          ) : null}
          {item.sal_pr != null && Number(item.sal_pr) > 0 ? (
            <Field label="Sale price" value={formatFn6Currency(item.sal_pr)} />
          ) : null}
          {item.prc != null && Number(item.prc) > 0 ? (
            <Field label="Extra price (EGP)" value={formatFn6Currency(item.prc)} />
          ) : null}
          {item.prcus != null && Number(item.prcus) > 0 ? (
            <Field label="Extra price (USD)" value={`$${Number(item.prcus).toFixed(2)}`} />
          ) : null}
          {showInventoryCompare ? (
            <InventoryCompare
              gwebQty={fn6Quantity(item)}
              shopifyQty={shopifyInventoryQuantity}
              shopifyTracked={shopifyInventoryTracked}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
