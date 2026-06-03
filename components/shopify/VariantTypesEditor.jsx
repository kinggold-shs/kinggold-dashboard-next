'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
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
      <p className="text-sm text-muted-foreground">
        Publish this item to Shopify to manage variant types.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Variant types</p>
        <span className="text-xs text-muted-foreground">{draft.length}/3 types</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Option changes do not auto-regenerate variants. Review main and sub variant values after saving.
      </p>

      {draft.map((type, typeIndex) => (
        <div key={type.name} className="border rounded-lg p-3 space-y-2 bg-muted/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{type.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeType(typeIndex)}
              aria-label={`Remove ${type.name}`}
            >
              <X size={14} className="text-destructive" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {type.values.map(val => (
              <Badge key={val} variant="outline" className="gap-1 pr-1">
                {val}
                <button
                  type="button"
                  className="rounded-full hover:bg-muted p-0.5"
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
          <div className="flex gap-2 items-center">
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
              className="h-8 max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addValue(typeIndex, newValueByType[typeIndex])}
            >
              Add value
            </Button>
          </div>
        </div>
      ))}

      {!atMaxTypes ? (
        <div className="space-y-2 border border-dashed rounded-lg p-3">
          <Label className="text-xs text-muted-foreground">Add variant type</Label>
          <div className="flex flex-wrap gap-2">
            <Select
              value={newTypeName || '__custom__'}
              onValueChange={v => {
                if (v === '__custom__') setNewTypeName('');
                else addType(v);
              }}
              disabled={loadingSuggestions}
            >
              <SelectTrigger className="h-9 w-48">
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
              className="h-9 max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addType(newTypeName)}
              disabled={!newTypeName.trim()}
            >
              <Plus size={14} className="mr-1" />
              Add type
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Maximum of 3 variant types reached.</p>
      )}

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
        Save variant types
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
