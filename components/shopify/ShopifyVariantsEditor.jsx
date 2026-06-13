'use client';

import { useMemo, useRef, useState } from 'react';
import { fn6Api } from '../../api/fn6';
import { shopifyBinaryInventoryPayload } from '../../lib/fn6ItemFields';
import Fn6ItemMetadataPanel from '../Fn6ItemMetadataPanel';
import { AlertCircle, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  updateShopifyVariant,
  deleteShopifyVariant,
} from '../../lib/shopifyItemWorkflow';
import {
  filterCustomerOptionTypes,
  getOptionSelectUiState,
  isPlaceholderOptionValue,
  resolveOptionCatalogValues,
  validateLastOptionUniqueness,
  validateOptionSelectionsAgainstProduct,
  variantToOptionPayload,
} from '../../lib/variantModel';
import AddSubVariantDialog from './AddSubVariantDialog';

const UNSET = '__unset__';

function effectiveOptionSelection(selectedByName, typeName) {
  const v = selectedByName?.[typeName];
  return v && !isPlaceholderOptionValue(v) ? v : '';
}

function variantDeleteLabel(variant, optionTypes, shopifyOptions) {
  if (!variant) return 'this variant';
  if (variant.sku) return variant.sku;
  const selected = variantToOptionPayload(variant, optionTypes, shopifyOptions);
  const parts = (optionTypes || [])
    .map(t => effectiveOptionSelection(selected, t.name))
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : 'this variant';
}

function SubVariantFormRow({
  optionTypes,
  shopifyOptions,
  variants,
  mainVariant,
  excludeVariantId,
  mco,
  form,
  onChange,
  disabled,
  isMain = false,
}) {
  function setOptionValue(typeName, value) {
    const nextSelected = { ...form.selectedByName, [typeName]: value === UNSET ? '' : value };
    onChange({
      ...form,
      selectedByName: nextSelected,
    });
  }

  const typesArr = optionTypes || [];
  return (
    <>
      {typesArr.map((type, typeIdx) => {
        const currentValue = effectiveOptionSelection(form.selectedByName, type.name);
        const rawCatalogValues = resolveOptionCatalogValues(
          type,
          shopifyOptions,
          variants,
          mainVariant,
        );
        const catalogValues = rawCatalogValues;
        const { selectableValues, displayValue, hint, disableSelect } = getOptionSelectUiState({
          typeName: type.name,
          catalogValues,
          currentValue,
          variantSku: form.sku || '',
        });
        return (
        <TableCell key={type.name}>
          <div className="space-y-1 min-w-[8rem]">
            {hint ? (
              <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-500">{hint}</p>
            ) : null}
            <Select
              value={displayValue || UNSET}
              onValueChange={v => setOptionValue(type.name, v)}
              disabled={disabled || disableSelect}
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
        </TableCell>
        );
      })}
      <TableCell>
        <code className="text-xs">{isMain ? (form.sku || mco || '—') : (form.sku || '—')}</code>
      </TableCell>
      <TableCell>
        <Input
          value={form.price}
          readOnly
          disabled
          placeholder="—"
          type="text"
          className="h-8 bg-muted/50 cursor-not-allowed"
        />
      </TableCell>
    </>
  );
}

function roundedFn6Price(item) {
  if (!item || item.price == null || item.price === '') return '';
  return String(Math.round(Number(item.price)));
}

function subFormFromVariant(variant, optionTypes, shopifyOptions) {
  const selectedByName = variantToOptionPayload(variant, optionTypes, shopifyOptions);
  return {
    id: variant.id,
    selectedByName,
    sku: variant.sku || '',
    price: variant.price != null && variant.price !== '' ? String(variant.price) : '',
  };
}

