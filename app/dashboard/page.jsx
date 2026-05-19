'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, ScanBarcode,
} from 'lucide-react';
import DashboardShell from '../../components/DashboardShell';
import { fn6Api } from '../../api/fn6';
import { TYPE_LABELS, TYPE_COLORS } from '../../constants/fn6';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../components/ui/table';

const DASH = '—';
const BRANCH = 2;

function formatCurrency(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function formatNumber(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-US').format(v);
}

const COLUMNS = [
  { title: 'Code', key: 'mco', sortable: true },
  { title: 'Karat', key: 'co', sortable: true },
  { title: 'Weight (g)', key: 'go_cr', sortable: true },
  { title: 'Qty', key: 'qt', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
];

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const listParams = useMemo(() => ({
    br: BRANCH,
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

  const handleSearch = useCallback(() => {
    setSearchParam(search.trim());
    setPage(1);
  }, [search]);

  const handleClear = useCallback(() => {
    setSearch('');
    setSearchParam('');
    setPage(1);
  }, []);

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
    <DashboardShell>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap animate-fadeIn">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Gold Stock — Branch {BRANCH}</h1>
            {!isLoading && (
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {formatNumber(count)} item{count !== 1 ? 's' : ''}
                {searchParam && <span className="ml-1 text-gold-600">&middot; filtered</span>}
              </p>
            )}
          </div>
        </div>

        {/* Search */}
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

        {/* Table */}
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
                    <TableCell>
                      <code className="text-sm font-mono font-medium">{item.mco}</code>
                    </TableCell>
                    <TableCell>
                      <span
                        className="type-badge"
                        style={{
                          background: `color-mix(in oklch, ${TYPE_COLORS[item.co] || 'oklch(55% 0 0)'} 12%, transparent)`,
                          color: TYPE_COLORS[item.co] || 'oklch(55% 0 0)',
                          border: `1px solid color-mix(in oklch, ${TYPE_COLORS[item.co] || 'oklch(55% 0 0)'} 22%, transparent)`,
                        }}
                      >
                        {TYPE_LABELS[item.co] || `${item.co}K`}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {item.go_cr != null ? `${Number(item.go_cr).toFixed(3)}g` : DASH}
                    </TableCell>
                    <TableCell className="text-sm">{item.qt ?? DASH}</TableCell>
                    <TableCell className="text-sm font-mono font-medium">
                      {item.price != null ? formatCurrency(item.price) : DASH}
                    </TableCell>
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
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous">
                    <ChevronLeft size={14} />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next">
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state-card border rounded-xl p-12 text-center bg-card">
            <div className="empty-state-icon">
              <ScanBarcode size={24} className="text-muted-foreground mx-auto" />
            </div>
            <h2 className="text-lg font-semibold mb-1 mt-3">No items found</h2>
            <p className="text-sm text-muted-foreground">Try a different search term.</p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
