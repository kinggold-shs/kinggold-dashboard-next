'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  fetchVariantGroups,
  lookupShopifyProduct,
  saveVariantGroups,
} from '../../lib/shopifyItemWorkflow';
import ShopifyVariantsEditor from './ShopifyVariantsEditor';

const UNSET = '__unset__';

function variantLabel(v) {
  const sku = v.sku ? ` (${v.sku})` : '';
  return `${v.title || 'Variant'}${sku}`;
}

function variantOptions(v) {
  if (Array.isArray(v.selectedOptions) && v.selectedOptions.length) {
    return v.selectedOptions
      .map(o => (o.name && o.value ? `${o.name}: ${o.value}` : o.value || o.name))
      .filter(Boolean)
      .join(' / ');
  }
  return [v.option1, v.option2, v.option3].filter(Boolean).join(' / ');
}

function mapGroupsFromApi(groups) {
  return (groups || []).map(g => ({
    mainVariantId: String(g.mainVariantId || ''),
    mainSku: g.mainSku || '',
    subVariantIds: (g.subVariantIds || []).map(String),
    subSkus: g.subSkus || [],
  }));
}

function buildUsedIdsAcrossDraft(draft) {
  const set = new Set();
  for (const g of draft) {
    if (g.mainVariantId) set.add(String(g.mainVariantId));
    for (const id of g.subVariantIds) {
      if (id) set.add(String(id));
    }
  }
  return set;
}

function validateDraft(draft) {
  if (draft.length === 0) return { ok: true };
  for (let i = 0; i < draft.length; i++) {
    const g = draft[i];
    if (!g.mainVariantId) {
      return { ok: false, message: `Group ${i + 1}: each group needs a main variant.` };
    }
    if (g.subVariantIds.length === 0) {
      return { ok: false, message: `Group ${i + 1}: at least one sub variant is required.` };
    }
    if (g.subVariantIds.some(id => !id)) {
      return { ok: false, message: 'Complete or remove empty sub-variant slots.' };
    }
  }
  return { ok: true };
}

