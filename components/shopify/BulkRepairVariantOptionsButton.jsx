'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Wrench } from 'lucide-react';
import { repairAllProductVariants } from '../../lib/shopifyItemWorkflow';
import { REPAIR_VARIANTS_UI_ENABLED } from '../../lib/featureFlags';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

function formatSelections(selections) {
  if (!selections || typeof selections !== 'object') return '—';
  const parts = Object.entries(selections)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(', ') : '—';
}

function formatVariantChanges(variants) {
  if (!variants?.length) return '—';
  return variants
    .map(row => `${row.sku}: ${formatSelections(row.before)} → ${formatSelections(row.after)}`)
    .join('; ');
}

export default function BulkRepairVariantOptionsButton() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  if (!REPAIR_VARIANTS_UI_ENABLED) return null;

  async function runDryRun() {
    const ok = window.confirm(
      'This will scan ALL published (active) Shopify products.\n\n'
        + 'A dry-run runs first — no Shopify changes are made.\n'
        + 'Review the results, then use "Apply repair" if everything looks correct.\n\n'
        + 'Continue?',
    );
    if (!ok) return;

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await repairAllProductVariants({ dryRun: true });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Dry-run failed');
    } finally {
      setLoading(false);
    }
  }

  async function applyRepair() {
    const ok = window.confirm(
      'Apply variant option repairs to ALL affected published products?\n\n'
        + 'This will update Shopify variants. This cannot be undone easily.\n\n'
        + 'Continue?',
    );
    if (!ok) return;

    setApplying(true);
    setError('');
    try {
      const data = await repairAllProductVariants({ dryRun: false });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Apply repair failed');
    } finally {
      setApplying(false);
    }
  }

  const variantFixCount = (result?.repaired || []).reduce(
    (sum, row) => sum + (row.variantCount || row.variants?.length || 0),
    0,
  );
  const showApply = result?.dryRun === true && variantFixCount > 0;
  const busy = loading || applying;

  return (
    <div className="space-y-3 w-full sm:w-auto sm:max-w-2xl">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runDryRun}
          disabled={busy}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Wrench size={14} />
          )}
          Repair all variant options
        </Button>
        {showApply ? (
          <Button
            type="button"
            size="sm"
            onClick={applyRepair}
            disabled={busy}
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : null}
            Apply repair
          </Button>
        ) : null}
      </div>

      {busy ? (
        <p className="text-xs text-muted-foreground">
          Scanning all published products sequentially — this may take a while for large catalogs…
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Repair failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Alert variant={result.dryRun ? 'info' : 'success'}>
          <AlertCircle className="size-4" />
          <AlertTitle>
            {result.dryRun ? 'Dry-run results' : 'Bulk repair applied'}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Scanned
              {' '}
              {result.total ?? 0}
              {' '}
              published product(s).
              {' '}
              {variantFixCount > 0
                ? `${result.dryRun ? 'Would repair' : 'Repaired'} ${variantFixCount} variant(s) across ${result.repaired.length} product(s).`
                : 'No variants need repair.'}
            </p>

            {result.repaired?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Changes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.repaired.map(row => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">{row.title || row.productId}</TableCell>
                      <TableCell><code className="text-xs">{row.sku}</code></TableCell>
                      <TableCell className="text-xs">{formatVariantChanges(row.variants)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}

            {result.skipped?.length ? (
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-500">
                  Skipped
                  {' '}
                  {result.skipped.length}
                  :
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs space-y-1 max-h-40 overflow-y-auto">
                  {result.skipped.map((row, i) => (
                    <li key={`${row.productId}-${row.variantId || i}`}>
                      {row.title || row.productId}
                      {row.sku ? <> — <code>{row.sku}</code></> : null}
                      {' — '}
                      {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.errors?.length ? (
              <div>
                <p className="font-medium text-destructive">
                  Errors
                  {' '}
                  {result.errors.length}
                  :
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((row, i) => (
                    <li key={`${row.productId}-${row.variantId || i}`}>
                      {row.title || row.productId}
                      {row.sku ? <> — <code>{row.sku}</code></> : null}
                      {' — '}
                      {row.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
