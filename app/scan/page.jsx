'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import DashboardShell from '../../components/DashboardShell';
import { fn6Api } from '../../api/fn6';
import { TYPE_LABELS, TYPE_COLORS } from '../../constants/fn6';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../components/ui/table';
import {
  ScanBarcode, RotateCcw, Package, RefreshCw, Tags,
  ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Settings,
} from 'lucide-react';

const DASH = '—';
const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];
const COLUMNS = [
  { title: 'Code', key: 'mco', sortable: true },
  { title: 'Karat', key: 'co', sortable: true },
  { title: 'Weight (g)', key: 'go_cr', sortable: true },
  { title: 'Qty', key: 'qt', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
];

function formatCurrency(v) {
  if (v == null || Number.isNaN(Number(v))) return DASH;
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function formatNumber(v) {
  if (v == null || Number.isNaN(Number(v))) return DASH;
  return new Intl.NumberFormat('en-US').format(v);
}

function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function Field({ label, value }) {
  return (
    <div className="scan-field">
      <span className="scan-field-label">{label}</span>
      <span className="scan-field-value">{value ?? DASH}</span>
    </div>
  );
}

function ScanResult({ item }) {
  const typeColor = TYPE_COLORS[item.co] || 'oklch(55% 0 0)';

  return (
    <div className="scan-result animate-fadeIn">
      <div className="scan-result-header">
        <div className="scan-result-code">
          <code>{item.mco}</code>
          <span className="type-badge" style={{
            background: `color-mix(in oklch, ${typeColor} 12%, transparent)`,
            color: typeColor,
            border: `1px solid color-mix(in oklch, ${typeColor} 22%, transparent)`,
          }}>
            {TYPE_LABELS[item.co] || `${item.co}K`}
          </span>
        </div>
        {item.idis && <p className="scan-result-name">{item.idis}</p>}
      </div>

      <div className="scan-fields-grid">
        <Field label="Gold Price / g" value={item.gold_price != null ? formatCurrency(item.gold_price) : DASH} />
        <Field label="USD Rate" value={item.dollar != null ? `$1 = EGP ${Number(item.dollar).toFixed(2)}` : DASH} />
        <Field label="Total Weight" value={item.go_cr != null ? `${Number(item.go_cr).toFixed(3)} g` : DASH} />
        <Field label="Total Price" value={item.price != null ? formatCurrency(item.price) : DASH} />
        <Field label="Quantity" value={item.qt} />
        {item.prc > 0 && <Field label="Extra Price (EGP)" value={formatCurrency(item.prc)} />}
        {item.prcus > 0 && <Field label="Extra Price (USD)" value={`$${Number(item.prcus).toFixed(2)}`} />}
      </div>

      <div className="scan-result-actions">
        <Link href={`/shopify?tab=manage&sku=${encodeURIComponent(String(item.mco))}`}>
          <Button variant="outline" size="sm">
            <Settings size={14} className="mr-1" />
            Manage on Shopify
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function ScanPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const [search, setSearch] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState('');
  const [bulkProgress, setBulkProgress] = useState(null);

  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaResult, setMetaResult] = useState(null);
  const [metaError, setMetaError] = useState('');
  const [metaProgress, setMetaProgress] = useState(null);

  const handleBulkSync18k = useCallback(async () => {
    if (bulkSyncing) return;
    const ok = window.confirm(
      'Push 18K prices for ALL FN6 items to Shopify variants?\n\n'
      + 'This will recompute every item to 18K and update the Shopify variant price '
      + 'for every item where it differs. This action cannot be undone from this page.',
    );
    if (!ok) return;

    setBulkSyncing(true);
    setBulkError('');
    setBulkResult(null);
    setBulkProgress({ batch: 0, totalBatches: 0, done: 0, total: 0 });

    const startTime = Date.now();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    try {
      // 1) Collect all FN6 items (18K prices applied client-side via axios interceptor).
      const updates = [];
      const PAGE_SIZE_BULK = 100;
      let bulkPage = 1;
      const MAX_PAGES = 200;
      for (;;) {
        const res = await fn6Api.list({ page: bulkPage, page_size: PAGE_SIZE_BULK });
        const results = res.data?.results || [];
        for (const it of results) {
          if (it?.mco != null && it?.price != null && it.price !== '') {
            updates.push({ mco: String(it.mco), price: Number(it.price) });
          }
        }
        const count = res.data?.count || 0;
        if (results.length < PAGE_SIZE_BULK) break;
        if (bulkPage * PAGE_SIZE_BULK >= count) break;
        if (bulkPage >= MAX_PAGES) break;
        bulkPage += 1;
      }

      if (updates.length === 0) {
        setBulkResult({
          total: 0, updated: 0, skipped: 0, notFound: 0, errors: [],
          collected: 0, failedBatches: [], elapsedMs: Date.now() - startTime,
        });
        return;
      }

      // 2) Chunk into small batches so each serverless call stays under
      //    Vercel's 10s hobby-plan function timeout.
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        batches.push(updates.slice(i, i + BATCH_SIZE));
      }

      const agg = { total: 0, updated: 0, skipped: 0, notFound: 0, errors: [], failedBatches: [] };

      for (let bi = 0; bi < batches.length; bi += 1) {
        const batch = batches[bi];
        setBulkProgress({
          batch: bi + 1, totalBatches: batches.length,
          done: agg.total, total: updates.length,
          updated: agg.updated, skipped: agg.skipped, notFound: agg.notFound,
          errors: agg.errors.length, failedBatches: agg.failedBatches.length,
        });

        try {
          const syncRes = await fetch('/api/shopify/refresh-price-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: batch }),
          });
          const data = await syncRes.json().catch(() => ({}));
          if (!syncRes.ok) {
            throw new Error(data?.error || `HTTP ${syncRes.status}`);
          }
          agg.total += data.total || 0;
          agg.updated += data.updated || 0;
          agg.skipped += data.skipped || 0;
          agg.notFound += data.notFound || 0;
          if (Array.isArray(data.errors)) agg.errors.push(...data.errors);
        } catch (batchErr) {
          agg.failedBatches.push({
            batch: bi + 1,
            message: batchErr?.message || String(batchErr),
            skus: batch.map((u) => u.mco),
          });
        }

        if (bi < batches.length - 1) await sleep(200);
      }

      setBulkResult({
        ...agg,
        collected: updates.length,
        elapsedMs: Date.now() - startTime,
      });
    } catch (err) {
      setBulkError(err?.message || 'Bulk sync failed');
    } finally {
      setBulkSyncing(false);
      setBulkProgress(null);
    }
  }, [bulkSyncing]);

  const handleBulkSyncMetafields = useCallback(async () => {
    if (metaSyncing) return;
    const ok = window.confirm(
      'Backfill gweb_weight / gweb_prc / gweb_prcus metafields on ALL Shopify variants?\n\n'
      + 'Required for the theme to compute 18K prices locally. One-time operation.',
    );
    if (!ok) return;

    setMetaSyncing(true);
    setMetaError('');
    setMetaResult(null);
    setMetaProgress({ batch: 0, totalBatches: 0, done: 0, total: 0 });

    const startTime = Date.now();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    try {
      // 1) Collect all FN6 items with their raw weight / prc / prcus.
      const items = [];
      const PAGE_SIZE = 100;
      let pg = 1;
      for (;;) {
        const res = await fn6Api.list({ page: pg, page_size: PAGE_SIZE });
        const results = res.data?.results || [];
        for (const it of results) {
          if (it?.mco != null) {
            items.push({
              mco: String(it.mco),
              weight: it.go_cr ?? null,
              prc: it.prc ?? null,
              prcus: it.prcus ?? null,
            });
          }
        }
        const count = res.data?.count || 0;
        if (results.length < PAGE_SIZE) break;
        if (pg * PAGE_SIZE >= count) break;
        pg += 1;
      }

      if (items.length === 0) {
        setMetaResult({ total: 0, updated: 0, skipped: 0, notFound: 0, errors: [], failedBatches: [], elapsedMs: Date.now() - startTime });
        return;
      }

      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));

      const agg = { total: 0, updated: 0, skipped: 0, notFound: 0, errors: [], failedBatches: [] };

      for (let bi = 0; bi < batches.length; bi += 1) {
        const batch = batches[bi];
        setMetaProgress({
          batch: bi + 1, totalBatches: batches.length,
          done: agg.total, total: items.length,
          updated: agg.updated, notFound: agg.notFound,
          errors: agg.errors.length, failedBatches: agg.failedBatches.length,
        });
        try {
          const res = await fetch('/api/shopify/sync-metafields-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: batch }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
          agg.total += data.total || 0;
          agg.updated += data.updated || 0;
          agg.skipped += data.skipped || 0;
          agg.notFound += data.notFound || 0;
          if (Array.isArray(data.errors)) agg.errors.push(...data.errors);
        } catch (batchErr) {
          agg.failedBatches.push({ batch: bi + 1, message: batchErr?.message || String(batchErr), skus: batch.map((u) => u.mco) });
        }
        if (bi < batches.length - 1) await sleep(200);
      }

      setMetaResult({ ...agg, collected: items.length, elapsedMs: Date.now() - startTime });
    } catch (err) {
      setMetaError(err?.message || 'Metafield sync failed');
    } finally {
      setMetaSyncing(false);
      setMetaProgress(null);
    }
  }, [metaSyncing]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleScan = useCallback(async (value) => {
    const mco = (value ?? code).trim();
    if (!mco) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fn6Api.getByMco(mco);
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Item not found');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [code]);

  const handleReset = () => {
    setCode('');
    setResult(null);
    setError('');
    inputRef.current?.focus();
  };

  const listParams = useMemo(() => ({
    page,
    page_size: 50,
    ...(searchParam ? { search: searchParam } : {}),
  }), [page, searchParam]);

  const { data: listRes, isLoading: listLoading } = useQuery({
    queryKey: ['fn6', 'list', listParams],
    queryFn: () => fn6Api.list(listParams).then(r => r.data),
  });

  const items = listRes?.results || [];
  const count = listRes?.count || 0;
  const totalPages = Math.ceil(count / 50);

  const handleStockSearch = useCallback(() => { setSearchParam(search.trim()); setPage(1); }, [search]);
  const handleStockClear = useCallback(() => { setSearch(''); setSearchParam(''); setPage(1); }, []);
  const handleSort = useCallback((key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }, [sortKey]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (va == null) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, sortKey, sortDir]);

  const SortIcon = ({ columnKey }) => {
    if (sortKey !== columnKey) return <ChevronsUpDown size={12} className="text-neutral-400" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-gold-500" />
      : <ChevronDown size={12} className="text-gold-500" />;
  };

  const scanCodeFromList = (mco) => {
    const mcoStr = String(mco);
    setCode(mcoStr);
    handleScan(mcoStr);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="scan-page">
          <div className="scan-header animate-fadeIn">
            <div className="scan-icon-wrap"><ScanBarcode size={22} /></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Item Scanner</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Scan or type a code — or click any code below</p>
            </div>
          </div>

          <div className="scan-input-wrap animate-fadeIn" style={{ animationDelay: '60ms' }}>
            <div className="relative flex-1">
              <ScanBarcode size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScan()}
                placeholder="Scan barcode or type code…"
                className="scan-input"
                autoComplete="off"
                inputMode="numeric"
                disabled={loading}
              />
            </div>
            <Button onClick={() => handleScan()} disabled={!code.trim() || loading} className="scan-btn">
              {loading ? 'Looking up…' : 'Search'}
            </Button>
            {(result || error) && (
              <Button variant="ghost" size="icon" onClick={handleReset} className="shrink-0" aria-label="Reset">
                <RotateCcw size={16} />
              </Button>
            )}
          </div>

          {error && !loading && (
            <div className="scan-error animate-slideDown">
              <Package size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && !loading && <ScanResult key={result.mco} item={result} />}
        </div>

        <div className="space-y-3">
          <div className="stock-section-header">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Gold Stock</h2>
              {!listLoading && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(count)} item{count !== 1 ? 's' : ''}
                  {searchParam && <span className="ml-1 text-gold-600">&middot; filtered</span>}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <ScanBarcode size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleStockSearch()}
                  className="pl-8 h-8 text-sm w-40"
                />
              </div>
              <Button size="sm" className="h-8" onClick={handleStockSearch}>Search</Button>
              {searchParam && <Button size="sm" variant="ghost" className="h-8" onClick={handleStockClear}>Clear</Button>}
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleBulkSync18k}
                disabled={bulkSyncing}
                title="Recompute all items to 18K and push to Shopify variants"
              >
                <RefreshCw size={14} className={`mr-1 ${bulkSyncing ? 'animate-spin' : ''}`} />
                {bulkSyncing
                  ? `Syncing 18K… ${bulkProgress?.batch || 0}/${bulkProgress?.totalBatches || 0}`
                  : 'Sync 18K → Shopify'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleBulkSyncMetafields}
                disabled={metaSyncing}
                title="Backfill gweb_weight / gweb_prc / gweb_prcus metafields on all variants (one-time)"
              >
                <Tags size={14} className={`mr-1 ${metaSyncing ? 'animate-spin' : ''}`} />
                {metaSyncing
                  ? `Syncing meta… ${metaProgress?.batch || 0}/${metaProgress?.totalBatches || 0}`
                  : 'Sync metafields'}
              </Button>
            </div>
          </div>

          {bulkSyncing && bulkProgress && (
            <div className="scan-result animate-fadeIn" style={{ padding: '0.5rem 1rem' }}>
              <p className="text-xs text-muted-foreground">
                Batch <strong className="text-foreground">{bulkProgress.batch}</strong> of{' '}
                <strong className="text-foreground">{bulkProgress.totalBatches}</strong>
                {' · '}
                {bulkProgress.done}/{bulkProgress.total} items processed
                {bulkProgress.updated > 0 && <> · <strong className="text-foreground">{bulkProgress.updated}</strong> updated</>}
                {bulkProgress.skipped > 0 && <> · <strong className="text-foreground">{bulkProgress.skipped}</strong> already correct</>}
                {bulkProgress.notFound > 0 && <> · <strong className="text-foreground">{bulkProgress.notFound}</strong> not on Shopify</>}
                {bulkProgress.errors > 0 && <> · <strong className="text-foreground">{bulkProgress.errors}</strong> errors</>}
                {bulkProgress.failedBatches > 0 && <> · <strong className="text-destructive">{bulkProgress.failedBatches}</strong> failed batches</>}
              </p>
            </div>
          )}

          {bulkError && (
            <div className="scan-error animate-slideDown">
              <Package size={16} className="shrink-0" />
              <span>Bulk sync failed: {bulkError}</span>
            </div>
          )}
          {bulkResult && !bulkError && (
            <div className="scan-result animate-fadeIn" style={{ padding: '0.75rem 1rem' }}>
              <p className="text-sm">
                18K sync done — <strong>{bulkResult.updated}</strong> updated,{' '}
                <strong>{bulkResult.skipped}</strong> already correct,{' '}
                <strong>{bulkResult.notFound}</strong> not on Shopify,{' '}
                <strong>{bulkResult.errors?.length || 0}</strong> errors
                {bulkResult.failedBatches?.length > 0 && (
                  <span className="text-destructive"> · <strong>{bulkResult.failedBatches.length}</strong> failed batches</span>
                )}
                {bulkResult.collected != null && (
                  <span className="text-muted-foreground"> · {bulkResult.collected} items collected</span>
                )}
                {bulkResult.elapsedMs != null && (
                  <span className="text-muted-foreground"> · {formatElapsed(bulkResult.elapsedMs)}</span>
                )}
              </p>
              {bulkResult.errors?.length > 0 && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Show errors</summary>
                  <ul className="mt-1 space-y-0.5">
                    {bulkResult.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e.sku || '(no sku)'}: {e.message}</li>
                    ))}
                    {bulkResult.errors.length > 20 && <li>…and {bulkResult.errors.length - 20} more</li>}
                  </ul>
                </details>
              )}
              {bulkResult.failedBatches?.length > 0 && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Show failed batches</summary>
                  <ul className="mt-1 space-y-0.5">
                    {bulkResult.failedBatches.map((b, i) => (
                      <li key={i}>Batch {b.batch}: {b.message} ({b.skus.length} SKUs)</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {metaSyncing && metaProgress && (
            <div className="scan-result animate-fadeIn" style={{ padding: '0.5rem 1rem' }}>
              <p className="text-xs text-muted-foreground">
                Meta batch <strong className="text-foreground">{metaProgress.batch}</strong> of{' '}
                <strong className="text-foreground">{metaProgress.totalBatches}</strong>
                {' · '}
                {metaProgress.done}/{metaProgress.total} items processed
                {metaProgress.updated > 0 && <> · <strong className="text-foreground">{metaProgress.updated}</strong> updated</>}
                {metaProgress.notFound > 0 && <> · <strong className="text-foreground">{metaProgress.notFound}</strong> not on Shopify</>}
                {metaProgress.errors > 0 && <> · <strong className="text-foreground">{metaProgress.errors}</strong> errors</>}
                {metaProgress.failedBatches > 0 && <> · <strong className="text-destructive">{metaProgress.failedBatches}</strong> failed batches</>}
              </p>
            </div>
          )}

          {metaError && (
            <div className="scan-error animate-slideDown">
              <Package size={16} className="shrink-0" />
              <span>Metafield sync failed: {metaError}</span>
            </div>
          )}
          {metaResult && !metaError && (
            <div className="scan-result animate-fadeIn" style={{ padding: '0.75rem 1rem' }}>
              <p className="text-sm">
                Metafield sync done — <strong>{metaResult.updated}</strong> weight metafields written,{' '}
                <strong>{metaResult.notFound}</strong> not on Shopify,{' '}
                <strong>{metaResult.errors?.length || 0}</strong> errors
                {metaResult.failedBatches?.length > 0 && (
                  <span className="text-destructive"> · <strong>{metaResult.failedBatches.length}</strong> failed batches</span>
                )}
                {metaResult.collected != null && (
                  <span className="text-muted-foreground"> · {metaResult.collected} items collected</span>
                )}
                {metaResult.elapsedMs != null && (
                  <span className="text-muted-foreground"> · {formatElapsed(metaResult.elapsedMs)}</span>
                )}
              </p>
              {metaResult.errors?.length > 0 && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Show errors</summary>
                  <ul className="mt-1 space-y-0.5">
                    {metaResult.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e.sku || '(no sku)'}: {e.message}</li>
                    ))}
                    {metaResult.errors.length > 20 && <li>…and {metaResult.errors.length - 20} more</li>}
                  </ul>
                </details>
              )}
            </div>
          )}

          {listLoading ? (
            <div className="table-wrap p-4 space-y-3">
              {SKELETON_ROWS.map(i => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-5 w-20 rounded" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded" />
                  <Skeleton className="h-5 w-8 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                </div>
              ))}
            </div>
          ) : items.length > 0 ? (
            <div className="table-wrap overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map(col => (
                      <TableHead key={col.title} className={col.sortable ? 'cursor-pointer select-none' : ''}>
                        <span className="inline-flex items-center gap-1" onClick={() => col.sortable && handleSort(col.key)}>
                          {col.title}
                          {col.sortable && <SortIcon columnKey={col.key} />}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((stockItem, idx) => (
                    <TableRow
                      key={stockItem.mco}
                      style={{ '--i': idx, animationDelay: `${Math.min(idx, 12) * 25}ms` }}
                      className="animate-fadeInRow"
                    >
                      <TableCell>
                        <button
                          className="stock-code-btn"
                          onClick={() => scanCodeFromList(stockItem.mco)}
                          title="Click to scan this item"
                        >
                          <code>{stockItem.mco}</code>
                          <ScanBarcode size={11} className="stock-code-scan-icon" />
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className="type-badge" style={{
                          background: `color-mix(in oklch, ${TYPE_COLORS[stockItem.co] || 'oklch(55% 0 0)'} 12%, transparent)`,
                          color: TYPE_COLORS[stockItem.co] || 'oklch(55% 0 0)',
                          border: `1px solid color-mix(in oklch, ${TYPE_COLORS[stockItem.co] || 'oklch(55% 0 0)'} 22%, transparent)`,
                        }}>
                          {TYPE_LABELS[stockItem.co] || `${stockItem.co}K`}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{stockItem.go_cr != null ? `${Number(stockItem.go_cr).toFixed(3)}g` : DASH}</TableCell>
                      <TableCell className="text-sm">{stockItem.qt ?? DASH}</TableCell>
                      <TableCell className="text-sm font-mono font-medium">{stockItem.price != null ? formatCurrency(stockItem.price) : DASH}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="pagination-bar">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Page <span className="text-foreground">{page}</span> of {totalPages}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft size={14} />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state-card border rounded-xl p-8 text-center bg-card">
              <div className="empty-state-icon"><ScanBarcode size={20} className="text-muted-foreground mx-auto" /></div>
              <p className="text-sm text-muted-foreground mt-3">No items found</p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
