'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardShell from '../../components/DashboardShell';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../components/ui/table';

const PAGE_SIZE = 25;

function formatCurrency(value, currency = 'EGP') {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function compactItems(items) {
  if (!Array.isArray(items) || items.length === 0) return '—';
  return items
    .map((item) => {
      const sku = item?.sku || item?.variant_sku || item?.title || 'Item';
      const qty = Number(item?.quantity) || 0;
      return `${sku}${qty > 1 ? ` ×${qty}` : ''}`;
    })
    .join(', ');
}

function toDateBoundary(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
}

function exportRowsToCsv(rows) {
  const headers = [
    'Order ID',
    'Order Name',
    'Customer Name',
    'Customer Email',
    'Purchased At',
    'Webhook Received At',
    'Total Amount',
    'Currency',
    '18K Price',
    '21K Price',
    'USD Rate',
    'Items',
  ];

  const lines = rows.map((row) => [
    row.shopify_order_id,
    row.order_name,
    row.customer_name,
    row.customer_email,
    row.purchased_at,
    row.webhook_received_at,
    row.total_amount,
    row.currency_code,
    row.gold_price_18k,
    row.gold_price_21k,
    row.usd_rate,
    compactItems(row.items),
  ]);

  const csv = [headers, ...lines]
    .map((line) => line
      .map((value) => {
        const cell = value == null ? '' : String(value);
        return `"${cell.replaceAll('"', '""')}"`;
      })
      .join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `purchase-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HistoryPage() {
  const [search, setSearch] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    search: searchParam,
    from: toDateBoundary(fromDate, false),
    to: toDateBoundary(toDate, true),
  }), [page, searchParam, fromDate, toDate]);

  const historyQuery = useQuery({
    queryKey: ['history', queryParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== '' && value != null) params.set(key, String(value));
      });
      const res = await fetch(`/api/history?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load history');
      return data;
    },
  });

  const rows = historyQuery.data?.results || [];
  const count = historyQuery.data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  /* Webhook receipts — state + polling for the hidden diagnostic panel below.
     Commented out with it so the page isn't polling /api/webhooks/receipts every
     10s for a view nobody can see. Uncomment together with the panel.

  const { data: webhookData } = useQuery({
    queryKey: ['webhook-receipts'],
    queryFn: () => fetch('/api/webhooks/receipts').then(r => r.json()),
    refetchInterval: 10000,
    staleTime: 5000,
  });
  const allReceipts = webhookData?.receipts ?? [];

  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const filteredReceipts = allReceipts
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => typeFilter === 'all' || (typeFilter === 'test' ? r.test : !r.test));

  const last = filteredReceipts[0] ?? allReceipts[0];
  const statusColor = { verified: 'bg-green-500', rejected: 'bg-red-500', error: 'bg-amber-500', skipped: 'bg-gray-400', zero_price_alert: 'bg-red-600' };
  */

  const handleSearch = () => {
    setPage(1);
    setSearchParam(search.trim());
  };

  const handleClear = () => {
    setSearch('');
    setSearchParam('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  return (
    <DashboardShell>
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <History size={20} />
                <h1 className="text-xl font-bold tracking-tight">Purchase History</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shopify paid orders with snapshotted 18K / 21K gold prices and precise timing for ledger accounting.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => exportRowsToCsv(rows)}
                disabled={!rows.length}
              >
                <Download size={14} className="mr-1" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search order, customer, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-8"
              />
            </div>
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="w-[170px]" />
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="w-[170px]" />
            <Button onClick={handleSearch}>Search</Button>
            <Button variant="ghost" onClick={handleClear}>Clear</Button>
          </div>
        </div>

        {/* Webhook status widget — hidden. It's a debugging/diagnostic view, not
            something the owner needs day to day. The data is still fetched and the
            /api/webhooks/receipts endpoint still works, so restoring this is just a
            matter of uncommenting the block below.
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Webhook Receipts</h3>
            <span className="text-xs text-muted-foreground">
              {last ? `Last: ${new Date(last.at).toLocaleString()}` : 'No webhooks received yet'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {['all','verified','rejected','error','skipped'].map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span className="mx-1 text-muted-foreground/30">|</span>
            {['all','real','test'].map(t => (
              <button key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {filteredReceipts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              {allReceipts.length === 0
                ? 'No webhooks received yet — trigger Send test in Shopify Admin.'
                : 'No receipts match current filters.'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {filteredReceipts.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${statusColor[r.status] ?? 'bg-gray-400'}`} />
                  <span className="font-medium w-16 capitalize">{r.status}</span>
                  <span className="text-muted-foreground">{new Date(r.at).toLocaleTimeString()}</span>
                  {r.test && <span className="px-1.5 rounded bg-muted text-muted-foreground text-[10px] font-medium">TEST</span>}
                  {r.orderName && <span>{r.orderName}</span>}
                  {r.message && <span className="text-destructive truncate max-w-xs">{r.message}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        */}

        {historyQuery.isLoading ? (
          <div className="table-wrap p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-5 w-40 rounded" />
                <Skeleton className="h-5 w-28 rounded" />
                <Skeleton className="h-5 w-24 rounded" />
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-5 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : historyQuery.error ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-destructive">
            {historyQuery.error.message}
          </div>
        ) : rows.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground tabular-nums">
                {count} record{count !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="table-wrap overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>18K</TableHead>
                    <TableHead>21K</TableHead>
                    <TableHead>USD Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.shopify_order_id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium tabular-nums">{formatDateTime(row.purchased_at || row.webhook_received_at)}</div>
                          <div className="text-xs text-muted-foreground">
                            webhook: {formatDateTime(row.webhook_received_at)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.order_name || `#${row.shopify_order_id}`}</div>
                          <div className="text-xs text-muted-foreground">ID: {row.shopify_order_id}</div>
                          {row.financial_status ? (
                            <div className="text-xs text-gold-700 uppercase tracking-wide">{row.financial_status}</div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{row.customer_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{row.customer_email || '—'}</div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="text-sm">{compactItems(row.items)}</div>
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {formatCurrency(row.total_amount, row.currency_code || 'EGP')}
                      </TableCell>
                      <TableCell className="font-mono">{formatCurrency(row.gold_price_18k, 'EGP')}</TableCell>
                      <TableCell className="font-mono">{formatCurrency(row.gold_price_21k, 'EGP')}</TableCell>
                      <TableCell className="font-mono">{formatNumber(row.usd_rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 ? (
              <div className="pagination-bar">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Page <span className="text-foreground">{page}</span> of {totalPages}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={14} />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <History size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No purchase history yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Once paid Shopify orders are snapshotted into order metafields, records will show here.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
