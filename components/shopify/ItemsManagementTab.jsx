'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Search, ShoppingBag } from 'lucide-react';
import { fn6Api } from '../../api/fn6';
import { TYPE_COLORS, TYPE_LABELS } from '../../constants/fn6';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import MediaSection from './MediaSection';
import ShopifyPublishForm from './ShopifyPublishForm';
import VariantGroupsEditor from './VariantGroupsEditor';

const DASH = '—';

function formatCurrency(v) {
  if (v == null || Number.isNaN(Number(v))) return DASH;
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

export default function ItemsManagementTab({ initialSku }) {
  const [lookup, setLookup] = useState(initialSku || '');
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [shopifyImageCount, setShopifyImageCount] = useState(0);

  const loadByCode = useCallback(async (codeValue) => {
    const code = String(codeValue || '').trim();
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const res = await fn6Api.getByMco(code);
      setItem(res.data);
      setLookup(code);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Item not found. Use FN6 code / SKU.');
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialSku) {
      setLookup(initialSku);
      loadByCode(initialSku);
    }
  }, [initialSku, loadByCode]);

  const refreshItem = useCallback(async () => {
    if (!item?.mco) return;
    try {
      const res = await fn6Api.getByMco(item.mco);
      setItem(res.data);
    } catch {
      // keep existing item view on refresh failure
    }
  }, [item?.mco]);

  const typeColor = useMemo(() => TYPE_COLORS[item?.co] || 'oklch(55% 0 0)', [item?.co]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Item lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={lookup}
                onChange={e => setLookup(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadByCode(lookup)}
                className="pl-9"
                placeholder="Enter FN6 code or Shopify SKU"
              />
            </div>
            <Button onClick={() => loadByCode(lookup)} disabled={!lookup.trim() || loading}>
              {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              Search
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
        </CardContent>
      </Card>

      {item ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>Selected item</span>
                <span className="type-badge" style={{
                  background: `color-mix(in oklch, ${typeColor} 12%, transparent)`,
                  color: typeColor,
                  border: `1px solid color-mix(in oklch, ${typeColor} 22%, transparent)`,
                }}>
                  {TYPE_LABELS[item.co] || `${item.co}K`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Code:</span> <code>{item.mco}</code></div>
              <div><span className="text-muted-foreground">Name:</span> {item.idis || DASH}</div>
              <div><span className="text-muted-foreground">Weight:</span> {item.go_cr != null ? `${Number(item.go_cr).toFixed(3)} g` : DASH}</div>
              <div><span className="text-muted-foreground">Quantity:</span> {item.qt ?? DASH}</div>
              <div><span className="text-muted-foreground">Total Price:</span> {formatCurrency(item.price)}</div>
              <div><span className="text-muted-foreground">Gold Price/g:</span> {formatCurrency(item.gold_price)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Media management</CardTitle>
            </CardHeader>
            <CardContent>
              <MediaSection
                item={item}
                onMediaChange={refreshItem}
                onUploadingChange={setMediaBusy}
                shopifyImageCount={shopifyImageCount}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag size={16} />
                Publish / update / remove
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ShopifyPublishForm
                key={item.mco}
                item={item}
                mediaBusy={mediaBusy}
                onShopifyImagesChange={setShopifyImageCount}
                onMediaChange={refreshItem}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Variant groups</CardTitle>
            </CardHeader>
            <CardContent>
              <VariantGroupsEditor key={item.mco} item={item} />
            </CardContent>
          </Card>
        </>
      ) : (
        !loading && (
          <div className="empty-state-card border rounded-xl p-10 text-center bg-card">
            <AlertCircle size={24} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Search for an item to start management</p>
            <p className="text-xs text-muted-foreground mt-1">You can search by FN6 code or Shopify SKU.</p>
          </div>
        )
      )}

      {item && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <CheckCircle2 size={12} />
          Changes are applied directly to FN6 media and Shopify product records.
        </div>
      )}
    </div>
  );
}
