'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Wrench } from 'lucide-react';
import { repairProductVariants } from '../../lib/shopifyItemWorkflow';
import { REPAIR_VARIANTS_UI_ENABLED } from '../../lib/featureFlags';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';

function formatSelections(selections) {
  if (!selections || typeof selections !== 'object') return '—';
  const parts = Object.entries(selections)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(', ') : '—';
}

export default function RepairVariantOptionsButton({ productId, mco, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [dryRunResult, setDryRunResult] = useState(null);

  if (!REPAIR_VARIANTS_UI_ENABLED) return null;

  async function runDryRun() {
    const ok = window.confirm(
      'Repair variant options will first run as a dry-run (no Shopify changes).\n\n'
        + 'Review what would change, then use "Apply repair" if it looks correct.\n\nContinue?',
    );
    if (!ok) return;

    setLoading(true);
    setError('');
    setDryRunResult(null);
    try {
      const result = await repairProductVariants(productId, { mco, dryRun: true });
      setDryRunResult(result);
    } catch (err) {
      setError(err.message || 'Dry-run failed');
    } finally {
      setLoading(false);
    }
  }

  async function applyRepair() {
    const ok = window.confirm(
      'Apply variant option repairs to Shopify? This will update affected variants.',
    );
    if (!ok) return;

    setApplying(true);
    setError('');
    try {
      const result = await repairProductVariants(productId, { mco, dryRun: false });
      setDryRunResult(result);
      await onRefresh?.();
    } catch (err) {
      setError(err.message || 'Apply repair failed');
    } finally {
      setApplying(false);
    }
  }

  const hasFixes = (dryRunResult?.repaired?.length ?? 0) > 0;
  const showApply = dryRunResult?.dryRun === true && hasFixes;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runDryRun}
          disabled={loading || applying || !productId}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Wrench size={14} />
          )}
          Repair variant options
        </Button>
        {showApply ? (
          <Button
            type="button"
            size="sm"
            onClick={applyRepair}
            disabled={applying || loading}
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : null}
            Apply repair
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Repair failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {dryRunResult ? (
        <Alert variant={dryRunResult.dryRun ? 'info' : 'success'}>
          <AlertCircle className="size-4" />
          <AlertTitle>
            {dryRunResult.dryRun ? 'Dry-run results' : 'Repair applied'}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            {dryRunResult.message ? (
              <p>{dryRunResult.message}</p>
            ) : null}
            {dryRunResult.repaired?.length ? (
              <div>
                <p className="font-medium">
                  {dryRunResult.dryRun ? 'Would repair' : 'Repaired'}
                  {' '}
                  {dryRunResult.repaired.length}
                  {' '}
                  variant(s):
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs space-y-1">
                  {dryRunResult.repaired.map(row => (
                    <li key={row.variantId}>
                      <code>{row.sku}</code>
                      {' — '}
                      {formatSelections(row.before)}
                      {' → '}
                      <strong>{formatSelections(row.after)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>No variants need repair.</p>
            )}
            {dryRunResult.skipped?.length ? (
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-500">
                  Skipped
                  {' '}
                  {dryRunResult.skipped.length}
                  :
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs space-y-1">
                  {dryRunResult.skipped.map(row => (
                    <li key={`${row.variantId}-${row.reason}`}>
                      <code>{row.sku}</code>
                      {' — '}
                      {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {dryRunResult.errors?.length ? (
              <div>
                <p className="font-medium text-destructive">Errors:</p>
                <ul className="mt-1 list-disc pl-5 text-xs space-y-1">
                  {dryRunResult.errors.map((row, i) => (
                    <li key={`${row.variantId}-${i}`}>
                      {row.sku ? <code>{row.sku}</code> : 'Product'}
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