function VariantSelect({ value, variants, placeholder, onChange, disabled }) {
  return (
    <Select
      value={value || UNSET}
      onValueChange={v => onChange(v === UNSET ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{placeholder}</SelectItem>
        {variants.map(v => (
          <SelectItem key={v.id} value={String(v.id)}>
            {variantLabel(v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function VariantGroupEditor({ group, index, variants, usedIdsAcrossDraft, onChange, onRemove }) {
  function availableForSlot(currentSlotId) {
    return variants.filter(v => {
      const id = String(v.id);
      if (id === String(currentSlotId)) return true;
      return !usedIdsAcrossDraft.has(id);
    });
  }

  function setMain(variantId) {
    const v = variants.find(x => String(x.id) === variantId);
    onChange({ ...group, mainVariantId: variantId, mainSku: v?.sku || '' });
  }

  function setSub(i, variantId) {
    const v = variants.find(x => String(x.id) === variantId);
    const newSubs = [...group.subVariantIds];
    const newSkus = [...group.subSkus];
    newSubs[i] = variantId;
    newSkus[i] = v?.sku || '';
    onChange({ ...group, subVariantIds: newSubs, subSkus: newSkus });
  }

  function addSub() {
    onChange({
      ...group,
      subVariantIds: [...group.subVariantIds, ''],
      subSkus: [...group.subSkus, ''],
    });
  }

  function removeSub(i) {
    onChange({
      ...group,
      subVariantIds: group.subVariantIds.filter((_, j) => j !== i),
      subSkus: group.subSkus.filter((_, j) => j !== i),
    });
  }

  const mainOptions = availableForSlot(group.mainVariantId);

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1">
          <Layers size={14} />
          Group {index + 1}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove group">
          <Trash2 size={14} className="text-destructive" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Main variant</Label>
        <VariantSelect
          value={group.mainVariantId}
          variants={mainOptions}
          placeholder="Select main variant"
          onChange={setMain}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Sub variants</Label>
        {group.subVariantIds.map((subId, i) => (
          <div key={`sub-${index}-${i}`} className="flex gap-2 items-center">
            <div className="flex-1">
              <VariantSelect
                value={subId}
                variants={availableForSlot(subId)}
                placeholder="Select sub variant"
                onChange={v => setSub(i, v)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeSub(i)}
              disabled={group.subVariantIds.length <= 1}
              aria-label="Remove sub variant"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addSub}>
          <Plus size={14} className="mr-1" />
          Add sub variant
        </Button>
      </div>
    </div>
  );
}

function VariantGroupReadOnly({ group, index, variantMap }) {
  const mainId = String(group.mainVariantId || '');
  const mainVariant = variantMap.get(mainId);
  const mainDisplay = group.mainSku || mainVariant?.sku || mainId || '—';
  const subs = group.subVariantIds.map((id, i) => {
    const sid = String(id);
    const sku = group.subSkus?.[i] || variantMap.get(sid)?.sku || sid;
    const v = variantMap.get(sid);
    return { id: sid, sku, label: v ? variantLabel(v) : sku };
  });

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
      <span className="text-sm font-medium flex items-center gap-1">
        <Layers size={14} />
        Group {index + 1}
      </span>

      <div className="text-sm space-y-2">
        <div>
          <span className="text-muted-foreground">Main code: </span>
          <code>{mainDisplay}</code>
          {mainVariant ? (
            <span className="text-xs text-muted-foreground ml-2">{variantLabel(mainVariant)}</span>
          ) : null}
        </div>
        <div>
          <span className="text-muted-foreground">Sub codes: </span>
          {subs.length === 0 ? (
            <span className="text-muted-foreground">none</span>
          ) : (
            <span>
              {subs.map((s, i) => (
                <span key={s.id}>
                  {i > 0 ? ', ' : null}
                  <code>{s.sku}</code>
                </span>
              ))}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <code>{mainDisplay}</code>
          {' → '}
          [{subs.length ? subs.map(s => s.sku).join(', ') : 'none'}]
        </p>
      </div>
    </div>
  );
}

const BLANK_GROUP = {
  mainVariantId: '',
  mainSku: '',
  subVariantIds: [''],
  subSkus: [''],
};

export default function VariantGroupsEditor({ item }) {
  const [productId, setProductId] = useState(null);
  const [variants, setVariants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [metafieldId, setMetafieldId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const lookup = await lookupShopifyProduct(item);
      if (!lookup.found || !lookup.productId) {
        setProductId(null);
        setVariants([]);
        setGroups([]);
        setMetafieldId(null);
        return;
      }
      setProductId(lookup.productId);
      const data = await fetchVariantGroups(lookup.productId);
      setMetafieldId(data.metafieldId ?? null);
      setVariants(data.variants || []);
      setGroups(mapGroupsFromApi(data.variantCodeGroups?.groups));
    } catch (err) {
      setError(err.message || 'Failed to load variant groups');
    } finally {
      setLoading(false);
    }
  }, [item]);

  useEffect(() => {
    load();
  }, [load]);

  const variantMap = useMemo(
    () => new Map(variants.map(v => [String(v.id), v])),
    [variants],
  );

  const usedIdsAcrossDraft = useMemo(
    () => (editing ? buildUsedIdsAcrossDraft(draft) : new Set()),
    [editing, draft],
  );

  function startEdit() {
    setDraft(groups.map(g => ({
      ...g,
      subVariantIds: [...g.subVariantIds],
      subSkus: [...g.subSkus],
    })));
    setSaveError('');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError('');
  }

  function updateDraftGroup(index, next) {
    setDraft(prev => prev.map((g, i) => (i === index ? next : g)));
  }

  function removeDraftGroup(index) {
    setDraft(prev => prev.filter((_, i) => i !== index));
  }

  function addDraftGroup() {
    setDraft(prev => [...prev, { ...BLANK_GROUP, subVariantIds: [''], subSkus: [''] }]);
  }

  async function handleSave() {
    const validation = validateDraft(draft);
    if (!validation.ok) {
      setSaveError(validation.message);
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await saveVariantGroups(productId, {
        groups: draft.map(g => ({
          mainVariantId: Number(g.mainVariantId),
          mainSku: g.mainSku,
          subVariantIds: g.subVariantIds.map(Number),
          subSkus: g.subSkus,
        })),
      });
      const data = await fetchVariantGroups(productId);
      setGroups(mapGroupsFromApi(data.variantCodeGroups?.groups));
      setMetafieldId(data.metafieldId ?? null);
      setVariants(data.variants || []);
      setEditing(false);
    } catch (err) {
      setSaveError(err.message || 'Failed to save variant groups');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 size={14} className="animate-spin" />
        Loading variant groups…
      </div>
    );
  }

  if (!productId) {
    return (
      <p className="text-sm text-muted-foreground">
        Publish this item to Shopify first to view variant groups.
      </p>
    );
  }

  const showGroupsSection = variants.length >= 2;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Shopify variants ({variants.length})</p>
        {!editing ? (
          <ShopifyVariantsEditor
            productId={productId}
            variants={variants}
            onRefresh={load}
          />
        ) : (
          <p className="text-xs text-muted-foreground border border-dashed rounded-md px-3 py-2">
            Save or cancel group edits to manage Shopify variants.
          </p>
        )}
      </div>

      {!showGroupsSection && variants.length === 1 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-md px-3 py-2">
          Main/sub grouping applies when a product has at least two variants in Shopify.
        </p>
      ) : null}

      {showGroupsSection ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Variant code groups</p>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={startEdit}>
                Edit groups
              </Button>
            ) : null}
          </div>

          {metafieldId ? (
            <p className="text-xs text-muted-foreground">Metafield ID: {metafieldId}</p>
          ) : null}

          {editing ? (
            <>
              {draft.length === 0 ? (
                <p className="text-sm text-muted-foreground">No groups yet. Add a group below.</p>
              ) : (
                draft.map((group, index) => (
                  <VariantGroupEditor
                    key={`edit-group-${index}`}
                    group={group}
                    index={index}
                    variants={variants}
                    usedIdsAcrossDraft={usedIdsAcrossDraft}
                    onChange={next => updateDraftGroup(index, next)}
                    onRemove={() => removeDraftGroup(index)}
                  />
                ))
              )}
              <Button type="button" variant="outline" size="sm" onClick={addDraftGroup}>
                <Plus size={14} className="mr-1" />
                Add group
              </Button>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1" />
                      Saving…
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </>
          ) : (
            <>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No variant groups configured in Shopify.
                </p>
              ) : (
                groups.map((group, index) => (
                  <VariantGroupReadOnly
                    key={`group-${index}-${group.mainVariantId}`}
                    group={group}
                    index={index}
                    variantMap={variantMap}
                  />
                ))
              )}
            </>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
