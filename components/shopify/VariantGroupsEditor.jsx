'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { fetchVariantGroups, lookupShopifyProduct } from '../../lib/shopifyItemWorkflow';

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

export default function VariantGroupsEditor({ item }) {
  const [productId, setProductId] = useState(null);
  const [variants, setVariants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
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
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Shopify variants ({variants.length})</p>
        <ShopifyVariantsList variants={variants} />
      </div>

      {!showGroupsSection && variants.length === 1 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-md px-3 py-2">
          Main/sub grouping applies when a product has at least two variants in Shopify.
        </p>
      ) : null}

      {showGroupsSection ? (
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
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
