'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
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
  createShopifyVariant,
  updateShopifyVariant,
  deleteShopifyVariant,
} from '../../lib/shopifyItemWorkflow';
import {
  deriveSubSku,
  optionValuesToRestPayload,
  variantToOptionPayload,
} from '../../lib/variantModel';

const UNSET = '__unset__';

function optionValuesInOrder(optionTypes, selectedByName) {
  return (optionTypes || []).map(t => selectedByName[t.name] || '');
}

function SubVariantFormRow({
  optionTypes,
  mco,
  existingSkus,
  form,
  onChange,
  disabled,
}) {
  const derivedSku = useMemo(
    () => deriveSubSku(mco, optionValuesInOrder(optionTypes, form.selectedByName), existingSkus),
    [mco, optionTypes, form.selectedByName, existingSkus],
  );

  const displaySku = form.skuOverride ? form.sku : derivedSku;

  function setOptionValue(typeName, value) {
    const nextSelected = { ...form.selectedByName, [typeName]: value === UNSET ? '' : value };
    const nextSku = form.skuOverride
      ? form.sku
      : deriveSubSku(mco, optionValuesInOrder(optionTypes, nextSelected), existingSkus);
    onChange({
      ...form,
      selectedByName: nextSelected,
      sku: nextSku,
    });
  }

  function toggleOverride(checked) {
    onChange({
      ...form,
      skuOverride: checked,
      sku: checked ? (form.sku || derivedSku) : derivedSku,
    });
  }

  return (
    <>
      {(optionTypes || []).map(type => (
        <TableCell key={type.name}>
          <Select
            value={form.selectedByName[type.name] || UNSET}
            onValueChange={v => setOptionValue(type.name, v)}
            disabled={disabled || !type.values?.length}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder={type.name} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Select {type.name}</SelectItem>
              {(type.values || []).map(val => (
                <SelectItem key={val} value={val}>
                  {val}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      ))}
      <TableCell>
        <div className="space-y-1">
          {form.skuOverride ? (
            <Input
              value={form.sku}
              onChange={e => onChange({ ...form, sku: e.target.value })}
              disabled={disabled}
              className="h-8"
            />
          ) : (
            <code className="text-xs">{displaySku || '—'}</code>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={form.skuOverride}
              onCheckedChange={toggleOverride}
              disabled={disabled}
              id={`sku-override-${form.id || 'new'}`}
            />
            <Label htmlFor={`sku-override-${form.id || 'new'}`} className="text-xs text-muted-foreground">
              Override SKU
            </Label>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={form.price}
          onChange={e => onChange({ ...form, price: e.target.value })}
          placeholder="0.00"
          type="number"
          step="0.01"
          min="0"
          disabled={disabled}
          className="h-8"
        />
      </TableCell>
    </>
  );
}

function emptySubForm(optionTypes) {
  const selectedByName = {};
  (optionTypes || []).forEach(t => {
    selectedByName[t.name] = '';
  });
  return {
    selectedByName,
    sku: '',
    skuOverride: false,
    price: '',
  };
}

function subFormFromVariant(variant, optionTypes, mco, existingSkus) {
  const selectedByName = variantToOptionPayload(variant, optionTypes);
  const sku = variant.sku || '';
  return {
    id: variant.id,
    selectedByName,
    sku,
    skuOverride: Boolean(sku && sku !== deriveSubSku(mco, optionValuesInOrder(optionTypes, selectedByName), existingSkus)),
    price: variant.price != null && variant.price !== '' ? String(variant.price) : '',
  };
}

export default function ShopifyVariantsEditor({
  mco,
  optionTypes = [],
  mainVariant,
  productId,
  variants = [],
  onRefresh,
  onVariantsChanged,
}) {
  const [editingId, setEditingId] = useState(null);
  const [mainPrice, setMainPrice] = useState('');
  const [editingMainPrice, setEditingMainPrice] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const subVariants = useMemo(
    () => variants.filter(v => !mainVariant || Number(v.id) !== Number(mainVariant.id)),
    [variants, mainVariant],
  );

  const existingSkus = useMemo(
    () => [String(mco), ...variants.map(v => v.sku).filter(Boolean)],
    [mco, variants],
  );

  const canDeleteSub = variants.length > 1;

  function validateSubForm(subForm) {
    if (!optionTypes.length) {
      return 'Add variant types before creating sub-variants.';
    }
    for (const type of optionTypes) {
      if (!subForm.selectedByName[type.name]) {
        return `Select a value for ${type.name}.`;
      }
    }
    return null;
  }

  function startEditMainPrice() {
    setRowError('');
    setMainPrice(
      mainVariant?.price != null && mainVariant.price !== ''
        ? String(mainVariant.price)
        : '',
    );
    setEditingMainPrice(true);
  }

  async function saveMainPrice() {
    if (!mainVariant) return;
    setSaving(true);
    setRowError('');
    try {
      await updateShopifyVariant(productId, mainVariant.id, { price: mainPrice });
      setEditingMainPrice(false);
      await onRefresh();
      onVariantsChanged?.();
    } catch (err) {
      setRowError(err.message || 'Failed to update main variant');
    } finally {
      setSaving(false);
    }
  }

  function startEditSub(variant) {
    setRowError('');
    setEditingId(variant.id);
    setForm(subFormFromVariant(variant, optionTypes, mco, existingSkus));
  }

  function startNewSub() {
    setRowError('');
    setEditingId('new');
    setForm(emptySubForm(optionTypes));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
    setRowError('');
  }

  async function handleSaveSub() {
    const validation = validateSubForm(form);
    if (validation) {
      setRowError(validation);
      return;
    }

    setSaving(true);
    setRowError('');
    try {
      const restOptions = optionValuesToRestPayload(optionTypes, form.selectedByName);
      const payload = {
        ...restOptions,
        sku: form.skuOverride ? form.sku : deriveSubSku(
          mco,
          optionValuesInOrder(optionTypes, form.selectedByName),
          existingSkus,
        ),
        price: form.price,
      };

      if (editingId === 'new') {
        await createShopifyVariant(productId, payload);
      } else {
        await updateShopifyVariant(productId, editingId, payload);
      }
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
    if (!deleteTarget || !mainVariant || Number(deleteTarget.id) === Number(mainVariant.id)) return;
    setDeleting(true);
    setRowError('');
    try {
      await deleteShopifyVariant(productId, deleteTarget.id);
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) cancelEdit();
      await onRefresh();
      onVariantsChanged?.();
    } catch (err) {
      setRowError(err.message || 'Failed to delete variant');
    } finally {
      setDeleting(false);
    }
  }

  const optionHeaders = optionTypes.map(t => t.name);
  const headClass = 'text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap';

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/80 overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={headClass}>Role</TableHead>
              <TableHead className={headClass}>Title</TableHead>
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
              <TableRow className="bg-gold-50/70 hover:bg-gold-50/90 border-l-2 border-l-gold-500">
                <TableCell>
                  <Badge variant="default">Main</Badge>
                </TableCell>
                <TableCell className="font-medium">{mainVariant.title || 'Main variant'}</TableCell>
                {optionTypes.map(type => {
                  const selected = variantToOptionPayload(mainVariant, optionTypes);
                  return (
                    <TableCell key={type.name} className="text-muted-foreground text-sm">
                      {selected[type.name] || '—'}
                    </TableCell>
                  );
                })}
                <TableCell>
                  <code className="text-xs">{mainVariant.sku || mco}</code>
                </TableCell>
                <TableCell>
                  {editingMainPrice ? (
                    <Input
                      value={mainPrice}
                      onChange={e => setMainPrice(e.target.value)}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={saving}
                      className="h-8 w-28"
                    />
                  ) : (
                    mainVariant.price != null && mainVariant.price !== '' ? mainVariant.price : '—'
                  )}
                </TableCell>
                <TableCell className="text-right sticky right-0 bg-gold-50/70 shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.06)]">
                  <div className="flex justify-end gap-1 flex-wrap">
                  {editingMainPrice ? (
                    <>
                      <Button size="sm" onClick={saveMainPrice} disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingMainPrice(false)}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={startEditMainPrice}
                      disabled={editingId != null}
                      aria-label="Edit main variant price"
                    >
                      <Pencil size={14} />
                    </Button>
                  )}
                  </div>
                </TableCell>
              </TableRow>
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
                    <TableCell className="text-muted-foreground text-xs">{v.title || '—'}</TableCell>
                    <SubVariantFormRow
                      optionTypes={optionTypes}
                      mco={mco}
                      existingSkus={existingSkus}
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
              const selected = variantToOptionPayload(v, optionTypes);
              return (
                <TableRow key={v.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      Sub
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{v.title || 'Variant'}</TableCell>
                  {optionTypes.map(type => (
                    <TableCell key={type.name} className="text-muted-foreground">
                      {selected[type.name] || '—'}
                    </TableCell>
                  ))}
                  <TableCell>
                    {v.sku ? <code className="text-xs">{v.sku}</code> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{v.price != null && v.price !== '' ? v.price : '—'}</TableCell>
                  <TableCell className="text-right sticky right-0 bg-card shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.06)]">
                    <div className="flex justify-end gap-1">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => startEditSub(v)}
                      disabled={editingId != null || !optionTypes.length}
                      aria-label="Edit sub-variant"
                    >
                      <Pencil size={14} />
                    </Button>
                    {canDeleteSub ? (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(v)}
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

            {editingId === 'new' && form ? (
              <TableRow className="bg-muted/25">
                <TableCell>
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Sub
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm italic">New sub-variant</TableCell>
                <SubVariantFormRow
                  optionTypes={optionTypes}
                  mco={mco}
                  existingSkus={existingSkus}
                  form={form}
                  onChange={setForm}
                  disabled={saving}
                />
                <TableCell className="text-right sticky right-0 bg-muted/25">
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
            ) : null}
          </TableBody>
        </Table>
        </div>
      </div>

      {rowError ? (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="size-4" />
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={startNewSub}
          disabled={editingId != null || !optionTypes.length}
        >
          <Plus size={14} className="mr-1" />
          Add sub-variant
        </Button>

        {!optionTypes.length ? (
          <p className="text-xs text-muted-foreground">
            Configure variant types above before adding sub-variants.
          </p>
        ) : null}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete variant?</DialogTitle>
            <DialogDescription>
              Remove {deleteTarget?.title || deleteTarget?.sku || 'this variant'} from Shopify. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
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
