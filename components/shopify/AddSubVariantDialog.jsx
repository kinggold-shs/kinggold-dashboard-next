'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Search } from 'lucide-react';
import { fn6Api } from '../../api/fn6';
import { TYPE_LABELS } from '../../constants/fn6';
import {
  fn6HasAssignableStock,
  fn6Quantity,
  fn6StockStatus,
  shopifyInventoryPayloadFromGwebQty,
} from '../../lib/fn6ItemFields';
import Fn6ItemMetadataPanel from '../Fn6ItemMetadataPanel';
import {
  createShopifyVariant,
  fetchShopifyInventoryPreflight,
  lookupShopifyProduct,
} from '../../lib/shopifyItemWorkflow';
import {
  getOptionSelectUiState,
  optionValuesToRestPayload,
  resolveOptionCatalogValues,
  validateNonKaratOptionUniqueness,
  validateOptionSelectionsAgainstProduct,
} from '../../lib/variantModel';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

const UNSET = '__unset__';
const LIST_PAGE_SIZE = 25;

function effectiveOptionSelection(selectedByName, typeName) {
  const v = selectedByName?.[typeName];
  return v && String(v).trim() ? v : '';
}

function emptySelectedByName(optionTypes) {
  const selectedByName = {};
  (optionTypes || []).forEach(t => {
    selectedByName[t.name] = '';
  });
  return selectedByName;
}

function listedEntryStatus(entry) {
  if (!entry || typeof entry === 'string') return entry || 'loading';
  return entry.status || 'loading';
}

