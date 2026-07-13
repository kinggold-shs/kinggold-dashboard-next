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
  ScanBarcode, RotateCcw, Package,
  ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Settings,
} from 'lucide-react';

import { formatFn6Currency } from '../../lib/fn6ItemFields';

const DASH = '—';
const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];
const COLUMNS = [
  { title: 'Code', key: 'mco', sortable: true },
  { title: 'Karat', key: 'co', sortable: true },
  { title: 'Weight (g)', key: 'go_cr', sortable: true },
  { title: 'Qty', key: 'qt', sortable: true },
  // The per-gram making charge added to the 18K rate before multiplying by
  // weight — price = round5((pr18 + prc) × weight). Shown so the price can
  // be traced back to its inputs at a glance.
  { title: 'Making /g', key: 'prc', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
];

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
        <Field label="Gold Price / g" value={item.gold_price != null ? formatFn6Currency(item.gold_price) : DASH} />
        <Field label="USD Rate" value={item.dollar != null ? `$1 = EGP ${Number(item.dollar).toFixed(2)}` : DASH} />
        <Field label="Total Weight" value={item.go_cr != null ? `${Number(item.go_cr).toFixed(3)} g` : DASH} />
        <Field label="Total Price" value={item.price != null ? formatFn6Currency(item.price) : DASH} />
        <Field label="Quantity" value={item.qt} />
        {item.prc > 0 && <Field label="Extra Price (EGP)" value={formatFn6Currency(item.prc)} />}
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

function SoldResult({ item, soldInfo }) {
  const snapshot = soldInfo?.soldSnapshot;
  const soldPrice = snapshot?.soldPrice != null
    ? formatFn6Currency(snapshot.soldPrice)
    : formatFn6Currency(item?.price);
  const gold18k = snapshot?.goldPrice18k != null ? formatFn6Currency(snapshot.goldPrice18k) : DASH;
  const gold21k = snapshot?.goldPrice21k != null ? formatFn6Currency(snapshot.goldPrice21k) : DASH;
  const usdRate = snapshot?.usdRate != null ? `$1 = EGP ${Number(snapshot.usdRate).toFixed(2)}` : DASH;
  const orderName = snapshot?.orderName || DASH;
  const purchasedAt = snapshot?.purchasedAt
    ? new Date(snapshot.purchasedAt).toLocaleDateString()
    : DASH;
  const isChainOnly = soldInfo?.sold === true && snapshot == null;

  // The other inputs to the price formula — price = round5((pr18 + prc) × weight).
  // Without these the sold price can't be reconciled against the 18K rate at sale.
  const making = Number(item?.prcus) > 0
    ? `$${Number(item.prcus).toFixed(2)}`
    : Number(item?.prc) > 0
      ? formatFn6Currency(item.prc)
      : DASH;
  const weight = item?.go_cr != null ? `${Number(item.go_cr).toFixed(3)} g` : DASH;

  return (
    <div className="scan-result scan-result--sold animate-fadeIn">
      <div className="scan-sold-banner">
        <Package size={18} />
        <span className="font-semibold tracking-wide">SOLD</span>
      </div>

      <div className="scan-result-header">
        <div className="scan-result-code">
          <code>{item.mco}</code>
        </div>
        {item.idis && <p className="scan-result-name">{item.idis}</p>}
      </div>

      {isChainOnly && (
        <p className="scan-sold-note">
          Chain-advanced — no order snapshot found. Showing FN6 stored price.
        </p>
      )}

      <div className="scan-fields-grid">
        <Field label="Sold Price" value={soldPrice} />
        <Field label="18K at sale" value={gold18k} />
        <Field label="Making / g" value={making} />
        <Field label="Weight" value={weight} />
        <Field label="21K at sale" value={gold21k} />
        <Field label="USD Rate" value={usdRate} />
        <Field label="Order" value={orderName} />
        <Field label="Sold on" value={purchasedAt} />
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
  const [soldInfo, setSoldInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const [search, setSearch] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleScan = useCallback(async (value) => {
    const mco = (value ?? code).trim();
    if (!mco) return;
    setError('');
    setResult(null);
    setSoldInfo(null);
    setLoading(true);
    try {
      const res = await fn6Api.getByMco(mco);
      setResult(res.data);
      try {
        const r = await fetch(`/api/shopify/is-sold?sku=${encodeURIComponent(mco)}`);
        if (r.ok) {
          const data = await r.json();
          setSoldInfo(data);
        }
      } catch {
        /* ignore - non-fatal */
      }
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
    setSoldInfo(null);
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

  const { data: soldSkusData } = useQuery({
    queryKey: ['sold-skus'],
    queryFn: () => fetch('/api/shopify/sold-skus').then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const soldSkuSet = useMemo(
    () => new Set((soldSkusData?.soldSkus || []).map(String)),
    [soldSkusData],
  );

  const items = listRes?.results || [];
  const filteredItems = useMemo(
    () => items.filter(it => !soldSkuSet.has(String(it.mco))),
    [items, soldSkuSet],
  );
  const hiddenCount = items.length - filteredItems.length;
  const count = listRes?.count || 0;
  const totalPages = Math.ceil(count / 50);

  const handleStockSearch = useCallback(() => { setSearchParam(search.trim()); setPage(1); }, [search]);
  const handleStockClear = useCallback(() => { setSearch(''); setSearchParam(''); setPage(1); }, []);
  const handleSort = useCallback((key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }, [sortKey]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (va == null) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortKey, sortDir]);

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
          <div className="scan-header animate-fadeIn flex justify-between items-start gap-3">
            <div className="flex items-center gap-3">
              <div className="scan-icon-wrap"><ScanBarcode size={22} /></div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Item Scanner</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Scan or type a code — or click any code below</p>
              </div>
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

          {result && !loading && (soldInfo?.sold
            ? <SoldResult key={`sold-${result.mco}`} item={result} soldInfo={soldInfo} />
            : <ScanResult key={result.mco} item={result} />)}
        </div>

        <div className="space-y-3">
          <div className="stock-section-header">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Gold Stock</h2>
              {!listLoading && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(count)} item{count !== 1 ? 's' : ''}
                  {hiddenCount > 0 && (
                    <span className="ml-1 text-amber-600">
                      ({formatNumber(hiddenCount)} hidden — sold)
                    </span>
                  )}
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
            </div>
          </div>

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
                      <TableCell className="text-sm font-mono">
                        {Number(stockItem.prcus) > 0
                          ? `$${Number(stockItem.prcus).toFixed(2)}`
                          : Number(stockItem.prc) > 0
                            ? formatFn6Currency(stockItem.prc)
                            : DASH}
                      </TableCell>
                      <TableCell className="text-sm font-mono font-medium">{stockItem.price != null ? formatFn6Currency(stockItem.price) : DASH}</TableCell>
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
