'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardShell from '../../components/DashboardShell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import {
  ShoppingBag, Pencil, Trash2, Check, X, Loader2,
  AlertCircle, ChevronLeft, ChevronRight, ExternalLink, Package,
} from 'lucide-react';
import { mergeToBodyHtml, splitBodyHtml } from '../../lib/fn6Spec';

const PRODUCT_TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Chain', 'Pendant', 'Bangle', 'Other'];

async function fetchProducts(pageInfo = '') {
  const url = pageInfo
    ? `/api/shopify/products?limit=20&page_info=${encodeURIComponent(pageInfo)}`
    : `/api/shopify/products?limit=20`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch products');
  return data;
}

async function updateProduct(id, body) {
  const res = await fetch(`/api/shopify/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update');
  return data.product;
}

async function deleteProduct(id) {
  const res = await fetch(`/api/shopify/products/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete');
  return true;
}

function ProductCard({ product, queryKey, onDeleted }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(product.title);
  const [price, setPrice] = useState(product.variants?.[0]?.price || '');
  const [productType, setProductType] = useState(product.product_type || '');
  const [status, setStatus] = useState(product.status || 'active');
  const [description, setDescription] = useState(() => splitBodyHtml(product.body_html || '').description);
  const [spec, setSpec] = useState(() => splitBodyHtml(product.body_html || '').spec);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  const image = product.images?.[0]?.src;
  const sku = product.variants?.[0]?.sku;
  const variantId = product.variants?.[0]?.id;

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const updated = await updateProduct(product.id, {
        title,
        price,
        product_type: productType,
        status,
        body_html: mergeToBodyHtml(description, spec),
        variant_id: variantId,
      });
      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          products: old.products.map(p => p.id === updated.id ? updated : p),
        };
      });
      setEditing(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setErr('');
    try {
      await deleteProduct(product.id);
      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        return { ...old, products: old.products.filter(p => p.id !== product.id) };
      });
      onDeleted(product.id);
    } catch (e) {
      setErr(e.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleCancelEdit = () => {
    setTitle(product.title);
    setPrice(product.variants?.[0]?.price || '');
    setProductType(product.product_type || '');
    setStatus(product.status || 'active');
    const split = splitBodyHtml(product.body_html || '');
    setDescription(split.description);
    setSpec(split.spec);
    setErr('');
    setEditing(false);
  };

  return (
    <div className="shopify-product-card">
      <div className="shopify-product-img">
        {image
          ? <img src={image} alt={product.title} />
          : <div className="shopify-product-img-placeholder"><Package size={24} className="text-muted-foreground" /></div>
        }
        <span className={`shopify-product-status-badge ${product.status === 'active' ? 'active' : 'draft'}`}>
          {product.status}
        </span>
      </div>

      <div className="shopify-product-body">
        {editing ? (
          <div className="shopify-edit-form">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Product title" className="text-sm" />
            <div className="flex gap-2">
              <Input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="Price"
                className="text-sm flex-1"
              />
              <select value={status} onChange={e => setStatus(e.target.value)} className="form-select text-sm flex-1">
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <select value={productType} onChange={e => setProductType(e.target.value)} className="form-select text-sm">
              <option value="">— Type —</option>
              {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="form-textarea text-xs"
              rows={3}
              placeholder="Description…"
            />
            <textarea
              value={spec}
              onChange={e => setSpec(e.target.value)}
              className="form-textarea text-xs font-mono"
              rows={5}
              placeholder="Spec (gold price, weight, karat…)…"
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex gap-2 mt-1">
              <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 h-7">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <><Check size={12} className="mr-1" />Save</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={saving} className="h-7">
                <X size={12} />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="shopify-product-title">{product.title}</p>
            <div className="shopify-product-meta">
              {product.product_type && <span className="type-badge-sm">{product.product_type}</span>}
              {sku && <span className="text-xs text-muted-foreground font-mono">#{sku}</span>}
            </div>
            <p className="shopify-product-price">
              EGP {Number(price).toLocaleString('en-EG', { minimumFractionDigits: 2 })}
            </p>
          </>
        )}
      </div>

      {!editing && (
        <div className="shopify-product-actions">
          <a
            href={`https://king-gold-5755.myshopify.com/products/${product.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shopify-action-btn"
            title="View on Shopify"
          >
            <ExternalLink size={13} />
          </a>
          <button className="shopify-action-btn" onClick={() => { setEditing(true); setConfirmDelete(false); }} title="Edit">
            <Pencil size={13} />
          </button>
          {confirmDelete ? (
            <div className="shopify-confirm-delete">
              <span className="text-xs text-destructive">Delete?</span>
              <button className="shopify-action-btn danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              </button>
              <button className="shopify-action-btn" onClick={() => setConfirmDelete(false)}>
                <X size={12} />
              </button>
            </div>
          ) : (
            <button className="shopify-action-btn danger" onClick={() => setConfirmDelete(true)} title="Delete">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShopifyPage() {
  const [pageInfo, setPageInfo] = useState('');
  const [history, setHistory] = useState([]);

  const queryKey = ['shopify-products', pageInfo];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchProducts(pageInfo),
    staleTime: 30_000,
  });

  const products = data?.products || [];
  const pagination = data?.pagination || {};

  const handleNext = () => {
    setHistory(h => [...h, pageInfo]);
    setPageInfo(pagination.nextPageInfo || '');
  };

  const handlePrev = () => {
    const prev = [...history];
    const last = prev.pop();
    setHistory(prev);
    setPageInfo(last ?? '');
  };

  const handleDeleted = useCallback(() => {}, []);

  return (
    <DashboardShell>
      <div className="space-y-5">

        <div className="shopify-page-header">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} />
            <h1 className="text-xl font-bold tracking-tight">Shopify Products</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage products listed on your Shopify store
          </p>
        </div>

        {isLoading && (
          <div className="shopify-grid">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="shopify-product-card">
                <Skeleton className="w-full aspect-square" />
                <div className="shopify-product-body space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="scan-error">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error.message}</span>
          </div>
        )}

        {!isLoading && !error && products.length === 0 && (
          <div className="empty-state-card border rounded-xl p-10 text-center bg-card">
            <ShoppingBag size={24} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No products found in your Shopify store</p>
          </div>
        )}

        {!isLoading && products.length > 0 && (
          <>
            <div className="shopify-grid">
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  queryKey={queryKey}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>

            {(pagination.nextPageInfo || history.length > 0) && (
              <div className="pagination-bar">
                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={history.length === 0} onClick={handlePrev}>
                  <ChevronLeft size={14} /> Prev
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!pagination.nextPageInfo} onClick={handleNext}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </>
        )}

      </div>
    </DashboardShell>
  );
}
