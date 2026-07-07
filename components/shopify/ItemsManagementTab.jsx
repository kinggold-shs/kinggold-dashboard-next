'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Search } from 'lucide-react';
import { fn6Api } from '../../api/fn6';
import { TYPE_COLORS, TYPE_LABELS } from '../../constants/fn6';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import MediaSection from './MediaSection';
import ShopifyPublishForm from './ShopifyPublishForm';
import VariantsPanel from './VariantsPanel';

import { formatFn6Currency } from '../../lib/fn6ItemFields';

const DASH = '—';

export default function ItemsManagementTab({ initialSku }) {
  const [lookup, setLookup] = useState(initialSku || '');
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [shopifyImageCount, setShopifyImageCount] = useState(0);
  const [variantsRefreshKey, setVariantsRefreshKey] = useState(0);
  const [soldInfo, setSoldInfo] = useState(null);

  const handleShopifyListingUpdated = useCallback(() => {
    setVariantsRefreshKey(k => k + 1);
  }, []);

  const fetchSoldInfo = useCallback(async (mco) => {
    const code = String(mco || '').trim();
    if (!code) {
      setSoldInfo(null);
      return;
    }
    try {
      const res = await fetch(`/api/shopify/is-sold?sku=${encodeURIComponent(code)}`);
      if (!res.ok) {
        setSoldInfo(null);
        return;
      }
      const data = await res.json();
      setSoldInfo(data);
    } catch {
      setSoldInfo(null);
    }
  }, []);

  const loadByCode = useCallback(async (codeValue) => {
    const code = String(codeValue || '').trim();
    if (!code) return;
    setLoading(true);
    setError('');
    setSoldInfo(null);
    try {
      const res = await fn6Api.getByMco(code);
      setItem(res.data);
      setLookup(code);
      fetchSoldInfo(res.data?.mco);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Item not found. Use FN6 code / SKU.');
      setItem(null);
      setSoldInfo(null);
    } finally {
      setLoading(false);
    }
  }, [fetchSoldInfo]);

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
      fetchSoldInfo(res.data?.mco);
    } catch {
      // keep existing item view on refresh failure
    }
  }, [item?.mco, fetchSoldInfo]);

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
          {soldInfo?.sold ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <span>Sold</span>
                  <Badge variant="destructive" className="font-normal">
                    Price-locked
                  </Badge>
                  <span className="type-badge" style={{
                    background: `color-mix(in oklch, ${typeColor} 12%, transparent)`,
                    color: typeColor,
                    border: `1px solid color-mix(in oklch, ${typeColor} 22%, transparent)`,
                  }}>
                    {TYPE_LABELS[item.co] || `${item.co}K`}
                  </span>
                </CardTitle>
                <CardDescription>
                  {soldInfo.soldSnapshot
                    ? 'Locked at sale time — will not drift with live gold price.'
                    : 'Chain-advanced — no order snapshot found.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Sold Price:</span>{' '}
                  {soldInfo.soldSnapshot
                    ? formatFn6Currency(soldInfo.soldSnapshot.soldPrice) ?? DASH
                    : formatFn6Currency(item.price)}
                </div>
                <div>
                  <span className="text-muted-foreground">18K at sale:</span>{' '}
                  {formatFn6Currency(soldInfo.soldSnapshot?.goldPrice18k) ?? DASH}
                </div>
                <div>
                  <span className="text-muted-foreground">21K at sale:</span>{' '}
                  {formatFn6Currency(soldInfo.soldSnapshot?.goldPrice21k) ?? DASH}
                </div>
                <div>
                  <span className="text-muted-foreground">USD Rate:</span>{' '}
                  {soldInfo.soldSnapshot?.usdRate != null
                    ? `$1 = EGP ${Number(soldInfo.soldSnapshot.usdRate).toFixed(2)}`
                    : DASH}
                </div>
                <div>
                  <span className="text-muted-foreground">Order:</span>{' '}
                  {soldInfo.soldSnapshot?.orderName ?? '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">Sold on:</span>{' '}
                  {soldInfo.soldSnapshot?.purchasedAt
                    ? new Intl.DateTimeFormat('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                      }).format(new Date(soldInfo.soldSnapshot.purchasedAt))
                    : DASH}
                </div>
                {!soldInfo.soldSnapshot ? (
                  <p className="sm:col-span-2 lg:col-span-4 text-xs italic text-muted-foreground">
                    chain-advanced — no order snapshot found
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

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
              <div><span className="text-muted-foreground">Weight:</span> {item.go_cr != null ? `${Number(item.go_cr).toFixed(3)} g` : DASH}</div>
              <div><span className="text-muted-foreground">Quantity:</span> {item.qt ?? DASH}</div>
              <div><span className="text-muted-foreground">Total Price:</span> {formatFn6Currency(item.price)}</div>
              <div><span className="text-muted-foreground">Gold Price/g:</span> {formatFn6Currency(item.gold_price)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Media & Shopify management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              <MediaSection
                item={item}
                onMediaChange={refreshItem}
                onUploadingChange={setMediaBusy}
                shopifyImageCount={shopifyImageCount}
              />
              <ShopifyPublishForm
                key={item.mco}
                item={item}
                mediaBusy={mediaBusy}
                onShopifyImagesChange={setShopifyImageCount}
                onMediaChange={refreshItem}
                onShopifyListingUpdated={handleShopifyListingUpdated}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Variants</CardTitle>
              <CardDescription>
                Option types, main variant (item SKU), and sub-variants synced to Shopify.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <VariantsPanel key={`${item.mco}-${variantsRefreshKey}`} item={item} />
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
          Photos and catalog media are updated here. Shopify listing, variants, and variant groups are saved to your Shopify store.
        </div>
      )}
    </div>
  );
}


