'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Layers2, Loader2, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { TYPE_OPTIONS_MODAL } from '../../constants/fn6';
import {
  fetchVariantOptionSuggestions,
  updateProductVariantTypes,
} from '../../lib/shopifyItemWorkflow';

const KARAT_PRESET_VALUES = TYPE_OPTIONS_MODAL
  .filter(o => o.value)
  .map(o => `${o.value}K`);

function normalizeTypes(types) {
  return (types || []).map(t => ({
    name: String(t.name || '').trim(),
    values: [...new Set((t.values || []).map(v => String(v).trim()).filter(Boolean))],
  })).filter(t => t.name);
}

export default function VariantTypesEditor({
  productId,
  mco,
  optionTypes = [],
  disabled,
  onSaved,
}) {
  const [draft, setDraft] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newValueByType, setNewValueByType] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setDraft(normalizeTypes(optionTypes));
  }, [optionTypes]);

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const data = await fetchVariantOptionSuggestions();
      setSuggestions(data.options || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (!disabled && productId) loadSuggestions();
  }, [disabled, productId, loadSuggestions]);

  const suggestionNames = useMemo(() => {
    const names = new Set(suggestions.map(s => s.name));
    names.add('Karat');
    return Array.from(names).sort();
  }, [suggestions]);

  const atMaxTypes = draft.length >= 3;

  function addType(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || atMaxTypes) return;
    if (draft.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) return;

    const preset = suggestions.find(
      s => s.name.toLowerCase() === trimmed.toLowerCase(),
    );
    let values = preset?.values?.length ? [...preset.values] : [];
    if (trimmed.toLowerCase() === 'karat' && !values.length) {
      values = [...KARAT_PRESET_VALUES];
    }

    setDraft(prev => [...prev, { name: trimmed, values }]);
    setNewTypeName('');
  }

  function removeType(index) {
    setDraft(prev => prev.filter((_, i) => i !== index));
  }

  function removeValue(typeIndex, value) {
    setDraft(prev => prev.map((t, i) => {
      if (i !== typeIndex) return t;
      return { ...t, values: t.values.filter(v => v !== value) };
    }));
  }

  function addValue(typeIndex, raw) {
    const val = String(raw || '').trim();
    if (!val) return;
    setDraft(prev => prev.map((t, i) => {
      if (i !== typeIndex) return t;
      if (t.values.includes(val)) return t;
      return { ...t, values: [...t.values, val] };
    }));
    setNewValueByType(prev => ({ ...prev, [typeIndex]: '' }));
  }

  function validateDraft() {
    if (draft.some(t => !t.values.length)) {
      return 'Each variant type must have at least one value.';
    }
    return null;
  }

  async function handleSave() {
    const validation = validateDraft();
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateProductVariantTypes(productId, { types: draft, mco });
      setConfirmOpen(false);
      await onSaved?.();
    } catch (err) {
      setError(err.message || 'Failed to save variant types');
    } finally {
      setSaving(false);
    }
  }

  if (disabled) {
    return (
      <Alert variant="info" className="border-gold-200/60 bg-gold-50/30">
        <AlertCircle className="size-4 text-gold-600" />
        <AlertDescription>
          Publish this item to Shopify to manage variant types.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers2 size={16} className="text-gold-600 shrink-0" />
            <p className="text-sm font-semibold text-foreground">Variant types</p>
            <Badge variant="outline">{draft.length}/3</Badge>
          </div>
          <p className="text-xs text-muted-foreground pl-6 sm:pl-0 sm:ml-6">
            Option changes do not auto-regenerate variants. Review main and sub values after saving.
          </p>
        </div>
        {loadingSuggestions ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Loading catalog…
          </span>
        ) : null}
      </div>

      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/80 bg-background/60 px-4 py-6 text-center">
          No variant types yet. Add up to three option dimensions (e.g. Karat, Size).
        </p>
      ) : null}

      <div className="space-y-3">
        {draft.map((type, typeIndex) => (
          <div
            key={type.name}
            className="rounded-lg border border-border/80 bg-card p-3 sm:p-4 space-y-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gold-800">{type.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeType(typeIndex)}
                aria-label={`Remove ${type.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X size={14} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
              {type.values.map(val => (
                <Badge key={val} variant="default" className="gap-1 pr-1 font-normal">
                  {val}
                  <button
                    type="button"
                    className="rounded-full hover:bg-gold-200/60 p-0.5 transition-colors"
                    onClick={() => removeValue(typeIndex, val)}
                    aria-label={`Remove ${val}`}
                  >
                    <X size={10} />
                  </button>
                </Badge>
              ))}
              {type.values.length === 0 ? (
                <span className="text-xs text-destructive">Add at least one value</span>
              ) : null}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input
                value={newValueByType[typeIndex] || ''}
                onChange={e => setNewValueByType(prev => ({ ...prev, [typeIndex]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addValue(typeIndex, newValueByType[typeIndex]);
                  }
                }}
                placeholder="Add value"
                className="h-8 sm:max-w-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addValue(typeIndex, newValueByType[typeIndex])}
                className="shrink-0"
              >
                Add value
              </Button>
            </div>
          </div>
        ))}
      </div>

      {!atMaxTypes ? (
        <div className="space-y-2 border border-dashed border-gold-200/50 rounded-lg p-3 sm:p-4 bg-gold-50/20">
          <Label className="text-xs font-medium text-muted-foreground">Add variant type</Label>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <Select
              value={newTypeName || '__custom__'}
              onValueChange={v => {
                if (v === '__custom__') setNewTypeName('');
                else addType(v);
              }}
              disabled={loadingSuggestions}
            >
              <SelectTrigger className="h-9 w-full sm:w-48">
                <SelectValue placeholder="From catalog…" />
              </SelectTrigger>
              <SelectContent>
                {suggestionNames.map(name => (
                  <SelectItem key={name} value={name} disabled={draft.some(t => t.name === name)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addType(newTypeName);
                }
              }}
              placeholder="Custom type name"
              className="h-9 sm:max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addType(newTypeName)}
              disabled={!newTypeName.trim()}
              className="shrink-0"
            >
              <Plus size={14} className="mr-1" />
              Add type
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Maximum of 3 variant types reached.</p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          size="sm"
          onClick={() => {
            const validation = validateDraft();
            if (validation) {
              setError(validation);
              return;
            }
            setConfirmOpen(true);
          }}
          disabled={saving || draft.length === 0}
        >
          {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
          Save variant types
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update variant types?</DialogTitle>
            <DialogDescription>
              Changing product options may require updating values on the main variant (SKU {mco}) and
              every sub-variant. Shopify will not rebuild the variant matrix automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Confirm save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
