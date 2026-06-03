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

  SelectGroup,

  SelectItem,

  SelectLabel,

  SelectTrigger,

  SelectValue,

} from '../ui/select';

import { TYPE_OPTIONS_MODAL } from '../../constants/fn6';

import {

  fetchVariantOptionSuggestions,

  updateProductVariantTypes,

} from '../../lib/shopifyItemWorkflow';

import {

  defaultVariantTypesForNewProduct,

  isPlaceholderOptionName,

  isPlaceholderOptionValue,

  isPrimaryCatalogOption,

  orderVariantTypes,

  PRIMARY_OPTION_CATALOG,

} from '../../lib/variantModel';



const KARAT_PRESET_VALUES = TYPE_OPTIONS_MODAL

  .filter(o => o.value)

  .map(o => `${o.value}K`);



function normalizeTypes(types) {

  const filtered = (types || [])

    .map(t => ({

      name: String(t.name || '').trim(),

      values: [...new Set(

        (t.values || []).map(v => String(v).trim()).filter(Boolean),

      )].filter(v => !isPlaceholderOptionValue(v)),

    }))

    .filter(t => t.name && !isPlaceholderOptionName(t.name));

  return orderVariantTypes(filtered);

}



function typesEqual(a, b) {

  return JSON.stringify(normalizeTypes(a)) === JSON.stringify(normalizeTypes(b));

}



