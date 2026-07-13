'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Search, Check, X, Loader2, AlertCircle } from 'lucide-react';
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

export default function PaymentsPage() {
  const [search, setSearch] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [page, setPage] = useState(1);
  // Which order is mid-confirmation, and for what. Approve marks the order paid
  // and Decline cancels it — both are effectively irreversible from here, so
  // neither fires on a single click.
  const [confirming, setConfirming] = useState(null); // { orderId, orderName, action }
  const [actionError, setActionError] = useState(null);

  const queryClient = useQueryClient();

  const queryParams = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    search: searchParam,
    status: 'pending',
  }), [page, searchParam]);

  const pendingQuery = useQuery({
    queryKey: ['pending-payments', queryParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== '' && value != null) params.set(key, String(value));
      });
      const res = await fetch(`/api/history?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load pending payments');
      return data;
    },
    refetchInterval: 30000,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ orderId, action }) => {
      const res = await fetch('/api/shopify/payment-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} payment`);
      return data;
    },
    onSuccess: () => {
      setConfirming(null);
      setActionError(null);
      // Approving marks the order paid, which moves it out of this list and
      // into history (via Shopify's orders/paid webhook). Refresh both.
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    onError: (err) => {
      setActionError(err.message || 'Action failed');
    },
  });

  const rows = pendingQuery.data?.results || [];
  const count = pendingQuery.data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const handleSearch = () => {
    setPage(1);
    setSearchParam(search.trim());
  };

  const isBusy = (orderId) => actionMutation.isPending
    && actionMutation.variables?.orderId === orderId;

  return (
    <DashboardShell>
      <div className="space-y-5">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <Wallet size={20} />
              <h1 className="text-xl font-bold tracking-tight">Payments</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Orders awaiting payment confirmation — paid outside Shopify (bank transfer, cash).
              Check the money actually arrived, then approve or decline. Nothing happens automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search order, customer, SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button size="sm" onClick={handleSearch}>Search</Button>
          </div>
        </div>

        {actionError ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        ) : null}

        {pendingQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : pendingQuery.error ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-destructive">
            {pendingQuery.error.message}
          </div>
        ) : rows.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              {count} order{count !== 1 ? 's' : ''} awaiting confirmation
            </p>
            <div className="table-wrap overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const orderId = row.shopify_order_id;
                    const isConfirming = confirming?.orderId === orderId;
                    const busy = isBusy(orderId);

                    return (
                      <TableRow key={orderId}>
                        <TableCell className="tabular-nums text-sm">
                          {formatDateTime(row.purchased_at || row.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.order_name || `#${orderId}`}</div>
                          <div className="text-xs text-gold-700 uppercase tracking-wide">
                            {row.financial_status || 'PENDING'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{row.customer_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{row.customer_email || '—'}</div>
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <div className="text-sm">{compactItems(row.items)}</div>
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          {formatCurrency(row.total_amount, row.currency_code || 'EGP')}
                        </TableCell>
                        <TableCell>
                          {isConfirming ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <span className="text-xs text-muted-foreground">
                                {confirming.action === 'approve'
                                  ? 'Confirm the money arrived?'
                                  : 'Cancel this order?'}
                              </span>
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant={confirming.action === 'approve' ? 'default' : 'destructive'}
                                  disabled={busy}
                                  onClick={() => actionMutation.mutate({ orderId, action: confirming.action })}
                                >
                                  {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                                  Yes, {confirming.action}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => { setConfirming(null); setActionError(null); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                disabled={actionMutation.isPending}
                                onClick={() => {
                                  setActionError(null);
                                  setConfirming({ orderId, orderName: row.order_name, action: 'approve' });
                                }}
                              >
                                <Check size={14} className="mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionMutation.isPending}
                                onClick={() => {
                                  setActionError(null);
                                  setConfirming({ orderId, orderName: row.order_name, action: 'decline' });
                                }}
                              >
                                <X size={14} className="mr-1" />
                                Decline
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 ? (
              <div className="pagination-bar">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Page <span className="text-foreground">{page}</span> of {totalPages}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Prev
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Wallet size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No pending payments</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Orders awaiting outside-Shopify payment confirmation will appear here.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
