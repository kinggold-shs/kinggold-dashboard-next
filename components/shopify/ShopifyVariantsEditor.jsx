'use client';

import { useState } from 'react';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
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

const EMPTY_FORM = {
  sku: '',
  option1: '',
  option2: '',
  option3: '',
  price: '',
};

function variantFormFromVariant(v) {
  return {
    sku: v.sku || '',
    option1: v.option1 || '',
    option2: v.option2 || '',
    option3: v.option3 || '',
    price: v.price != null && v.price !== '' ? String(v.price) : '',
  };
}

function VariantFormCells({ form, onChange, disabled }) {
  return (
    <>
      <TableCell>
        <Input
          value={form.sku}
          onChange={e => onChange({ ...form, sku: e.target.value })}
          placeholder="SKU"
          disabled={disabled}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={form.option1}
          onChange={e => onChange({ ...form, option1: e.target.value })}
          placeholder="Option 1"
          disabled={disabled}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={form.option2}
          onChange={e => onChange({ ...form, option2: e.target.value })}
          placeholder="Option 2"
          disabled={disabled}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={form.option3}
          onChange={e => onChange({ ...form, option3: e.target.value })}
          placeholder="Option 3"
          disabled={disabled}
          className="h-8"
        />
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

export default function ShopifyVariantsEditor({ productId, variants, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const canDelete = variants.length > 1;

  function startEdit(variant) {
    setRowError('');
    setEditingId(variant.id);
    setForm(variantFormFromVariant(variant));
  }

  function startNew() {
    setRowError('');
    setEditingId('new');
    setForm({ ...EMPTY_FORM });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setRowError('');
  }

  async function handleSave() {
    setSaving(true);
    setRowError('');
    try {
      const payload = {
        sku: form.sku,
        option1: form.option1,
        option2: form.option2,
        option3: form.option3,
        price: form.price,
      };
      if (editingId === 'new') {
        await createShopifyVariant(productId, payload);
      } else {
        await updateShopifyVariant(productId, editingId, payload);
      }
      cancelEdit();
      await onRefresh();
    } catch (err) {
      setRowError(err.message || 'Failed to save variant');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setRowError('');
    try {
      await deleteShopifyVariant(productId, deleteTarget.id);
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) cancelEdit();
      await onRefresh();
    } catch (err) {
      setRowError(err.message || 'Failed to delete variant');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Option 1</TableHead>
              <TableHead>Option 2</TableHead>
              <TableHead>Option 3</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map(v => {
              const isEditing = editingId === v.id;
              if (isEditing) {
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-muted-foreground text-xs">{v.title || '—'}</TableCell>
                    <VariantFormCells form={form} onChange={setForm} disabled={saving} />
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.title || 'Variant'}</TableCell>
                  <TableCell>
                    {v.sku ? <code className="text-xs">{v.sku}</code> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{v.option1 || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{v.option2 || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{v.option3 || '—'}</TableCell>
                  <TableCell>{v.price != null && v.price !== '' ? v.price : '—'}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(v)}
                      disabled={editingId != null}
                    >
                      <Pencil size={14} />
                    </Button>
                    {canDelete ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(v)}
                        disabled={editingId != null}
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="inline-block">
                              <Button size="sm" variant="outline" disabled>
                                <Trash2 size={14} />
                              </Button>
                            </span>
                          }
                        />
                        <TooltipContent>Shopify requires at least one variant</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {editingId === 'new' ? (
              <TableRow>
                <TableCell className="text-muted-foreground text-xs">New variant</TableCell>
                <VariantFormCells form={form} onChange={setForm} disabled={saving} />
                <TableCell className="text-right space-x-1">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </Button>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {variants.length === 0 && editingId !== 'new' ? (
        <p className="text-sm text-muted-foreground">No variants on this product in Shopify yet.</p>
      ) : null}

      {rowError ? <p className="text-sm text-destructive">{rowError}</p> : null}

      <Button
        variant="outline"
        size="sm"
        onClick={startNew}
        disabled={editingId != null}
      >
        <Plus size={14} className="mr-1" />
        Add variant
      </Button>

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