export default function VariantTypesEditor({

  productId,

  mco,

  optionTypes = [],

  disabled,

  onSaved,

  onDirtyChange,

  onDraftTypesChange,

}) {

  const [draft, setDraft] = useState([]);

  const [dirty, setDirty] = useState(false);

  const [suggestions, setSuggestions] = useState([]);

  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const [newTypeName, setNewTypeName] = useState('');

  const [newValueByType, setNewValueByType] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);



  useEffect(() => {

    onDirtyChange?.(dirty);

  }, [dirty, onDirtyChange]);



  useEffect(() => {

    onDraftTypesChange?.(draft);

  }, [draft, onDraftTypesChange]);



  useEffect(() => {

    setDraft(normalizeTypes(optionTypes));

    setDirty(false);

  }, [productId]);



  useEffect(() => {

    if (dirty) return;

    const normalized = normalizeTypes(optionTypes);

    setDraft(prev => (typesEqual(prev, normalized) ? prev : normalized));

  }, [optionTypes, dirty]);



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

    PRIMARY_OPTION_CATALOG.forEach(n => names.add(n));

    return orderVariantTypes(

      Array.from(names).map(name => ({ name, values: [] })),

    ).map(t => t.name);

  }, [suggestions]);



  const catalogNamesByGroup = useMemo(() => {

    const used = new Set(draft.map(t => t.name.toLowerCase()));

    const available = suggestionNames.filter(n => !used.has(n.toLowerCase()));

    return {

      primary: available.filter(n => isPrimaryCatalogOption(n)),

      other: available.filter(n => !isPrimaryCatalogOption(n)),

    };

  }, [suggestionNames, draft]);



  const atMaxTypes = draft.length >= 3;



  function markDirty(updater) {

    setDirty(true);

    setDraft(updater);

  }



  function addType(name) {

    const trimmed = String(name || '').trim();

    if (!trimmed || atMaxTypes || isPlaceholderOptionName(trimmed)) return;

    if (draft.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) return;



    const preset = suggestions.find(

      s => s.name.toLowerCase() === trimmed.toLowerCase(),

    );

    let values = preset?.values?.length ? [...preset.values] : [];

    if (trimmed.toLowerCase() === 'karat' && !values.length) {

      values = [...KARAT_PRESET_VALUES];

    }



    markDirty(prev => orderVariantTypes([...prev, { name: trimmed, values }]));

    setNewTypeName('');

  }



  function removeType(index) {

    markDirty(prev => orderVariantTypes(prev.filter((_, i) => i !== index)));

  }



  function startWithKaratAndSize() {

    markDirty(() => defaultVariantTypesForNewProduct(KARAT_PRESET_VALUES));

  }



  function removeValue(typeIndex, value) {

    markDirty(prev => prev.map((t, i) => {

      if (i !== typeIndex) return t;

      return { ...t, values: t.values.filter(v => v !== value) };

    }));

  }



  function addValue(typeIndex, raw) {

    const val = String(raw || '').trim();

    if (!val || isPlaceholderOptionValue(val)) return;

    markDirty(prev => prev.map((t, i) => {

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



  function requestSave() {

    const validation = validateDraft();

    if (validation) {

      setError(validation);

      return;

    }

    setConfirmOpen(true);

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

      setDirty(false);

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

      {/* 1. Header: title, meta, primary save */}

      <header className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">

        <div className="min-w-0 space-y-1">

          <div className="flex flex-wrap items-center gap-2">

            <Layers2 size={16} className="shrink-0 text-gold-600" aria-hidden />

            <h4 className="text-sm font-semibold text-foreground">Variant types</h4>

            <Badge variant="outline" className="tabular-nums">

              {draft.length}/3

            </Badge>

            {dirty ? (

              <Badge variant="secondary" className="border-amber-200/80 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">

                Unsaved

              </Badge>

            ) : null}

          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">

            Up to three Shopify options. Karat and Size are the primary catalogs (slots 1–2 when both are used). Saving does not rebuild variants — review main and sub values afterward.

          </p>

          {loadingSuggestions ? (

            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">

              <Loader2 size={12} className="animate-spin" />

              Loading catalog…

            </span>

          ) : null}

        </div>

        <Button

          size="sm"

          onClick={requestSave}

          disabled={saving || draft.length === 0 || !dirty}

          className="w-full shrink-0 rounded-lg bg-gold-600 text-white hover:bg-gold-700 disabled:opacity-50 sm:w-auto"

        >

          {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}

          Save variant types

        </Button>

      </header>



      {/* 2. Compact unsaved notice */}

      {dirty ? (

        <Alert

          variant="warning"

          className="py-2 [&>svg]:top-2.5 [&>svg~*]:pl-6 border-amber-200/70 bg-amber-50/50 dark:bg-amber-950/20"

        >

          <AlertCircle className="size-3.5" />

          <AlertDescription className="text-xs leading-snug">

            Unsaved changes — save before leaving this item.

          </AlertDescription>

        </Alert>

      ) : null}



      {error ? (

        <Alert variant="destructive" className="py-2.5">

          <AlertCircle className="size-4" />

          <AlertDescription>{error}</AlertDescription>

        </Alert>

      ) : null}



      {/* 3. Existing types (configure first) */}

      {draft.length === 0 ? (

        <div className="rounded-lg border border-dashed border-border/80 bg-background/60 px-4 py-6 text-center space-y-3">

          <p className="text-sm text-muted-foreground">

            No variant types yet. Start with Karat and Size, or add a type below.

          </p>

          <Button

            type="button"

            variant="outline"

            size="sm"

            onClick={startWithKaratAndSize}

            className="rounded-lg border-gold-200/80 text-gold-800 hover:bg-gold-50"

          >

            Add Karat &amp; Size

          </Button>

        </div>

      ) : (

        <ol className="space-y-2.5" aria-label="Configured variant types">

          {draft.map((type, typeIndex) => (

            <li

              key={type.name}

              className="rounded-lg border border-border/80 bg-card overflow-hidden"

            >

              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 sm:px-3.5">

                <span className="text-sm font-medium text-foreground">

                  <span className="mr-2 tabular-nums text-muted-foreground">{typeIndex + 1}.</span>

                  {type.name}

                </span>

                <Button

                  type="button"

                  variant="ghost"

                  size="icon-sm"

                  onClick={() => removeType(typeIndex)}

                  aria-label={`Remove ${type.name}`}

                  className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"

                >

                  <X size={14} strokeWidth={2} />

                </Button>

              </div>

              <div className="space-y-2.5 p-3 sm:p-3.5">

                <div>

                  <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">

                    Values

                  </p>

                  <div className="flex min-h-[1.75rem] flex-wrap gap-1.5">

                    {type.values.map(val => (

                      <Badge

                        key={val}

                        variant="outline"

                        className="gap-1 rounded-md border-gold-200/90 bg-gold-50/60 px-2 py-0.5 text-xs font-medium text-gold-900 hover:scale-100"

                      >

                        {val}

                        <button

                          type="button"

                          className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"

                          onClick={() => removeValue(typeIndex, val)}

                          aria-label={`Remove ${val}`}

                        >

                          <X size={11} strokeWidth={2.5} />

                        </button>

                      </Badge>

                    ))}

                    {type.values.length === 0 ? (

                      <span className="text-xs text-destructive">Add at least one value</span>

                    ) : null}

                  </div>

                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

                  <Input

                    value={newValueByType[typeIndex] || ''}

                    onChange={e => setNewValueByType(prev => ({ ...prev, [typeIndex]: e.target.value }))}

                    onKeyDown={e => {

                      if (e.key === 'Enter') {

                        e.preventDefault();

                        addValue(typeIndex, newValueByType[typeIndex]);

                      }

                    }}

                    placeholder="New value"

                    aria-label={`Add value for ${type.name}`}

                    className="h-8 min-w-0 flex-1 border-input bg-background text-sm focus-visible:ring-2 focus-visible:ring-gold-400/50"

                  />

                  <Button

                    type="button"

                    variant="outline"

                    size="sm"

                    onClick={() => addValue(typeIndex, newValueByType[typeIndex])}

                    className="h-8 shrink-0 rounded-lg border-gold-200/80 text-gold-800 hover:bg-gold-50"

                  >

                    <Plus size={14} className="mr-1" />

                    Add value

                  </Button>

                </div>

              </div>

            </li>

          ))}

        </ol>

      )}



      {/* 4. Add type (secondary, last) */}

      {!atMaxTypes ? (

        <section

          aria-labelledby="add-variant-type-heading"

          className="rounded-lg border border-dashed border-border/80 bg-muted/10 p-3 sm:p-4"

        >

          <h5

            id="add-variant-type-heading"

            className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"

          >

            {draft.length === 0 ? 'Add variant type' : 'Add another type'}

          </h5>

          <div className="flex flex-col gap-2.5">

            <div className="space-y-1.5">

              <Label htmlFor="variant-type-catalog" className="text-xs text-muted-foreground">

                From catalog

              </Label>

              <Select

                value={newTypeName || '__custom__'}

                onValueChange={v => {

                  if (v === '__custom__') setNewTypeName('');

                  else addType(v);

                }}

                disabled={loadingSuggestions}

              >

                <SelectTrigger

                  id="variant-type-catalog"

                  className="h-9 w-full rounded-lg border-input bg-background focus-visible:ring-2 focus-visible:ring-gold-400/50"

                >

                  <SelectValue placeholder="Choose a type…" />

                </SelectTrigger>

                <SelectContent>

                  {catalogNamesByGroup.primary.length ? (

                    <SelectGroup>

                      <SelectLabel>Primary options</SelectLabel>

                      {catalogNamesByGroup.primary.map(name => (

                        <SelectItem key={name} value={name}>

                          {name}

                        </SelectItem>

                      ))}

                    </SelectGroup>

                  ) : null}

                  {catalogNamesByGroup.other.length ? (

                    <SelectGroup>

                      <SelectLabel>From catalog</SelectLabel>

                      {catalogNamesByGroup.other.map(name => (

                        <SelectItem key={name} value={name}>

                          {name}

                        </SelectItem>

                      ))}

                    </SelectGroup>

                  ) : null}

                </SelectContent>

              </Select>

            </div>

            <div className="space-y-1.5">

              <Label htmlFor="variant-type-custom" className="text-xs text-muted-foreground">

                Or custom name

              </Label>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

                <Input

                  id="variant-type-custom"

                  value={newTypeName}

                  onChange={e => setNewTypeName(e.target.value)}

                  onKeyDown={e => {

                    if (e.key === 'Enter') {

                      e.preventDefault();

                      addType(newTypeName);

                    }

                  }}

                  placeholder="e.g. Size"

                  className="h-9 min-w-0 flex-1 rounded-lg border-input bg-background text-sm focus-visible:ring-2 focus-visible:ring-gold-400/50"

                />

                <Button

                  type="button"

                  variant="outline"

                  size="sm"

                  onClick={() => addType(newTypeName)}

                  disabled={!newTypeName.trim()}

                  className="h-9 shrink-0 rounded-lg border-gold-200/80 text-gold-800 hover:bg-gold-50 disabled:opacity-50"

                >

                  <Plus size={14} className="mr-1" />

                  Add type

                </Button>

              </div>

            </div>

          </div>

        </section>

      ) : (

        <p className="text-center text-xs text-muted-foreground">

          Maximum of 3 variant types reached.

        </p>

      )}



      {/* Mobile: duplicate save when dirty (sticky affordance) */}

      {dirty ? (

        <div className="sticky bottom-0 -mx-4 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm sm:hidden">

          <Button

            size="sm"

            onClick={requestSave}

            disabled={saving || draft.length === 0}

            className="w-full rounded-lg bg-gold-600 text-white hover:bg-gold-700"

          >

            {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}

            Save variant types

          </Button>

        </div>

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

              {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}

              Confirm save

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

    </div>

  );

}


