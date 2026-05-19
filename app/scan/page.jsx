'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  ScanBarcode, RotateCcw, Package, ShoppingBag,
  ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown,
  CheckCircle2, AlertCircle, Loader2, Plus, X, LayoutDashboard,
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
const PRODUCT_TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Chain', 'Pendant', 'Bangle', 'Other'];

function formatCurrency(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}
function formatNumber(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-US').format(v);
}

function Field({ label, value }) {
  return (
    <div className="scan-field">
      <span className="scan-field-label">{label}</span>
      <span className="scan-field-value">{value ?? DASH}</span>
    </div>
  );
}

// ── Shopify Publish Form ──────────────────────────────────────────────────────
function ShopifyPublishForm({ item }) {
  const [title, setTitle] = useState(item.idis || `Gold Item ${item.mco}`);
  const [productType, setProductType] = useState('Ring');
  const [imageUrls, setImageUrls] = useState(
    item.gold_photo_url ? [item.gold_photo_url] : ['']
  );
  const [price, setPrice] = useState(item.price ? String(Math.round(Number(item.price))) : '');
  const [publishing, setPublishing] = useState(false);
  const [success, setSuccess] = useState(null);
  const [pubError, setPubError] = useState('');

  const bodyHtml = [
    `<p><strong>Karat:</strong> ${TYPE_LABELS[item.co] || `${item.co}K`}</p>`,
    item.go_cr != null ? `<p><strong>Weight:</strong> ${Number(item.go_cr).toFixed(3)}g</p>` : '',
    `<p><strong>SKU / Code:</strong> ${item.mco}</p>`,
    item.idis ? `<p>${item.idis}</p>` : '',
  ].filter(Boolean).join('\n');

  const addUrl = () => setImageUrls(u => [...u, '']);
  const removeUrl = (i) => setImageUrls(u => u.filter((_, idx) => idx !== i));
  const updateUrl = (i, val) => setImageUrls(u => u.map((v, idx) => idx === i ? val : v));

  const handlePublish = async () => {
    setPublishing(true);
    setSuccess(null);
    setPubError('');
    try {
      const res = await fetch('/api/shopify/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body_html: bodyHtml,
          product_type: productType,
          price,
          sku: String(item.mco),
          images: imageUrls.filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      setSuccess(data.shopUrl || 'Published successfully');
    } catch (err) {
      setPubError(err.message || 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="shopify-form">
      <div className="shopify-form-header">
        <ShoppingBag size={15} />
        <span>Publish to Shopify</span>
      </div>
      <div className="shopify-form-body">
        <div className="form-row">
          <label className="form-label">Product Name</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Product title" />
        </div>
        <div className="form-row">
          <label className="form-label">Product Type</label>
          <select value={productType} onChange={e => setProductType(e.target.value)} className="form-select">
            {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Price (EGP)</label>
          <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
        </div>
        <div className="form-row">
          <label className="form-label">Image URLs</label>
          <div className="space-y-2">
            {imageUrls.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  value={url}
                  onChange={e => updateUrl(i, e.target.value)}
                  placeholder="https://…"
                  className="flex-1 text-xs"
                />
                {imageUrls.length > 1 && (
                  <button onClick={() => removeUrl(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addUrl} className="add-url-btn">
              <Plus size={12} /> Add image URL
            </button>
          </div>
        </div>

        {success && (
          <div className="pub-success">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>
              Published!{' '}
              <a href={success} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                View on Shopify
              </a>
            </span>
          </div>
        )}
        {pubError && (
          <div className="pub-error">
            <AlertCircle size={14} className="shrink-0" />
            <span>{pubError}</span>
          </div>
        )}

        <Button onClick={handlePublish} disabled={publishing || !title.trim() || !price} className="w-full">
          {publishing
            ? <><Loader2 size={14} className="animate-spin mr-2" />Publishing…</>
            : <><ShoppingBag size={14} className="mr-2" />Publish to Shopify</>
          }
        </Button>
      </div>
    </div>
  );
}

// ── Stock Tab ─────────────────────────────────────────────────────────────────
function StockTab() {
  const [search, setSearch] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const listParams = useMemo(() => ({
    page,
    page_size: 50,
    ...(searchParam ? { search: searchParam } : {}),
  }), [page, searchParam]);

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['fn6', 'list', listParams],
    queryFn: () => fn6Api.list(listParams).then(r => r.data),
  });

  const items = listRes?.results || [];
  const count = listRes?.count || 0;
  const totalPages = Math.ceil(count / 50);

  const handleSearch = useCallback(() => { setSearchParam(search.trim()); setPage(1); }, [search]);
  const handleClear = useCallback(() => { setSearch(''); setSearchParam(''); setPage(1); }, []);
  const handleSort = useCallback((key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }, [sortKey]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (va == null) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, sortKey, sortDir]);

  const SortIcon = ({ columnKey }) => {
    if (sortKey !== columnKey) return <ChevronsUpDown size={12} className="text-neutral-400" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-gold-500" /> : <ChevronDown size={12} className="text-gold-500" />;
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Gold Stock</h1>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {formatNumber(count)} item{count !== 1 ? 's' : ''}
              {searchParam && <span className="ml-1 text-gold-600">&middot; filtered</span>}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button size="sm" onClick={handleSearch}>Search</Button>
        {searchParam && <Button size="sm" variant="ghost" onClick={handleClear}>Clear</Button>}
      </div>

      {isLoading ? (
        <div className="table-wrap p-5 space-y-3">
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
              {sortedItems.map((item, idx) => (
                <TableRow
                  key={item.mco}
                  style={{ '--i': idx, animationDelay: `${Math.min(idx, 12) * 25}ms` }}
                  className="animate-fadeInRow"
                >
                  <TableCell><code className="text-sm font-mono font-medium">{item.mco}</code></TableCell>
                  <TableCell>
                    <span className="type-badge" style={{
                      background: `color-mix(in oklch, ${TYPE_COLORS[item.co] || 'oklch(55% 0 0)'} 12%, transparent)`,
                      color: TYPE_COLORS[item.co] || 'oklch(55% 0 0)',
                      border: `1px solid color-mix(in oklch, ${TYPE_COLORS[item.co] || 'oklch(55% 0 0)'} 22%, transparent)`,
                    }}>
                      {TYPE_LABELS[item.co] || `${item.co}K`}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{item.go_cr != null ? `${Number(item.go_cr).toFixed(3)}g` : DASH}</TableCell>
                  <TableCell className="text-sm">{item.qt ?? DASH}</TableCell>
                  <TableCell className="text-sm font-mono font-medium">{item.price != null ? formatCurrency(item.price) : DASH}</TableCell>
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
        <div className="empty-state-card border rounded-xl p-12 text-center bg-card">
          <div className="empty-state-icon"><ScanBarcode size={24} className="text-muted-foreground mx-auto" /></div>
          <h2 className="text-lg font-semibold mb-1 mt-3">No items found</h2>
          <p className="text-sm text-muted-foreground">Try a different search term.</p>
        </div>
      )}
    </div>
  );
}

// ── Scanner Tab ───────────────────────────────────────────────────────────────
function ScannerTab() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleScan = async (value) => {
    const mco = (value ?? code).trim();
    if (!mco) return;
    setError('');
    setResult(null);
    setShowPublish(false);
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
  };

  const handleReset = () => {
    setCode('');
    setResult(null);
    setError('');
    setShowPublish(false);
    inputRef.current?.focus();
  };

  const item = result;
  const typeColor = item ? (TYPE_COLORS[item.co] || 'oklch(55% 0 0)') : null;

  return (
    <div className="scan-page">
      <div className="scan-header animate-fadeIn">
        <div className="scan-icon-wrap"><ScanBarcode size={22} /></div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Item Scanner</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Scan or type a code to view item details</p>
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

      {item && !loading && (
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

          {item.gold_photo_url && (
            <div className="scan-media">
              <img src={item.gold_photo_url} alt={item.idis || String(item.mco)} className="scan-photo" />
            </div>
          )}

          <div className="scan-fields-grid">
            <Field label="Gold Price / g" value={item.gold_price != null ? formatCurrency(item.gold_price) : DASH} />
            <Field label="USD Rate" value={item.dollar != null ? `$1 = EGP ${Number(item.dollar).toFixed(2)}` : DASH} />
            <Field label="Total Weight" value={item.go_cr != null ? `${Number(item.go_cr).toFixed(3)} g` : DASH} />
            <Field label="Total Price" value={item.price != null ? formatCurrency(item.price) : DASH} />
            <Field label="Quantity" value={item.qt} />
            <Field label="Mfg / g" value={item.sal_pr && item.sal_pr !== '0' ? item.sal_pr : DASH} />
            {item.prc > 0 && <Field label="Extra Price (EGP)" value={formatCurrency(item.prc)} />}
            {item.prcus > 0 && <Field label="Extra Price (USD)" value={`$${Number(item.prcus).toFixed(2)}`} />}
          </div>

          <div className="scan-result-actions">
            <button className="shopify-toggle-btn" onClick={() => setShowPublish(p => !p)}>
              <ShoppingBag size={14} />
              {showPublish ? 'Hide Shopify Form' : 'Publish to Shopify'}
            </button>
          </div>

          {showPublish && <ShopifyPublishForm key={item.mco} item={item} />}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ScanPage() {
  const [tab, setTab] = useState('scanner');

  return (
    <DashboardShell>
      <div className="tab-bar">
        <button className={`tab-btn${tab === 'scanner' ? ' active' : ''}`} onClick={() => setTab('scanner')}>
          <ScanBarcode size={14} />
          Scanner
        </button>
        <button className={`tab-btn${tab === 'stock' ? ' active' : ''}`} onClick={() => setTab('stock')}>
          <LayoutDashboard size={14} />
          Stock
        </button>
      </div>
      {tab === 'scanner' ? <ScannerTab /> : <StockTab />}
    </DashboardShell>
  );
}