export default function ShopifyVariantsEditor({
  mco,
  optionTypes = [],
  shopifyOptions = [],
  variantTypesDirty = false,
  mainVariant,
  productId,
  variants = [],
  onRefresh,
  onVariantsChanged,
  hideSubVariantActions = false,
}) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pendingDeleteVariantId, setPendingDeleteVariantId] = useState(null);
  const [deleteDialogError, setDeleteDialogError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [addFromCodeOpen, setAddFromCodeOpen] = useState(false);
  const [metaSku, setMetaSku] = useState(null);
  const [metaItem, setMetaItem] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const metaGen = useRef(0);

  const subVariants = useMemo(
    () => variants.filter(v => !mainVariant || Number(v.id) !== Number(mainVariant.id)),
    [variants, mainVariant],
  );

  const existingSkus = useMemo(
    () => [String(mco), ...variants.map(v => v.sku).filter(Boolean)],
    [mco, variants],
  );

  const customerOptionTypes = useMemo(
    () => filterCustomerOptionTypes(optionTypes),
    [optionTypes],
  );

  const canDeleteSub = subVariants.length > 0 && variants.length > 1;

  function openDeleteDialog(variant) {
    setDeleteTarget(variant);
    setPendingDeleteVariantId(variant.id);
    setDeleteDialogError('');
    setRowError('');
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    setPendingDeleteVariantId(null);
    setDeleteDialogError('');
  }

  function clearVariantMetadata() {
    setMetaSku(null);
    setMetaItem(null);
    setMetaLoading(false);
    metaGen.current += 1;
  }

  function selectVariantMetadata(sku) {
    const code = String(sku || '').trim();
    if (!code || editingId != null) return;

    if (metaSku === code) {
      clearVariantMetadata();
      return;
    }

    const gen = ++metaGen.current;
    setMetaSku(code);
    setMetaItem(null);
    setMetaLoading(true);
    fn6Api
      .getByMco(code)
      .then(res => {
        if (metaGen.current !== gen) return;
        setMetaItem(res.data);
      })
      .catch(() => {
        if (metaGen.current !== gen) return;
        setMetaItem({ mco: code });
      })
      .finally(() => {
        if (metaGen.current !== gen) return;
        setMetaLoading(false);
      });
  }

  function validateSubForm(subForm, excludeVariantId = null) {
    if (!customerOptionTypes.length) {
      return 'Add variant types before creating sub-variants.';
    }
    for (const type of customerOptionTypes) {
      if (!subForm.selectedByName[type.name]) {
        return `Select a value for ${type.name}.`;
      }
    }
    const productErr = validateOptionSelectionsAgainstProduct(
      customerOptionTypes,
      subForm.selectedByName,
      shopifyOptions,
    );
    if (productErr) return productErr;
    return validateLastOptionUniqueness(
      customerOptionTypes,
      subForm.selectedByName,
      variants,
      mainVariant,
      { excludeVariantId, shopifyOptions },
    );
  }

  const isEditingMain = mainVariant && editingId != null && Number(editingId) === Number(mainVariant.id);

  function refreshFormPriceFromFn6(code) {
    const trimmed = String(code || '').trim();
    if (!trimmed) return;
    fn6Api
      .getByMco(trimmed)
      .then(res => {
        const nextPrice = roundedFn6Price(res.data);
        if (!nextPrice) return;
        setForm(prev => (prev ? { ...prev, price: nextPrice } : prev));
      })
      .catch(() => {});
  }

  function startEditMain() {
    if (!mainVariant) return;
    clearVariantMetadata();
    setRowError('');
    setEditingId(mainVariant.id);
    setForm(subFormFromVariant(mainVariant, customerOptionTypes, shopifyOptions));
    refreshFormPriceFromFn6(mco);
  }

  async function handleSaveMain() {
    if (!mainVariant) return;
    const validation = validateSubForm(form, mainVariant.id);
    if (validation) {
      setRowError(validation);
      return;
    }

    setSaving(true);
    setRowError('');
    try {
      let price = form.price;
      try {
        const res = await fn6Api.getByMco(mco);
        const nextPrice = roundedFn6Price(res.data);
        if (nextPrice) price = nextPrice;
      } catch {
        // keep form.price
      }
      await updateShopifyVariant(productId, mainVariant.id, {
        selections: form.selectedByName,
        price,
      });
      cancelEdit();
      await onRefresh();
      onVariantsChanged?.();
    } catch (err) {
      setRowError(err.message || 'Failed to update main variant');
    } finally {
      setSaving(false);
    }
  }

  function startEditSub(variant) {
    clearVariantMetadata();
    setRowError('');
    setEditingId(variant.id);
    setForm(subFormFromVariant(variant, customerOptionTypes, shopifyOptions));
    refreshFormPriceFromFn6(variant.sku);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
    setRowError('');
  }

  async function handleSaveSub() {
    const validation = validateSubForm(form, editingId);
    if (validation) {
      setRowError(validation);
      return;
    }

    setSaving(true);
    setRowError('');
    try {
      let inventoryPayload = {};
      let price = form.price;
      const skuCode = String(form.sku || '').trim();
      if (skuCode) {
        try {
          const res = await fn6Api.getByMco(skuCode);
          inventoryPayload = shopifyBinaryInventoryPayload(true);
          const nextPrice = roundedFn6Price(res.data);
          if (nextPrice) price = nextPrice;
        } catch {
          inventoryPayload = {};
        }
      }
      await updateShopifyVariant(productId, editingId, {
        selections: form.selectedByName,
        sku: form.sku,
        price,
        ...inventoryPayload,
      });
      cancelEdit();
      await onRefresh();
      onVariantsChanged?.();
    } catch (err) {
      setRowError(err.message || 'Failed to save variant');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const variantId = pendingDeleteVariantId ?? deleteTarget?.id;
    if (variantId == null) {
      const msg = 'No variant selected for deletion.';
      setDeleteDialogError(msg);
      setRowError(msg);
      return;
    }
    if (!mainVariant) {
      const msg = 'Main variant is missing — reload the variants list.';
      setDeleteDialogError(msg);
      setRowError(msg);
      return;
    }
    if (Number(variantId) === Number(mainVariant.id)) {
      const msg = 'The main variant cannot be deleted here.';
      setDeleteDialogError(msg);
      setRowError(msg);
      return;
    }

    setDeleting(true);
    setDeleteDialogError('');
    setRowError('');
    try {
      await deleteShopifyVariant(productId, variantId);
      closeDeleteDialog();
      if (editingId != null && Number(editingId) === Number(variantId)) cancelEdit();
      await onRefresh();
      onVariantsChanged?.();
    } catch (err) {
      const msg = err.message || 'Failed to delete variant';
      setDeleteDialogError(msg);
      setRowError(msg);
    } finally {
      setDeleting(false);
    }
  }

  const optionHeaders = customerOptionTypes.map(t => t.name);
  const headClass = 'text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap';

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/80 overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={headClass}>Role</TableHead>
              {optionHeaders.map(name => (
                <TableHead key={name} className={headClass}>{name}</TableHead>
              ))}
              <TableHead className={headClass}>SKU</TableHead>
              <TableHead className={headClass}>Price</TableHead>
              <TableHead className={`${headClass} text-right sticky right-0 bg-muted/40 shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.08)]`}>
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mainVariant ? (
              isEditingMain && form ? (
                <TableRow className="bg-gold-50/70 border-l-2 border-l-gold-500">
                  <TableCell>
                    <Badge variant="default">Main</Badge>
                  </TableCell>
                  <SubVariantFormRow
                    optionTypes={customerOptionTypes}
                    shopifyOptions={shopifyOptions}
                    variants={variants}
                    mainVariant={mainVariant}
                    excludeVariantId={mainVariant.id}
                    mco={mco}
                    form={form}
                    onChange={setForm}
                    disabled={saving}
                    isMain
                  />
                  <TableCell className="text-right sticky right-0 bg-gold-50/70 shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.06)]">
                    <div className="flex justify-end gap-1 flex-wrap">
                      <Button size="sm" onClick={handleSaveMain} disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow
                  className={`bg-gold-50/70 hover:bg-gold-50/90 border-l-2 border-l-gold-500 cursor-pointer ${
                    metaSku === String(mainVariant.sku || mco) ? 'ring-1 ring-inset ring-gold-300/70' : ''
                  }`}
                  onClick={() => selectVariantMetadata(mainVariant.sku || mco)}
                  title="View GWEB item details"
                >
                  <TableCell>
                    <Badge variant="default">Main</Badge>
                  </TableCell>
                  {customerOptionTypes.map(type => {
                    const selected = variantToOptionPayload(mainVariant, customerOptionTypes, shopifyOptions);
                    return (
                      <TableCell key={type.name} className="text-muted-foreground text-sm">
                        {effectiveOptionSelection(selected, type.name) || '—'}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <code className="text-xs">{mainVariant.sku || mco}</code>
                  </TableCell>
                  <TableCell>
                    {mainVariant.price != null && mainVariant.price !== '' ? mainVariant.price : '—'}
                  </TableCell>
                  <TableCell
                    className="text-right sticky right-0 bg-gold-50/70 shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.06)]"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1 flex-wrap">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={startEditMain}
                        disabled={editingId != null || !customerOptionTypes.length}
                        aria-label="Edit variant"
                      >
                        <Pencil size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            ) : null}

            {subVariants.map(v => {
              const isEditing = editingId === v.id;
              if (isEditing && form) {
                return (
                  <TableRow key={v.id} className="bg-muted/20">
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        Sub
                      </Badge>
                    </TableCell>
                    <SubVariantFormRow
                      optionTypes={customerOptionTypes}
                      shopifyOptions={shopifyOptions}
                      variants={variants}
                      mainVariant={mainVariant}
                      excludeVariantId={v.id}
                      mco={mco}
                      form={form}
                      onChange={setForm}
                      disabled={saving}
                    />
                    <TableCell className="text-right sticky right-0 bg-muted/20">
                      <div className="flex justify-end gap-1 flex-wrap">
                      <Button size="sm" onClick={handleSaveSub} disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              const selected = variantToOptionPayload(v, customerOptionTypes, shopifyOptions);
              const rowSku = v.sku ? String(v.sku) : '';
              const isMetaSelected = rowSku && metaSku === rowSku;
              return (
                <TableRow
                  key={v.id}
                  className={`hover:bg-muted/30 ${rowSku ? 'cursor-pointer' : ''} ${
                    isMetaSelected ? 'bg-gold-50/50 ring-1 ring-inset ring-gold-300/70' : ''
                  }`}
                  onClick={() => rowSku && selectVariantMetadata(rowSku)}
                  title={rowSku ? 'View GWEB item details' : undefined}
                >
                  <TableCell>
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      Sub
                    </Badge>
                  </TableCell>
                  {customerOptionTypes.map(type => (
                    <TableCell key={type.name} className="text-muted-foreground">
                      {effectiveOptionSelection(selected, type.name) || '—'}
                    </TableCell>
                  ))}
                  <TableCell>
                    {v.sku ? <code className="text-xs">{v.sku}</code> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{v.price != null && v.price !== '' ? v.price : '—'}</TableCell>
                  <TableCell
                    className="text-right sticky right-0 bg-card shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.06)]"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => startEditSub(v)}
                      disabled={editingId != null || !customerOptionTypes.length}
                      aria-label="Edit sub-variant"
                    >
                      <Pencil size={14} />
                    </Button>
                    {canDeleteSub ? (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(v)}
                        disabled={editingId != null}
                        aria-label="Delete sub-variant"
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="inline-block">
                              <Button size="icon-sm" variant="outline" disabled aria-label="Delete sub-variant">
                                <Trash2 size={14} />
                              </Button>
                            </span>
                          }
                        />
                        <TooltipContent>Shopify requires at least one variant</TooltipContent>
                      </Tooltip>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

          </TableBody>
        </Table>
        </div>
      </div>

      {metaSku ? (
        <div className="rounded-lg border border-border/80 bg-muted/5 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground mb-2">
            GWEB item for SKU <code className="rounded bg-muted px-1 py-0.5">{metaSku}</code>
            {' '}
            <span className="sr-only">Tap the row again to hide.</span>
            <span aria-hidden>— tap row again to hide</span>
          </p>
          <Fn6ItemMetadataPanel item={metaItem} loading={metaLoading} hideQuantity />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Tap a variant row to view weight and price from GWEB.
        </p>
      )}

      {rowError ? (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="size-4" />
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      ) : null}

      {!hideSubVariantActions ? (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddFromCodeOpen(true)}
          disabled={editingId != null || !customerOptionTypes.length || variantTypesDirty}
        >
          <Plus size={14} className="mr-1" />
          Add sub-variant
        </Button>

        {variantTypesDirty ? (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            Save variant types above before adding sub-variants.
          </p>
        ) : !customerOptionTypes.length ? (
          <p className="text-xs text-muted-foreground">
            Configure variant types above before adding sub-variants.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Search and select an FN6 code to add a sub-variant SKU.
          </p>
        )}
      </div>
      ) : (
        <p className="text-xs text-muted-foreground pt-1">
          Sub-variants are managed via code chains above. Use the variants table to edit option values or view GWEB details.
        </p>
      )}

      {!hideSubVariantActions ? (
      <AddSubVariantDialog
        open={addFromCodeOpen}
        onOpenChange={setAddFromCodeOpen}
        mco={mco}
        productId={productId}
        optionTypes={customerOptionTypes}
        shopifyOptions={shopifyOptions}
        variants={variants}
        mainVariant={mainVariant}
        existingSkus={existingSkus}
        onCreated={async () => {
          await onRefresh();
          onVariantsChanged?.();
        }}
      />
      ) : null}

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && !deleting && closeDeleteDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete variant?</DialogTitle>
            <DialogDescription>
              Remove {variantDeleteLabel(deleteTarget, customerOptionTypes, shopifyOptions)} from Shopify. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteDialogError ? (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="size-4" />
              <AlertDescription>{deleteDialogError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
