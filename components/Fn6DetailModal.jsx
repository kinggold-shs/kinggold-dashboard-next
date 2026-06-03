'use client';

import { useState } from 'react';
import MediaGallery from '../components/ui/MediaGallery';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetBody, SheetFooter,
} from '../components/ui/sheet';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { TYPE_LABELS, TYPE_COLORS } from '../constants/fn6';
import { X } from 'lucide-react';

const DASH = '—';

function formatCurrency(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function Field({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? DASH}</span>
    </div>
  );
}

export default function Fn6DetailModal({ item, onClose }) {
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 300);
  };

  const typeColor = TYPE_COLORS[item?.type] || 'oklch(55% 0 0)';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <code className="font-mono">{item?.code}</code>
            <span
              className="type-badge text-xs"
              style={{
                background: `color-mix(in oklch, ${typeColor} 12%, transparent)`,
                color: typeColor,
                border: `1px solid color-mix(in oklch, ${typeColor} 22%, transparent)`,
              }}
            >
              {TYPE_LABELS[item?.type] || `${item?.type}K`}
            </span>
          </SheetTitle>
          <SheetDescription>{item?.name || item?.type_name || 'Item details'}</SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {/* Main image */}
          {item?.image && (
            <div className="rounded-lg overflow-hidden border bg-muted/20 aspect-square w-full max-w-[200px] mx-auto">
              <img src={item.image} alt={item.code} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="dialog-section">
            <div className="dialog-section-title">Details</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code" value={item?.code} />
              <Field label="Karat" value={TYPE_LABELS[item?.type] || `${item?.type}K`} />
              <Field label="Category" value={item?.type_name} />
              <Field label="Name" value={item?.name} />
              <Field label="Description" value={item?.description} />
              <Field label="Branch" value={item?.branch_name} />
            </div>
          </div>

          <div className="dialog-section">
            <div className="dialog-section-title">Specifications</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (EGP)" value={item?.price != null ? formatCurrency(item.price) : DASH} />
              <Field label="Total Price" value={item?.total_price != null ? formatCurrency(item.total_price) : DASH} />
              <Field label="Weight (g)" value={item?.weight != null ? `${Number(item.weight).toFixed(3)} g` : DASH} />
              <Field label="Total Weight" value={item?.total_weight != null ? `${Number(item.total_weight).toFixed(3)} g` : DASH} />
              <Field label="Mfg / g" value={item?.manufacturing || DASH} />
              <Field label="Quantity" value={item?.qt} />
            </div>
          </div>

          <MediaGallery mco={item?.code} />
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={close}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
