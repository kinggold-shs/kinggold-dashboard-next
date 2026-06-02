'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { fetchVariantGroups, lookupShopifyProduct, saveVariantGroups } from '../../lib/shopifyItemWorkflow';

function emptyGroup() {
  return { mainVariantId: '', mainSku: '', subVariantIds: [], subSkus: [] };
}

function variantLabel(v) {
  const sku = v.sku ? ` (${v.sku})` : '';
  return `${v.title || 'Variant'}${sku}`;
}

function variantOptions(v) {
  return [v.option1, v.option2, v.option3].filter(Boolean).join(' / ');
}

function ShopifyVariantsList({ variants }) {
  if (variants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No variants on this product in Shopify yet.
      </p>
    );
  }

  return (
    <div className="border rounded-lg divide-y bg-muted/10">
      {variants.map(v => (
        <div key={v.id} className="px-4 py-3 text-sm space-y-1">
          <div className="font-medium">{v.title || 'Variant'}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            {v.sku ? (
              <span>
                SKU: <code className="text-foreground">{v.sku}</code>
              </span>
            ) : (
              <span>No SKU</span>
            )}
            {variantOptions(v) ? <span>Options: {variantOptions(v)}</span> : null}
            <span>Shopify variant ID: {v.id}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VariantGroupsEditor({ item }) {
  const [productId, setProductId] = useState(null);
  const [variants, setVariants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const lookup = await lookupShopifyProduct(item);
      if (!lookup.found || !lookup.productId) {
        setProductId(null);
        setVariants([]);
        setGroups([]);
        return;
      }
      setProductId(lookup.productId);
      const data = await fetchVariantGroups(lookup.productId);
      setVariants(data.variants || []);
      setGroups(
        (data.variantCodeGroups?.groups || []).map(g => ({
          mainVariantId: String(g.mainVariantId || ''),
          mainSku: g.mainSku || '',
          subVariantIds: (g.subVariantIds || []).map(String),
          subSkus: g.subSkus || [],
        })),
      );
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

  const updateGroup = (index, patch) => {
    setGroups(prev => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  };

  const setMainVariant = (index, variantId) => {
    const v = variantMap.get(String(variantId));
    updateGroup(index, {
      mainVariantId: variantId,
      mainSku: v?.sku || '',
      subVariantIds: [],
      subSkus: [],
    });
  };

  const toggleSubVariant = (index, variantId) => {
    setGroups(prev => prev.map((g, i) => {
      if (i !== index) return g;
      const id = String(variantId);
      const has = g.subVariantIds.includes(id);
      const subVariantIds = has
        ? g.subVariantIds.filter(x => x !== id)
        : [...g.subVariantIds, id];
      const subSkus = subVariantIds.map(sid => variantMap.get(sid)?.sku || '');
      return { ...g, subVariantIds, subSkus };
    }));
  };

  const addGroup = () => setGroups(prev => [...prev, emptyGroup()]);
  const removeGroup = (index) => setGroups(prev => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!productId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        groups: groups.map(g => ({
          mainVariantId: Number(g.mainVariantId),
          mainSku: g.mainSku || variantMap.get(String(g.mainVariantId))?.sku || '',
          subVariantIds: g.subVariantIds.map(Number),
          subSkus: g.subVariantIds.map(sid => variantMap.get(String(sid))?.sku || ''),
        })),
      };
      await saveVariantGroups(productId, payload);
      setSuccess('Variant groups saved to Shopify.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

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
        Publish this item to Shopify first to configure main/sub variant codes.
      </p>
    );
  }

  const canEditGroups = variants.length >= 2;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Shopify variants ({variants.length})</p>
        <ShopifyVariantsList variants={variants} />
      </div>

      {!canEditGroups && variants.length === 1 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-md px-3 py-2">
          Main/sub grouping needs at least two variants. Add another variant in Shopify to configure
          groups; the variant above is already synced from Shopify.
        </p>
      ) : null}

      {!canEditGroups ? null : (
        <>
      <p className="text-sm text-muted-foreground">
        Map a main variant code to one or more sub codes. Saved to metafield{' '}
        <code className="text-xs">custom.variant_code_groups</code>.
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No groups yet. Add a group to define main → sub mapping.</p>
      ) : null}

      {groups.map((group, index) => {
        const mainId = String(group.mainVariantId || '');
        const subsPreview = group.subVariantIds
          .map(id => variantMap.get(String(id))?.sku || id)
          .join(', ');
        const subCandidates = variants.filter(v => String(v.id) !== mainId);

        return (
          <div key={`group-${index}`} className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium flex items-center gap-1">
                <Layers size={14} />
                Group {index + 1}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeGroup(index)}>
                <Trash2 size={14} className="mr-1" />
                Remove
              </Button>
            </div>

            <label className="block text-sm">
              <span className="text-muted-foreground">Main code</span>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={mainId}
                onChange={e => setMainVariant(index, e.target.value)}
              >
                <option value="">Select main variant…</option>
                {variants.map(v => (
                  <option key={v.id} value={String(v.id)}>{variantLabel(v)}</option>
                ))}
              </select>
            </label>

            {mainId ? (
              <div>
                <span className="text-sm text-muted-foreground">Sub codes</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subCandidates.map(v => {
                    const checked = group.subVariantIds.includes(String(v.id));
                    return (
                      <label
                        key={v.id}
                        className={`inline-flex items-center gap-2 text-xs border rounded-md px-2 py-1 cursor-pointer ${checked ? 'border-primary bg-primary/5' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSubVariant(index, v.id)}
                        />
                        {variantLabel(v)}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Preview: <code>{group.mainSku || variantMap.get(mainId)?.sku || mainId}</code>
                  {' → '}
                  [{subsPreview || 'none selected'}]
                </p>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addGroup}>
          <Plus size={14} className="mr-1" />
          Add group
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
          Save groups
        </Button>
      </div>

        </>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}
    </div>
  );
}