function StockBadge({ item }) {
  const status = fn6StockStatus(item);
  if (status === 'in_stock') {
    return (
      <Badge variant="default" className="font-normal">
        Available
      </Badge>
    );
  }
  if (status === 'out_of_stock') {
    return (
      <Badge variant="destructive" className="font-normal">
        Unavailable
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      Qty unknown
    </Badge>
  );
}

function ListedBadge({ entry }) {
  const status = listedEntryStatus(entry);
  if (status === 'loading') {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        <Loader2 size={10} className="animate-spin mr-1" />
        Shopify…
      </Badge>
    );
  }
  if (status === 'listed') {
    return (
      <Badge variant="secondary" className="font-normal gap-1 text-muted-foreground">
        <CheckCircle2 size={10} />
        Listed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      Not listed
    </Badge>
  );
}

export default function AddSubVariantDialog({
  open,
  onOpenChange,
  mco,
  productId,
  optionTypes = [],
  shopifyOptions = [],
  variants = [],
  mainVariant = null,
  existingSkus = [],
  onCreated,
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [metadataItem, setMetadataItem] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [selectedByName, setSelectedByName] = useState(() => emptySelectedByName(optionTypes));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [inventoryPreflightOk, setInventoryPreflightOk] = useState(false);
  const [inventoryPreflightError, setInventoryPreflightError] = useState('');
  const [inventoryPreflightLoading, setInventoryPreflightLoading] = useState(false);
  const [listedByMco, setListedByMco] = useState({});
  const lookupGen = useRef(0);
  const metadataGen = useRef(0);

  const reservedSkus = useMemo(
    () => new Set((existingSkus || []).map(s => String(s)).filter(Boolean)),
    [existingSkus],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const resetDialog = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setSearchError('');
    setResults([]);
    setSelected(null);
    setMetadataItem(null);
    setMetadataLoading(false);
    setSelectedByName(emptySelectedByName(optionTypes));
    setFormError('');
    setInventoryPreflightOk(false);
    setInventoryPreflightError('');
    setInventoryPreflightLoading(false);
    setListedByMco({});
    lookupGen.current += 1;
    metadataGen.current += 1;
  }, [optionTypes]);

  useEffect(() => {
    if (!open) {
      resetDialog();
    }
  }, [open, resetDialog]);

  useEffect(() => {
    if (!open) return undefined;
    setSelectedByName(emptySelectedByName(optionTypes));
  }, [open, optionTypes]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setInventoryPreflightLoading(true);
    setInventoryPreflightOk(false);
    setInventoryPreflightError('');

    fetchShopifyInventoryPreflight()
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok) {
          setInventoryPreflightOk(true);
          setInventoryPreflightError('');
        } else {
          setInventoryPreflightOk(false);
          setInventoryPreflightError(data.error || 'Shopify inventory access check failed.');
        }
      })
      .catch(err => {
        if (cancelled) return;
        setInventoryPreflightOk(false);
        setInventoryPreflightError(err.message || 'Shopify inventory access check failed.');
      })
      .finally(() => {
        if (!cancelled) setInventoryPreflightLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !debouncedQuery) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError('');

    fn6Api
      .list({ search: debouncedQuery, page_size: LIST_PAGE_SIZE, page: 1 })
      .then(res => {
        if (cancelled) return;
        const items = (res.data?.results || []).filter(row => {
          const code = String(row.mco || '');
          if (!code) return false;
          if (code === String(mco)) return false;
          if (reservedSkus.has(code)) return false;
          return true;
        });
        setResults(items);
      })
      .catch(err => {
        if (cancelled) return;
        setSearchError(err?.response?.data?.detail || err.message || 'Search failed');
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, mco, reservedSkus]);

  useEffect(() => {
    if (!open || !results.length) return undefined;

    const gen = ++lookupGen.current;
    const codes = results.map(r => String(r.mco)).filter(Boolean);

    codes.forEach(code => {
      setListedByMco(prev => ({ ...prev, [code]: { status: 'loading' } }));
    });

    let cancelled = false;

    (async () => {
      await Promise.all(
        results.map(async row => {
          const code = String(row.mco);
          try {
            const data = await lookupShopifyProduct({ mco: code, idis: row.idis });
            if (cancelled || lookupGen.current !== gen) return;
            const listed = Boolean(data.found && data.productId);
            setListedByMco(prev => ({
              ...prev,
              [code]: {
                status: listed ? 'listed' : 'not_listed',
                inventory_quantity: data.inventory_quantity ?? null,
                inventory_tracked: data.inventory_tracked === true,
              },
            }));
          } catch {
            if (cancelled || lookupGen.current !== gen) return;
            setListedByMco(prev => ({ ...prev, [code]: { status: 'not_listed' } }));
          }
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [open, results]);

  function selectItem(item) {
    setSelected(item);
    setMetadataItem(item);
    setFormError('');
    setSelectedByName(emptySelectedByName(optionTypes));

    const code = String(item?.mco || '').trim();
    if (!code) return;

    const gen = ++metadataGen.current;
    setMetadataLoading(true);
    fn6Api
      .getByMco(code)
      .then(res => {
        if (metadataGen.current !== gen) return;
        setMetadataItem(res.data);
      })
      .catch(() => {
        if (metadataGen.current !== gen) return;
        setMetadataItem(item);
      })
      .finally(() => {
        if (metadataGen.current !== gen) return;
        setMetadataLoading(false);
      });
  }

  function validateOptions() {
    if (!optionTypes.length) {
      return 'Configure variant types before adding sub-variants.';
    }
    for (const type of optionTypes) {
      if (!selectedByName[type.name]) {
        return `Select a value for ${type.name}.`;
      }
    }
    const productErr = validateOptionSelectionsAgainstProduct(
      optionTypes,
      selectedByName,
      shopifyOptions,
    );
    if (productErr) return productErr;
    return validateNonKaratOptionUniqueness(
      optionTypes,
      selectedByName,
      variants,
      mainVariant,
      { shopifyOptions },
    );
  }

  async function handleCreate() {
    if (!inventoryPreflightOk) {
      setFormError(
        inventoryPreflightError
          || 'Shopify inventory is not ready — fix app scopes (read_locations, write_inventory) and reopen this dialog.',
      );
      return;
    }
    const validation = validateOptions();
    if (validation) {
      setFormError(validation);
      return;
    }
    if (!selected?.mco) {
      setFormError('Select an FN6 code first.');
      return;
    }
    if (!fn6HasAssignableStock(metadataItem || selected)) {
      const qty = fn6Quantity(metadataItem || selected);
      setFormError(
        qty === 0
          ? 'GWEB quantity is 0 — this code cannot be assigned as a sub-variant.'
          : 'GWEB quantity is missing — refresh item details or pick another code.',
      );
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const restOptions = optionValuesToRestPayload(
        optionTypes,
        selectedByName,
        shopifyOptions,
      );
      const payload = {
        ...restOptions,
        sku: String(selected.mco),
        price: derivedPrice,
      };
      const gwebQty = fn6Quantity(metadataItem || selected);
      Object.assign(payload, shopifyInventoryPayloadFromGwebQty(gwebQty));
      await createShopifyVariant(productId, payload);
      onOpenChange(false);
      await onCreated?.();
    } catch (err) {
      setFormError(err.message || 'Failed to create sub-variant');
    } finally {
      setSaving(false);
    }
  }

  const selectedListed = selected?.mco ? listedByMco[String(selected.mco)] : null;
  const showInventoryCompare = listedEntryStatus(selectedListed) === 'listed';
  const selectedItem = metadataItem || selected;
  const derivedPrice = useMemo(() => {
    const src = metadataItem || selected;
    if (!src || src.price == null || src.price === '') return '';
    return String(Math.round(Number(src.price)));
  }, [metadataItem, selected]);
  const selectedCanAssign =
    selected && !metadataLoading && fn6HasAssignableStock(selectedItem);
  const selectedListedOnShopify = listedEntryStatus(selectedListed) === 'listed';
  const inventoryReady = inventoryPreflightOk && !inventoryPreflightLoading;
  const canCreate =
    inventoryReady && selectedCanAssign && Boolean(optionTypes.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add sub-variant from FN6 code</DialogTitle>
          <DialogDescription>
            Search FN6 codes, pick option values, and create a sub-variant using that item&apos;s SKU.
            Availability follows GWEB quantity; a separate Shopify listing does not block assignment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {inventoryPreflightLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Checking Shopify inventory access…
            </div>
          ) : null}
          {!inventoryPreflightLoading && inventoryPreflightError ? (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="size-4" />
              <AlertDescription>{inventoryPreflightError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="fn6-sub-search" className="text-xs text-muted-foreground">
              FN6 code or SKU
            </Label>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                id="fn6-sub-search"
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setMetadataItem(null);
                  setMetadataLoading(false);
                }}
                placeholder="Search by code or name…"
                className="pl-9"
                autoFocus
              />
            </div>
            {searchError ? (
              <p className="text-sm text-destructive">{searchError}</p>
            ) : null}
          </div>

          {!debouncedQuery ? (
            <p className="text-sm text-muted-foreground">Type a code or name to search FN6 items.</p>
          ) : searching ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={16} className="animate-spin" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching items (excluding main and existing SKUs).</p>
          ) : (
            <ul className="border rounded-md divide-y max-h-48 overflow-y-auto">
              {results.map(row => {
                const code = String(row.mco);
                const isSelected = selected?.mco === row.mco;
                const rowInStock = fn6HasAssignableStock(row);
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => selectItem(row)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors ${
                        isSelected ? 'bg-gold-50/80 ring-1 ring-inset ring-gold-300/60' : ''
                      } ${!rowInStock ? 'opacity-80' : ''}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <code className="text-xs font-medium">{code}</code>
                          {row.idis ? (
                            <p className="text-sm text-muted-foreground truncate">{row.idis}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {TYPE_LABELS[row.co] || (row.co != null ? `${row.co}K` : '')}
                            {fn6Quantity(row) != null ? (
                              <span className="ml-1.5">· qty {fn6Quantity(row)}</span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <StockBadge item={row} />
                          <ListedBadge entry={listedByMco[code]} />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected ? (
            <div className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Selected</span>
                <code className="text-xs">{selected.mco}</code>
                <StockBadge item={selectedItem} />
                <ListedBadge entry={selectedListed} />
              </div>
              <p className="text-xs text-muted-foreground">
                Sub-variant SKU will be <code>{selected.mco}</code> on this product.
              </p>
              {selectedListedOnShopify && selectedCanAssign ? (
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  This code already has its own Shopify product; GWEB stock allows adding it here as a
                  sub-variant SKU.
                </p>
              ) : null}
              {!metadataLoading && selected && !fn6HasAssignableStock(selectedItem) ? (
                <p className="text-xs text-destructive">
                  Unavailable for assignment — GWEB quantity must be at least 1.
                </p>
              ) : null}

              <Fn6ItemMetadataPanel
                item={metadataItem}
                loading={metadataLoading}
                showInventoryCompare={showInventoryCompare}
                shopifyInventoryQuantity={selectedListed?.inventory_quantity ?? null}
                shopifyInventoryTracked={selectedListed?.inventory_tracked ?? null}
              />

              {(optionTypes || []).map(type => {
                const currentValue = effectiveOptionSelection(selectedByName, type.name);
                const catalogValues = resolveOptionCatalogValues(
                  type,
                  shopifyOptions,
                  variants,
                  mainVariant,
                );
                const { selectableValues, hint, disableSelect } = getOptionSelectUiState({
                  typeName: type.name,
                  catalogValues,
                  variants,
                  mainVariant,
                  optionTypes,
                  shopifyOptions,
                  currentValue,
                });
                return (
                <div key={type.name} className="space-y-1">
                  <Label className="text-xs">{type.name}</Label>
                  {hint ? (
                    <p className="text-xs text-amber-700 dark:text-amber-500">{hint}</p>
                  ) : null}
                  <Select
                    value={currentValue || UNSET}
                    onValueChange={v => {
                      setSelectedByName(prev => ({
                        ...prev,
                        [type.name]: v === UNSET ? '' : v,
                      }));
                    }}
                    disabled={saving || disableSelect}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder={type.name} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET}>Select {type.name}</SelectItem>
                      {selectableValues.map(val => (
                        <SelectItem key={val} value={val}>
                          {val}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                );
              })}

              <div className="space-y-1">
                <Label className="text-xs">Price</Label>
                <Input
                  value={derivedPrice}
                  readOnly
                  disabled
                  placeholder="—"
                  type="text"
                  className="h-8 bg-muted/50 cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  Price is set automatically from the live gold price.
                </p>
              </div>
            </div>
          ) : null}

          {formError ? (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="size-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={saving || !canCreate}
            title={
              !inventoryReady && inventoryPreflightError
                ? inventoryPreflightError
                : undefined
            }
          >
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Add sub-variant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
