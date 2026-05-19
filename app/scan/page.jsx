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
  CheckCircle2, AlertCircle, Loader2, Plus, X, ImageIcon, Film,
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

// ── Media Section ─────────────────────────────────────────────────────────────
function MediaSection({ item, imageUrls, onImageUrlsChange, videoUrls, onVideoUrlsChange }) {
  const addImg = () => onImageUrlsChange([...imageUrls, '']);
  const removeImg = (i) => onImageUrlsChange(imageUrls.filter((_, idx) => idx !== i));
  const updateImg = (i, val) => onImageUrlsChange(imageUrls.map((v, idx) => idx === i ? val : v));

  const addVid = () => onVideoUrlsChange([...videoUrls, '']);
  const removeVid = (i) => onVideoUrlsChange(videoUrls.filter((_, idx) => idx !== i));
  const updateVid = (i, val) => onVideoUrlsChange(videoUrls.map((v, idx) => idx === i ? val : v));

  const validImages = imageUrls.filter(Boolean);

  return (
    <div className="media-section">
      <div className="media-section-title">
        <ImageIcon size={14} />
        <span>Media</span>
      </div>

      {/* Image previews */}
      {validImages.length > 0 && (
        <div className="media-preview-row">
          {validImages.map((url, i) => (
            <div key={i} className="media-thumb">
              <img src={url} alt="" onError={e => { e.target.style.display = 'none'; }} />
            </div>
          ))}
        </div>
      )}

      {/* Image URLs */}
      <div className="media-url-group">
        <div className="media-url-label"><ImageIcon size={11} /> Images</div>
        <div className="space-y-2">
          {imageUrls.map((url, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input value={url} onChange={e => updateImg(i, e.target.value)} placeholder="https://…" className="flex-1 text-xs" />
              {imageUrls.length > 1 && (
                <button onClick={() => removeImg(i)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button onClick={addImg} className="add-url-btn"><Plus size={12} /> Add image</button>
        </div>
      </div>

      {/* Video URLs */}
      <div className="media-url-group">
        <div className="media-url-label"><Film size={11} /> Videos</div>
        <div className="space-y-2">
          {videoUrls.map((url, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input value={url} onChange={e => updateVid(i, e.target.value)} placeholder="https://…" className="flex-1 text-xs" />
              <button onClick={() => removeVid(i)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={addVid} className="add-url-btn"><Plus size={12} /> Add video</button>
        </div>
      </div>
    </div>
  );
}

// ── Shopify Publish Form ──────────────────────────────────────────────────────
function ShopifyPublishForm({ item, imageUrls }) {
  const [title, setTitle] = useState(item.idis || `Gold Item ${item.mco}`);
  const [productType, setProductType] = useState('Ring');
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

  const handlePublish = async () => {
    setPublishing(true);
    setSuccess(null);
    setPubError('');
    try {
      const res = await fetch('/api/shopify/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, body_html: bodyHtml, product_type: productType,
          price, sku: String(item.mco),
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
        <div className="media-used-note">
          <ImageIcon size={12} />
          <span>{imageUrls.filter(Boolean).length} image{imageUrls.filter(Boolean).length !== 1 ? 's' : ''} from Media section will be attached</span>
        </div>
        {success && (
          <div className="pub-success">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>Published! <a href={success} target="_blank" rel="noopener noreferrer" className="underline font-medium">View on Shopify</a></span>
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

// ── Scan Result Card ──────────────────────────────────────────────────────────
function ScanResult({ item, onReset }) {
  const typeColor = TYPE_COLORS[item.co] || 'oklch(55% 0 0)';
  const [showPublish, setShowPublish] = useState(false);
  const [imageUrls, setImageUrls] = useState(item.gold_photo_url ? [item.gold_photo_url] : ['']);
  const [videoUrls, setVideoUrls] = useState(['']);

  return (
    <div className="scan-result animate-fadeIn">
      {/* Header */}
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

      {/* Specs */}
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

      {/* Media */}
      <MediaSection
        item={item}
        imageUrls={imageUrls}
        onImageUrlsChange={setImageUrls}
        videoUrls={videoUrls}
        onVideoUrlsChange={setVideoUrls}
      />

      {/* Shopify toggle */}
      <div className="scan-result-actions">
        <button className="shopify-toggle-btn" onClick={() => setShowPublish(p => !p)}>
          <ShoppingBag size={14} />
          {showPublish ? 'Hide Shopify Form' : 'Publish to Shopify'}
        </button>
      </div>

      {showPublish && <ShopifyPublishForm key={item.mco} item={item} imageUrls={imageUrls} />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ScanPage() {
  // Scanner state
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Stock list state
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

  // Stock list
  const listParams = useMemo(() => ({
    page, page_size: 50,
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

  const scanCodeFromList = (mco) => {
    const mcoStr = String(mco);
    setCode(mcoStr);
    handleScan(mcoStr);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DashboardShell>
      <div className="space-y-6">

        {/* ── Scanner section ── */}
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

          {result && !loading && <ScanResult key={result.mco} item={result} onReset={handleReset} />}
        </div>

        {/* ── Stock list ── */}
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
