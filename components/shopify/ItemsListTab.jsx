'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronLeft, ChevronRight, ExternalLink, Loader2, Package, Settings, ShoppingBag, Trash2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { fetchShopifyProducts, removeShopifyItem } from '../../lib/shopifyItemWorkflow';

export default function ItemsListTab({ onManageSku }) {
  const [pageInfo, setPageInfo] = useState('');
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const queryKey = ['shopify-products', pageInfo];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchShopifyProducts(pageInfo),
    staleTime: 30_000,
  });

  const products = data?.products || [];
  const pagination = data?.pagination || {};
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const sku = String(product.variants?.[0]?.sku || '').toLowerCase();
      const title = String(product.title || '').toLowerCase();
      return sku.includes(q) || title.includes(q);
    });
  }, [products, search]);

  const handleDelete = async (productId) => {
    if (!window.confirm('Delete this product from Shopify?')) return;
    setDeletingId(productId);
    try {
      await removeShopifyItem(productId);
      await refetch();
    } finally {
      setDeletingId(null);
    }
  };

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

  if (error) {
    return (
      <div className="scan-error">
        <AlertCircle size={15} className="shrink-0" />
        <span>{error.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by product title or SKU..."
          className="max-w-md"
        />
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}><CardContent className="h-44" /></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state-card border rounded-xl p-10 text-center bg-card">
          <ShoppingBag size={24} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No products match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((product) => {
            const image = product.images?.[0]?.src;
            const sku = product.variants?.[0]?.sku;
            const price = product.variants?.[0]?.price;
            const status = product.status || 'draft';
            return (
              <Card key={product.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="aspect-square bg-muted/20">
                    {image ? (
                      <img src={image} alt={product.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Package size={28} />
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={status === 'active' ? 'default' : 'secondary'}>{status}</Badge>
                      {sku ? <span className="text-xs font-mono text-muted-foreground">#{sku}</span> : null}
                    </div>
                    <p className="font-semibold leading-snug">{product.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {price ? `EGP ${Number(price).toLocaleString('en-EG', { minimumFractionDigits: 2 })}` : 'No price'}
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://king-gold-5755.myshopify.com/products/${product.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gold-600 hover:underline"
                      >
                        <ExternalLink size={12} /> View
                      </a>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onManageSku(sku)}
                        disabled={!sku}
                        className="h-7 ml-auto"
                      >
                        <Settings size={12} className="mr-1" />
                        Manage
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7"
                        onClick={() => handleDelete(product.id)}
                        disabled={deletingId === product.id}
                      >
                        {deletingId === product.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
