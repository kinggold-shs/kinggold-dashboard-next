'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
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

async function callCleanupBulk(dryRun) {
  const res = await fetch('/api/shopify/products/cleanup-discriminators-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Cleanup request failed');
  return data;
}

/**
 * One-time cleanup UI: strips legacy ·SKU suffixes and reports Code-option products
 * that need manual migration to a real 3rd variant type.
 */
export default function CleanupDiscriminatorsButton() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function runDryRun() {
    const ok = window.confirm(
      'This will scan ALL published (active) Shopify products for legacy Code-option or ·SKU-suffix values.\n\n'
        + 'A dry-run runs first — no Shopify changes are made.\n'
        + 'Review the results, then use "Apply cleanup" if everything looks correct.\n\n'
        + 'Continue?',
    );
    if (!ok) return;

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await callCleanupBulk(true);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Dry-run failed');
    } finally {
      setLoading(false);
    }
  }

  async function applyCleanup() {
    const ok = window.confirm(
      'Apply the cleanup to ALL eligible published products?\n\n'
        + 'This will strip ·SKU suffixes from last-option values. Products flagged for '
        + 'manual migration are NOT changed.\n\n'
        + 'This cannot be easily undone.\n\n'
        + 'Continue?',
    );
    if (!ok) return;

    setApplying(true);
    setError('');
    try {
      const data = await callCleanupBulk(false);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Apply cleanup failed');
    } finally {
      setApplying(false);
    }
  }

  const strippedCount = (result?.results || []).filter(r => r.status === 'stripped' || r.status === 'partial_conflict').length;
  const manualCount = (result?.results || []).filter(r => r.status === 'manual_migration_needed').length;
  const codeSafeCount = (result?.results || []).filter(r => r.status === 'code_safe_to_remove').length;
  const showApply = result?.dryRun === true && strippedCount > 0;
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
            <Sparkles size={14} />
          )}
          Clean up legacy variant codes
        </Button>
        {showApply ? (
          <Button
            type="button"
            size="sm"
            onClick={applyCleanup}
            disabled={busy}
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : null}
            Apply cleanup
          </Button>
        ) : null}
      </div>

      {busy ? (
        <p className="text-xs text-muted-foreground">
          Scanning all published products — this may take a moment for large catalogs…
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Cleanup failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>
            {result.dryRun ? 'Dry-run results' : 'Cleanup applied'}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Scanned {result.total ?? 0} published product(s).
              {' '}
              {result.summary?.clean ? `${result.summary.clean} already clean. ` : ''}
              {strippedCount > 0
                ? `${result.dryRun ? 'Would strip suffixes from' : 'Stripped suffixes from'} ${strippedCount} product(s). `
                : ''}
              {manualCount > 0
                ? `${manualCount} product(s) need manual migration (Code option still in use). `
                : ''}
              {codeSafeCount > 0
                ? `${codeSafeCount} Code-option product(s) are safe to remove manually. `
                : ''}
            </p>

            {/* Stripped / suffix-cleaned products */}
            {(result.results || []).filter(r => r.status === 'stripped' || r.status === 'partial_conflict').length > 0 ? (
              <div>
                <p className="font-medium mb-1">Suffix products (·SKU stripped):</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Changes</TableHead>
                      <TableHead>Conflicts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(result.results || [])
                      .filter(r => r.status === 'stripped' || r.status === 'partial_conflict')
                      .map(row => (
                        <TableRow key={row.productId}>
                          <TableCell className="font-medium">{row.title || row.productId}</TableCell>
                          <TableCell><code className="text-xs">{row.sku}</code></TableCell>
                          <TableCell className="text-xs">
                            {(row.stripped || []).length > 0
                              ? (row.stripped || []).map(c => `${c.sku}: ${c.from} → ${c.to}`).join('; ')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-amber-700 dark:text-amber-500">
                            {(row.conflicts || []).length > 0
                              ? (row.conflicts || []).map(c => `${c.sku}: "${c.value}" clashes`).join('; ')
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {/* Manual migration needed */}
            {manualCount > 0 ? (
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-500 mb-1">
                  Manual migration needed ({manualCount}):
                </p>
                <ul className="list-disc pl-5 text-xs space-y-2 max-h-52 overflow-y-auto">
                  {(result.results || [])
                    .filter(r => r.status === 'manual_migration_needed')
                    .map(row => (
                      <li key={row.productId}>
                        <span className="font-medium">{row.title || row.productId}</span>
                        {row.sku ? <> — <code>{row.sku}</code></> : null}
                        {row.manualMigration ? (
                          <p className="mt-0.5 text-muted-foreground">{row.manualMigration.message}</p>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            {/* Code products safe to remove */}
            {codeSafeCount > 0 ? (
              <div>
                <p className="font-medium text-muted-foreground mb-1">
                  Code option can be removed manually ({codeSafeCount}):
                </p>
                <ul className="list-disc pl-5 text-xs space-y-1 max-h-40 overflow-y-auto">
                  {(result.results || [])
                    .filter(r => r.status === 'code_safe_to_remove')
                    .map(row => (
                      <li key={row.productId}>
                        {row.title || row.productId}
                        {row.sku ? <> — <code>{row.sku}</code></> : null}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            {/* Errors */}
            {result.summary?.errors > 0 ? (
              <div>
                <p className="font-medium text-destructive mb-1">Errors ({result.summary.errors}):</p>
                <ul className="list-disc pl-5 text-xs space-y-1 max-h-40 overflow-y-auto">
                  {(result.results || [])
                    .filter(r => r.status === 'error')
                    .map((row, i) => (
                      <li key={`${row.productId}-${i}`}>
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
