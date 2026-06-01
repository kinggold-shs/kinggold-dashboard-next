'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardShell from '../../components/DashboardShell';
import { fn6Api } from '../../api/fn6';
import { TYPE_LABELS, TYPE_COLORS } from '../../constants/fn6';
import { buildDefaultSpec, specToBodyHtml, bodyHtmlToSpec } from '../../lib/fn6Spec';
import { resolveMediaUrl, getItemImageUrls } from '../../lib/mediaUrl';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../components/ui/table';
import {
  ScanBarcode, RotateCcw, Package, ShoppingBag,
  ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown,
  CheckCircle2, AlertCircle, Loader2, Plus, X, ImageIcon, Film, Trash2,
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

function mapMediaFromItem(item) {
  return (item.media_files || []).map(m => ({
    id: m.id,
    url: resolveMediaUrl(m.url),
    media_type: m.media_type,
    status: 'saved',
    preview: resolveMediaUrl(m.url),
    loadError: false,
  }));
}

// ── Media Section ─────────────────────────────────────────────────────────────
function MediaSection({ item, onMediaChange, onUploadingChange }) {
  const imgInputRef = useRef(null);
  const vidInputRef = useRef(null);
  const [goldPhotoUrl, setGoldPhotoUrl] = useState(() => resolveMediaUrl(item.gold_photo_url));
  const [goldPhotoError, setGoldPhotoError] = useState(false);
  const [goldPhotoRetry, setGoldPhotoRetry] = useState(0);
  const [files, setFiles] = useState(() => mapMediaFromItem(item));
  const [mediaError, setMediaError] = useState('');

  useEffect(() => {
    setGoldPhotoUrl(resolveMediaUrl(item.gold_photo_url));
    setGoldPhotoError(false);
    setGoldPhotoRetry(0);
    setFiles(mapMediaFromItem(item));
    setMediaError('');
  }, [item.mco, item.gold_photo_url, item.media_files]);

  const uploading = files.some(f => f.status === 'uploading');
  const hasError = files.some(f => f.status === 'error');

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const uploadFile = async (file, mediaType) => {
    const tempId = `${Date.now()}-${Math.random()}`;
    const preview = URL.createObjectURL(file);
    setMediaError('');
    setFiles(prev => [...prev, { _tempId: tempId, preview, media_type: mediaType, status: 'uploading', loadError: false }]);
    try {
      const res = await fn6Api.uploadMedia(item.mco, file, mediaType);
      const { id, url } = res.data;
      const resolved = resolveMediaUrl(url);
      setFiles(prev => prev.map(f =>
        f._tempId === tempId
          ? { id, url: resolved, media_type: mediaType, status: 'saved', preview: resolved, loadError: false }
          : f,
      ));
      onMediaChange?.();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) setMediaError('Login required to upload media.');
      else if (status === 404) setMediaError('Item not found for media upload.');
      else setMediaError(err?.response?.data?.error || 'Upload failed.');
      setFiles(prev => prev.map(f =>
        f._tempId === tempId ? { ...f, status: 'error' } : f,
      ));
    }
  };

  const handleImgSelect = (e) => {
    Array.from(e.target.files).forEach(f => uploadFile(f, 'image'));
    e.target.value = '';
  };
  const handleVidSelect = (e) => {
    Array.from(e.target.files).forEach(f => uploadFile(f, 'video'));
    e.target.value = '';
  };

  const removeFile = async (f) => {
    if (f.id) {
      if (!window.confirm('Delete this file from the item?')) return;
      setMediaError('');
      setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'uploading' } : x));
      try {
        await fn6Api.deleteMedia(f.id);
        setFiles(prev => prev.filter(x => x.id !== f.id));
        onMediaChange?.();
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401) setMediaError('Login required to delete media.');
        else setMediaError('Delete failed.');
        setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'error' } : x));
      }
    } else {
      setFiles(prev => prev.filter(x => x._tempId !== f._tempId));
    }
  };

  const hasMedia = goldPhotoUrl || files.length > 0;
  const allSaved = files.length > 0 && !uploading && !hasError;

  return (
    <div className="media-section">
      <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImgSelect} />
      <input ref={vidInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleVidSelect} />

      <div className="media-section-title">
        <ImageIcon size={14} />
        <span>Media</span>
        <div className="media-save-status">
          {uploading && <><Loader2 size={11} className="animate-spin" /><span>Saving…</span></>}
          {allSaved && <><CheckCircle2 size={11} className="text-success-600" /><span className="text-success-600">Saved</span></>}
          {hasError && <><AlertCircle size={11} className="text-destructive" /><span className="text-destructive">Error</span></>}
        </div>
      </div>

      {mediaError && (
        <p className="text-xs text-destructive px-1">{mediaError}</p>
      )}

      <div className="media-preview-row">
        {goldPhotoUrl && (
          <div className="media-thumb" title="Main photo (VPS)">
            {!goldPhotoError ? (
              <img
                key={`gold-${goldPhotoRetry}`}
                src={goldPhotoUrl}
                alt=""
                onError={() => setGoldPhotoError(true)}
              />
            ) : (
              <div className="media-thumb-broken">
                <AlertCircle size={14} />
                <button
                  type="button"
                  className="text-[10px] underline mt-1"
                  onClick={() => { setGoldPhotoError(false); setGoldPhotoRetry(r => r + 1); }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
        {files.map((f) => (
          <div key={f.id ?? f._tempId} className={`media-thumb media-thumb-new${f.status === 'uploading' ? ' media-thumb-loading' : ''}`}>
            {f.media_type === 'video' ? (
              <video src={f.preview} className="w-full h-full object-cover" />
            ) : f.loadError ? (
              <div className="media-thumb-broken">
                <AlertCircle size={14} />
                <button
                  type="button"
                  className="text-[10px] underline mt-1"
                  onClick={() => setFiles(prev => prev.map(x =>
                    (x.id ?? x._tempId) === (f.id ?? f._tempId) ? { ...x, loadError: false, preview: x.url || x.preview } : x,
                  ))}
                >
                  Retry
                </button>
              </div>
            ) : (
              <img
                src={f.preview}
                alt=""
                onError={() => setFiles(prev => prev.map(x =>
                  (x.id ?? x._tempId) === (f.id ?? f._tempId) ? { ...x, loadError: true } : x,
                ))}
              />
            )}
            {f.status === 'uploading' && (
              <div className="media-thumb-overlay"><Loader2 size={16} className="animate-spin text-white" /></div>
            )}
            {f.media_type === 'video' && <div className="media-video-badge"><Film size={10} /></div>}
            {f.status !== 'uploading' && (
              <button type="button" className="media-thumb-remove" onClick={() => removeFile(f)} aria-label="Remove">
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="media-add-row">
        <button type="button" className="add-url-btn" onClick={() => imgInputRef.current?.click()}>
          <Plus size={12} /><ImageIcon size={12} /> Add image
        </button>
        <button type="button" className="add-url-btn" onClick={() => vidInputRef.current?.click()}>
          <Plus size={12} /><Film size={12} /> Add video
        </button>
      </div>
    </div>
  );
}

// ── Shopify Publish Form ──────────────────────────────────────────────────────
function ShopifyPublishForm({ item, mediaBusy }) {
  const [title, setTitle] = useState(item.idis || `Gold Item ${item.mco}`);
  const [productType, setProductType] = useState('Ring');
  const [price, setPrice] = useState(item.price ? String(Math.round(Number(item.price))) : '');
  const [status, setStatus] = useState('active');
  const [spec, setSpec] = useState(() => buildDefaultSpec(item));
  const [replaceImages, setReplaceImages] = useState(true);

  const [shopifyLoading, setShopifyLoading] = useState(true);
  const [productId, setProductId] = useState(null);
  const [variantId, setVariantId] = useState(null);
  const [shopUrl, setShopUrl] = useState(null);

  const [saving, setSaving] = useState(false);
  const [pubError, setPubError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const imageUrls = useMemo(() => getItemImageUrls(item), [item]);
  const totalImages = imageUrls.length;
  const isListed = Boolean(productId);
  const busy = saving || deleting || mediaBusy;

  const loadShopify = useCallback(async () => {
    setShopifyLoading(true);
    setPubError('');
    try {
      const res = await fetch(`/api/shopify/products/by-sku?sku=${encodeURIComponent(item.mco)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to check Shopify');
      if (data.found) {
        setProductId(data.productId);
        setVariantId(data.variantId);
        setTitle(data.title || item.idis || `Gold Item ${item.mco}`);
        setProductType(data.product_type || 'Ring');
        setPrice(
          data.price != null
            ? String(Math.round(Number(data.price)))
            : (item.price ? String(Math.round(Number(item.price))) : ''),
        );
        setStatus(data.status || 'active');
        setSpec(bodyHtmlToSpec(data.body_html) || buildDefaultSpec(item));
        setShopUrl(data.shopUrl);
      } else {
        setProductId(null);
        setVariantId(null);
        setShopUrl(null);
        setTitle(item.idis || `Gold Item ${item.mco}`);
        setProductType('Ring');
        setPrice(item.price ? String(Math.round(Number(item.price))) : '');
        setStatus('active');
        setSpec(buildDefaultSpec(item));
      }
    } catch (err) {
      setPubError(err.message || 'Could not load Shopify status');
    } finally {
      setShopifyLoading(false);
    }
  }, [item]);

  useEffect(() => {
    loadShopify();
  }, [loadShopify]);

  const buildPayload = () => ({
    title,
    body_html: specToBodyHtml(spec),
    product_type: productType,
    price,
    status,
    sku: String(item.mco),
    images: replaceImages ? imageUrls.map(src => ({ src })) : undefined,
  });

  const handlePublish = async () => {
    setSaving(true);
    setPubError('');
    setSuccessMsg('');
    try {
      const payload = buildPayload();
      const res = await fetch('/api/shopify/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          images: imageUrls.map(src => ({ src })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      setSuccessMsg('Published to Shopify');
      setShopUrl(data.shopUrl || null);
      await loadShopify();
    } catch (err) {
      setPubError(err.message || 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!productId) return;
    setSaving(true);
    setPubError('');
    setSuccessMsg('');
    try {
      const payload = buildPayload();
      const res = await fetch(`/api/shopify/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title,
          body_html: payload.body_html,
          product_type: payload.product_type,
          price: payload.price,
          status: payload.status,
          variant_id: variantId,
          ...(replaceImages ? { images: imageUrls.map(src => ({ src })) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setSuccessMsg('Shopify product updated');
      await loadShopify();
    } catch (err) {
      setPubError(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    setDeleting(true);
    setPubError('');
    try {
      const res = await fetch(`/api/shopify/products/${productId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      setSuccessMsg('Removed from Shopify');
      setConfirmDelete(false);
      await loadShopify();
    } catch (err) {
      setPubError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="shopify-form">
      <div className="shopify-form-header">
        <ShoppingBag size={15} />
        <span>Publish to Shopify</span>
        {shopifyLoading ? (
          <span className="shopify-form-status-pill loading">
            <Loader2 size={11} className="animate-spin" /> Checking…
          </span>
        ) : isListed ? (
          <span className={`shopify-form-status-pill ${status === 'active' ? 'active' : 'draft'}`}>
            {status}
          </span>
        ) : (
          <span className="shopify-form-status-pill draft">Not listed</span>
        )}
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
        {isListed && (
          <div className="form-row">
            <label className="form-label">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="form-select">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        )}
        <div className="form-row">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="form-label mb-0">Spec</label>
            <button
              type="button"
              className="text-xs text-gold-600 hover:underline"
              onClick={() => setSpec(buildDefaultSpec(item))}
            >
              Reset from item
            </button>
          </div>
          <textarea
            value={spec}
            onChange={e => setSpec(e.target.value)}
            className="form-textarea font-mono text-xs"
            rows={8}
            placeholder="Product specifications…"
          />
        </div>
        {isListed && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={replaceImages}
              onChange={e => setReplaceImages(e.target.checked)}
              className="rounded"
            />
            Replace Shopify images with Media ({totalImages})
          </label>
        )}
        {totalImages > 0 ? (
          <div className="media-used-note">
            <ImageIcon size={12} />
            <span>{totalImages} image{totalImages !== 1 ? 's' : ''} from Media will be attached</span>
          </div>
        ) : (
          <div className="media-used-note text-amber-700">
            <AlertCircle size={12} />
            <span>No images attached — product will publish without photos</span>
          </div>
        )}
        {shopUrl && (
          <p className="text-xs">
            <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-gold-600 underline">
              View on Shopify
            </a>
          </p>
        )}
        {successMsg && (
          <div className="pub-success">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {pubError && (
          <div className="pub-error">
            <AlertCircle size={14} className="shrink-0" />
            <span>{pubError}</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {isListed ? (
            <>
              <Button onClick={handleUpdate} disabled={busy || !title.trim() || !price} className="w-full">
                {saving
                  ? <><Loader2 size={14} className="animate-spin mr-2" />Updating…</>
                  : <><ShoppingBag size={14} className="mr-2" />Update on Shopify</>
                }
              </Button>
              {confirmDelete ? (
                <div className="flex gap-2">
                  <Button onClick={handleDelete} disabled={deleting} variant="destructive" className="flex-1">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm remove'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setConfirmDelete(true)} disabled={busy} variant="outline" className="w-full text-destructive">
                  <Trash2 size={14} className="mr-2" />Remove from Shopify
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handlePublish} disabled={busy || !title.trim() || !price} className="w-full">
              {saving
                ? <><Loader2 size={14} className="animate-spin mr-2" />Publishing…</>
                : <><ShoppingBag size={14} className="mr-2" />Publish to Shopify</>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scan Result Card ──────────────────────────────────────────────────────────
function ScanResult({ item, onRefreshItem }) {
  const typeColor = TYPE_COLORS[item.co] || 'oklch(55% 0 0)';
  const [showPublish, setShowPublish] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);

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
        {item.prc > 0 && <Field label="Extra Price (EGP)" value={formatCurrency(item.prc)} />}
        {item.prcus > 0 && <Field label="Extra Price (USD)" value={`$${Number(item.prcus).toFixed(2)}`} />}
      </div>

      {/* Media */}
      <MediaSection
        item={item}
        onMediaChange={() => onRefreshItem?.(item.mco)}
        onUploadingChange={setMediaBusy}
      />

      {/* Shopify toggle */}
      <div className="scan-result-actions">
        <button className="shopify-toggle-btn" onClick={() => setShowPublish(p => !p)}>
          <ShoppingBag size={14} />
          {showPublish ? 'Hide Shopify Form' : 'Publish to Shopify'}
        </button>
      </div>

      {showPublish && <ShopifyPublishForm key={item.mco} item={item} mediaBusy={mediaBusy} />}
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

  const refreshItem = useCallback(async (mco) => {
    try {
      const res = await fn6Api.getByMco(mco);
      setResult(res.data);
    } catch {
      // keep current result on refresh failure
    }
  }, []);

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

          {result && !loading && <ScanResult key={result.mco} item={result} onRefreshItem={refreshItem} />}
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
