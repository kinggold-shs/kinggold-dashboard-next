'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  advanceCodeChain,
  fetchCodeChains,
  migrateCodeChains,
  saveCodeChains,
} from '../../lib/shopifyItemWorkflow';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

function formatOptionLabel(optionValues) {
  return Object.entries(optionValues || {})
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');
}

function ChainStatusBadge({ chain }) {
  if (chain.available) {
    return (
      <Badge variant="default" className="font-normal">
        Available
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="font-normal">
      Unavailable
    </Badge>
  );
}

function ChainRow({
  chain,
  disabled,
  onChange,
  onRemoveCode,
  onAddCode,
  onMoveCode,
}) {
  const codes = chain.codes || [];

  return (
    <div className="rounded-lg border border-border/80 bg-card p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{formatOptionLabel(chain.optionValues)}</p>
          <p className="text-xs text-muted-foreground font-mono">{chain.key}</p>
        </div>
        <ChainStatusBadge chain={chain} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {chain.activeCode ? (
          <span className="rounded-md bg-gold-100/80 dark:bg-gold-900/30 px-2 py-1">
            Active: <code>{chain.activeCode}</code>
          </span>
        ) : (
          <span className="text-muted-foreground">No active code</span>
        )}
        {chain.nextCode ? (
          <span className="rounded-md bg-muted px-2 py-1">
            Next: <code>{chain.nextCode}</code>
          </span>
        ) : null}
        {(chain.soldCodes || []).length ? (
          <span className="rounded-md bg-muted/60 px-2 py-1 text-muted-foreground">
            Sold: {(chain.soldCodes || []).join(', ')}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Code chain (first → last)
        </p>
        <ul className="space-y-1.5">
          {codes.map((code, codeIdx) => {
            const isActive = codeIdx === chain.activeIndex;
            const isSold = (chain.soldCodes || []).includes(code);
            return (
              <li key={`${chain.key}-${codeIdx}`} className="flex items-center gap-1.5">
                <Input
                  value={code}
                  onChange={e => {
                    const next = [...codes];
                    next[codeIdx] = e.target.value.trim();
                    onChange({ ...chain, codes: next });
                  }}
                  disabled={disabled || isSold}
                  className="h-8 font-mono text-xs flex-1"
                  placeholder="FN6 code"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  {isActive ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5">Active</Badge>
                  ) : isSold ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">Sold</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">Queued</Badge>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={disabled || codeIdx === 0 || isSold}
                    onClick={() => onMoveCode(codeIdx, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={disabled || codeIdx >= codes.length - 1 || isSold}
                    onClick={() => onMoveCode(codeIdx, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={disabled || isSold}
                    onClick={() => onRemoveCode(codeIdx)}
                    aria-label="Remove code"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onAddCode}
        >
          <Plus size={14} className="mr-1" />
          Add code
        </Button>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Paste comma- or newline-separated codes</p>
        <Textarea
          placeholder="101, 102, 103"
          disabled={disabled}
          className="min-h-[56px] font-mono text-xs"
          onBlur={e => {
            const raw = e.target.value.trim();
            if (!raw) return;
            const parsed = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
            if (!parsed.length) return;
            const sold = new Set(chain.soldCodes || []);
            const kept = codes.filter(c => sold.has(c));
            const merged = [...kept];
            for (const code of parsed) {
              if (!merged.includes(code)) merged.push(code);
            }
            onChange({ ...chain, codes: merged });
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

export default function CodeChainsEditor({
  productId,
  mco,
  disabled = false,
  onVariantsChanged,
}) {
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advancingKey, setAdvancingKey] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchCodeChains(productId, mco);
      setChains(data.codeChains?.chains || []);
    } catch (err) {
      setError(err.message || 'Failed to load code chains');
    } finally {
      setLoading(false);
    }
  }, [productId, mco]);

  useEffect(() => {
    load();
  }, [load]);

  const hasChains = useMemo(() => chains.some(c => (c.codes || []).length > 0), [chains]);

  function updateChain(index, nextChain) {
    setChains(prev => prev.map((c, i) => (i === index ? nextChain : c)));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        version: 2,
        chains: chains.map(c => ({
          key: c.key,
          optionValues: c.optionValues,
          codes: (c.codes || []).map(code => String(code).trim()).filter(Boolean),
          activeIndex: Number(c.activeIndex) || 0,
          soldCodes: c.soldCodes || [],
          activeVariantId: c.activeVariantId ?? null,
        })),
      };
      await saveCodeChains(productId, payload, mco);
      setSuccess('Code chains saved and synced to Shopify.');
      await load();
      onVariantsChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to save code chains');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvance(chainKey) {
    setAdvancingKey(chainKey);
    setError('');
    setSuccess('');
    try {
      const result = await advanceCodeChain(productId, chainKey, mco);
      setSuccess(
        result.soldCode
          ? `Advanced: ${result.soldCode} sold → next active: ${result.nextCode || 'none'}`
          : 'Chain advanced.',
      );
      await load();
      onVariantsChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to advance chain');
    } finally {
      setAdvancingKey('');
    }
  }

  async function handleMigrate() {
    setMigrating(true);
    setError('');
    setSuccess('');
    try {
      await migrateCodeChains(productId, mco);
      setSuccess('Imported existing sub-variant SKUs into code chains.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to migrate chains');
    } finally {
      setMigrating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 size={16} className="animate-spin" />
        Loading code chains…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Code chains</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each variant option combo gets an ordered FN6 code queue. Only the active code is available on the storefront.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasChains ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || migrating}
              onClick={handleMigrate}
            >
              {migrating ? <Loader2 size={14} className="animate-spin mr-1" /> : <Wand2 size={14} className="mr-1" />}
              Import from sub-variants
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={disabled || saving} onClick={handleSave}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
            Save chains
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert variant="info" className="py-2.5 border-gold-200/60 bg-gold-50/40">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {!chains.length ? (
        <p className="text-sm text-muted-foreground">
          Configure variant types above, then save — chain rows appear for each option combination.
        </p>
      ) : (
        <div className="space-y-3">
          {chains.map((chain, index) => (
            <div key={chain.key} className="space-y-2">
              <ChainRow
                chain={chain}
                disabled={disabled || saving}
                onChange={next => updateChain(index, next)}
                onAddCode={() => {
                  updateChain(index, { ...chain, codes: [...(chain.codes || []), ''] });
                }}
                onRemoveCode={codeIdx => {
                  const next = (chain.codes || []).filter((_, i) => i !== codeIdx);
                  let activeIndex = chain.activeIndex || 0;
                  if (codeIdx < activeIndex) activeIndex -= 1;
                  if (activeIndex >= next.length) activeIndex = next.length;
                  updateChain(index, { ...chain, codes: next, activeIndex: Math.max(0, activeIndex) });
                }}
                onMoveCode={(codeIdx, delta) => {
                  const next = [...(chain.codes || [])];
                  const target = codeIdx + delta;
                  if (target < 0 || target >= next.length) return;
                  [next[codeIdx], next[target]] = [next[target], next[codeIdx]];
                  let activeIndex = chain.activeIndex || 0;
                  if (activeIndex === codeIdx) activeIndex = target;
                  else if (activeIndex === target) activeIndex = codeIdx;
                  updateChain(index, { ...chain, codes: next, activeIndex });
                }}
              />
              {chain.activeCode ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled || advancingKey === chain.key}
                    onClick={() => handleAdvance(chain.key)}
                  >
                    {advancingKey === chain.key ? (
                      <Loader2 size={14} className="animate-spin mr-1" />
                    ) : (
                      <ArrowRight size={14} className="mr-1" />
                    )}
                    Advance chain (mark active sold)
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
