'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  TrendingUp,
  Package,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';
import Fn6Filters from '../../components/Fn6Filters';
import Fn6DetailModal from '../../components/Fn6DetailModal';
import Fn6CreateModal from '../../components/Fn6CreateModal';
import DashboardShell from '../../components/DashboardShell';
import { fn6Api } from '../../api/fn6';
import { TYPE_LABELS, TYPE_COLORS } from '../../constants/fn6';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../components/ui/table';
import { toast } from 'sonner';

const DASH = '—';

function formatCurrency(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function formatNumber(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-US').format(v);
}

function KpiCard({ icon: Icon, label, value, subtitle, color, index = 0 }) {
  const c = color || 'var(--gold-500)';
  return (
    <div
      className="kpi-card"
      style={{ '--accent-color': c, '--i': index }}
    >
      <div className="kpi-accent" />
      <div className="kpi-body">
        <div
          className="kpi-icon"
          style={{
            background: `color-mix(in oklch, ${c} 11%, transparent)`,
            borderColor: `color-mix(in oklch, ${c} 22%, transparent)`,
          }}
        >
          <Icon size={17} style={{ color: c }} strokeWidth={2} />
        </div>
        <span className="kpi-value">{value}</span>
        <span className="kpi-label">{label}</span>
        {subtitle && <span className="kpi-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}

function GoldPriceCard({ label, price, index = 0 }) {
  return (
    <div className="gold-price-card" style={{ '--i': index }}>
      <span className="gold-price-label">{label}</span>
      {price != null ? (
        <span className="gold-price-value">{formatCurrency(price)}</span>
      ) : (
        <span className="gold-price-na">{DASH}</span>
      )}
      <span className="gold-price-unit">/ gram</span>
    </div>
  );
}

function ImageLightbox({ src, onClose }) {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close image">
        <X size={18} />
      </button>
      {src ? (
        <img src={src} alt="" onClick={(e) => e.stopPropagation()} className="lightbox-img" />
      ) : (
        <p className="text-white text-xl">No image available</p>
      )}
    </div>
  );
}

const COLUMNS = [
  { title: 'Code', key: 'code', sortable: true },
  { title: 'Name', key: 'type_name', sortable: true },
  { title: 'Type', key: 'type', sortable: true },
  { title: 'Image', key: null, sortable: false },
  { title: 'Price', key: 'price', sortable: true },
  { title: 'Weight', key: 'weight', sortable: true },
  { title: 'Total Weight', key: 'total_weight', sortable: true },
  { title: 'Mfg/g', key: 'manufacturing', sortable: true },
  { title: 'Qty', key: 'quantity', sortable: true },
  { title: 'Actions', key: null, sortable: false },
];

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const listParams = useMemo(() => ({ ...filters, page, page_size: 50 }), [filters, page]);

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['fn6', 'dashboard', listParams],
    queryFn: () => fn6Api.list(listParams).then(r => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['fn6', 'stats'],
    queryFn: () => fn6Api.stats().then(r => r.data),
    staleTime: 60_000,
  });

  const { data: goldPrices } = useQuery({
    queryKey: ['fn6', 'gold-prices'],
    queryFn: () => fn6Api.goldPrices().then(r => r.data),
    staleTime: 120_000,
  });

  const items = listRes?.results || [];
  const count = listRes?.count || 0;

  const deleteMutation = useMutation({
    mutationFn: (mco) => fn6Api.delete(mco),
    onSuccess: (_, mco) => {
      setDeleteTarget(null);
      toast.success(`Deleted item ${mco}`);
      queryClient.invalidateQueries({ queryKey: ['fn6', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['fn6', 'stats'] });
    },
    onError: () => {
      toast.error('Failed to delete item');
    },
  });

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handleEdit = useCallback((item) => { setSelectedItem(item); setShowEditModal(true); }, []);
  const handleDelete = useCallback((item) => { setDeleteTarget(item); }, []);

  const handleSort = useCallback((key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (va == null) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, sortKey, sortDir]);

  const totalPages = Math.ceil(count / 50);

  const kpis = useMemo(() => {
    if (!stats) return null;
    return [
      { icon: Package, label: 'Total Items', value: formatNumber(stats.total_items), subtitle: `${stats.recent_30d || 0} added in 30 days`, color: 'var(--gold-400)' },
      { icon: DollarSign, label: 'Total Value', value: formatCurrency(stats.total_value), subtitle: 'Sum of all inventory', color: 'var(--gold-400)' },
      { icon: TrendingUp, label: 'Total Weight', value: stats.total_weight ? `${Number(stats.total_weight).toFixed(1)}g` : '0g', subtitle: 'Combined gross weight', color: 'var(--gold-400)' },
    ];
  }, [stats]);

  const statsLoaded = !!stats;

  const SortIcon = ({ columnKey }) => {
    if (sortKey !== columnKey) return <ChevronsUpDown size={12} className="text-neutral-400" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-gold-500" /> : <ChevronDown size={12} className="text-gold-500" />;
  };

  const handleSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fn6', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['fn6', 'stats'] });
  }, [queryClient]);

  const handleCreated = useCallback(() => {
    setShowCreateModal(false);
    toast.success('Item created');
    handleSaved();
  }, [handleSaved]);

  const handleUpdated = useCallback(() => {
    setShowEditModal(false);
    toast.success(`Updated ${selectedItem?.code}`);
    handleSaved();
  }, [handleSaved, selectedItem?.code]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Gold Price Banner */}
        {statsLoaded && goldPrices && (
          <div className="gold-banner-grid">
            <div className="gold-rate-card">
              <div className="gold-rate-icon">
                <TrendingUp size={16} />
              </div>
              <div>
                <div className="gold-rate-label">Gold Rate</div>
                {goldPrices.date && <div className="gold-rate-date">{goldPrices.date}</div>}
              </div>
            </div>
            <GoldPriceCard label="24K" price={goldPrices.pr24} index={0} />
            <GoldPriceCard label="21K" price={goldPrices.pr21} index={1} />
            <GoldPriceCard label="18K" price={goldPrices.pr18} index={2} />
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis ? kpis.map((kpi, i) => <KpiCard key={i} {...kpi} index={i} />)
            : [0, 1, 2, 3].map((i) => (
              <div key={i} className="kpi-card" style={{ '--i': i }}>
                <Skeleton className="w-9 h-9 rounded-lg mb-3" />
                <Skeleton className="w-24 h-7 mb-1 rounded" />
                <Skeleton className="w-16 h-4 rounded" />
              </div>
            ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 animate-fadeIn">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Gold Stock</h1>
            {!isLoading && (
              <p className="text-xs text-muted-foreground mt-0.5 font-medium tabular-nums">
                {formatNumber(count)} item{count !== 1 ? 's' : ''}
                {filters && Object.keys(filters).length > 0 && <span className="ml-1 text-gold-600">&middot; filtered</span>}
              </p>
            )}
          </div>
          <Button variant="default" onClick={() => setShowCreateModal(true)} className="gap-1.5 shadow-sm">
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" /> Add Item
          </Button>
        </div>

        {/* Filters */}
        <Fn6Filters onFilterChange={handleFilterChange} />

        {/* Table */}
        {isLoading ? (
          <div className="table-wrap p-6 space-y-3">
            {SKELETON_ROWS.map((i) => (
              <div key={i} className="flex gap-4 items-center">
                <Skeleton className="h-6 w-16 rounded" />
                <Skeleton className="h-6 w-24 rounded" />
                <Skeleton className="h-6 w-12 rounded-full" />
                <Skeleton className="h-6 w-12 rounded" />
                <Skeleton className="h-6 w-20 rounded" />
                <Skeleton className="h-6 w-16 rounded" />
                <Skeleton className="h-6 w-8 rounded" />
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <div className="flex gap-1">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="h-7 w-7 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((col) => (
                    <TableHead key={col.title} className={col.sortable ? 'cursor-pointer select-none' : ''}>
                      {col.sortable ? (
                        <span className="inline-flex items-center gap-1" onClick={() => handleSort(col.key)}>
                          {col.title}
                          <SortIcon columnKey={col.key} />
                        </span>
                      ) : col.title}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((item, idx) => (
                  <TableRow key={item.code} style={{ '--i': idx, animationDelay: `${Math.min(idx, 12) * 30}ms` }} className="animate-fadeInRow">
                    <TableCell>
                      <code className="text-sm font-mono font-medium">{item.code}</code>
                    </TableCell>
                    <TableCell className="text-sm">{item.type_name || item.com_mco || DASH}</TableCell>
                    <TableCell>
                      <span
                        className="type-badge"
                        style={{
                          background: `color-mix(in oklch, ${TYPE_COLORS[item.type] || 'oklch(55% 0 0)'} 12%, transparent)`,
                          color: TYPE_COLORS[item.type] || 'oklch(55% 0 0)',
                          border: `1px solid color-mix(in oklch, ${TYPE_COLORS[item.type] || 'oklch(55% 0 0)'} 22%, transparent)`,
                        }}
                      >
                        {TYPE_LABELS[item.type] || `${item.type}K`}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.image ? (
                        <div
                          className="table-thumb inline-block"
                          onClick={() => setLightboxSrc(item.image)}
                        >
                          <img src={item.image} alt={item.com_mco || item.code} className="w-8 h-8 object-cover" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">{DASH}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-mono font-medium">
                      {item.price != null ? formatCurrency(item.price) : DASH}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {item.weight != null ? `${Number(item.weight).toFixed(3)}g` : DASH}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {item.total_weight != null ? `${Number(item.total_weight).toFixed(3)}g` : DASH}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {item.manufacturing != null && item.manufacturing !== '0' && item.manufacturing !== '' ? item.manufacturing : DASH}
                    </TableCell>
                    <TableCell className="text-sm">{item.quantity ?? DASH}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:text-gold-600 hover:bg-gold-50"
                          onClick={() => handleEdit(item)}
                          aria-label={`Edit ${item.code}`}
                        >
                          <Pencil size={13} strokeWidth={1.8} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:text-destructive hover:bg-destructive/8"
                          onClick={() => handleDelete(item)}
                          aria-label={`Delete ${item.code}`}
                        >
                          <Trash2 size={13} strokeWidth={1.8} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="pagination-bar">
                <p className="text-xs text-muted-foreground font-medium">
                  Page <span className="text-foreground">{page}</span> of {totalPages}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state-card border rounded-xl p-12 text-center bg-card">
            <div className="empty-state-icon">
              <Info size={24} className="text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No items found</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your filters or add a new item to get started.
            </p>
            <Button onClick={() => setShowCreateModal(true)} className="gap-1.5">
              <Plus size={14} /> Add Item
            </Button>
          </div>
        )}

        {/* Lightbox */}
        {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

        {/* Edit Modal */}
        {showEditModal && selectedItem && (
          <Fn6DetailModal
            item={selectedItem}
            onClose={() => setShowEditModal(false)}
            onSaved={handleUpdated}
          />
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <Fn6CreateModal
            onClose={() => setShowCreateModal(false)}
            onCreated={handleCreated}
          />
        )}

        {/* Delete Confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 size={18} className="text-destructive" />
                Delete Item {deleteTarget?.code}?
              </DialogTitle>
              <DialogDescription>
                This will permanently delete <strong>{deleteTarget?.code}</strong>. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.code)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
