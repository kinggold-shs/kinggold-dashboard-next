'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  fetchVariantGroups,
  lookupShopifyProduct,
  saveVariantGroups,
} from '../../lib/shopifyItemWorkflow';
import {
  buildMetafieldGroups,
  findMainVariant,
  productOptionTypes,
} from '../../lib/variantModel';
import ShopifyVariantsEditor from './ShopifyVariantsEditor';
import VariantTypesEditor from './VariantTypesEditor';

export default function VariantsPanel({ item }) {
  const [productId, setProductId] = useState(null);
  const [published, setPublished] = useState(false);
  const [variants, setVariants] = useState([]);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');

  const syncMetafield = useCallback(async (pid, mco, freshVariants) => {
    const main = findMainVariant(freshVariants, mco);
    const subs = freshVariants.filter(v => !main || Number(v.id) !== Number(main.id));
    const payload = buildMetafieldGroups(main, subs);
    await saveVariantGroups(pid, payload);
  }, []);

  const applyProductData = useCallback((data) => {
    setVariants(data.variants || []);
    setOptions(data.options || []);
  }, []);

  const refreshFromShopify = useCallback(async (pid = productId) => {
    if (!pid) return null;
    const data = await fetchVariantGroups(pid);
    applyProductData(data);
    return data;
  }, [productId, applyProductData]);

  const onRefresh = useCallback(async () => {
    if (!productId) return null;
    const data = await refreshFromShopify(productId);
    try {
      if (data?.variants) {
        await syncMetafield(productId, item.mco, data.variants);
      }
      setSyncError('');
    } catch (err) {
      setSyncError(err.message || 'Failed to sync variant groups metafield');
    }
    return data;
  }, [productId, item.mco, refreshFromShopify, syncMetafield]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSyncError('');
    try {
      const lookup = await lookupShopifyProduct(item);
      if (!lookup.found || !lookup.productId) {
        setProductId(null);
        setPublished(false);
        setVariants([]);
        setOptions([]);
        return;
      }
      setProductId(lookup.productId);
      setPublished(lookup.status !== 'draft');
      const data = await fetchVariantGroups(lookup.productId);
      applyProductData(data);
      try {
        await syncMetafield(lookup.productId, item.mco, data.variants || []);
      } catch (syncErr) {
        setSyncError(syncErr.message || 'Failed to sync variant groups metafield');
      }
    } catch (err) {
      setError(err.message || 'Failed to load variants');
    } finally {
      setLoading(false);
    }
  }, [item, applyProductData, syncMetafield]);

  useEffect(() => {
    load();
  }, [load]);

  const mainVariant = useMemo(
    () => findMainVariant(variants, item.mco),
    [variants, item.mco],
  );

  const optionTypes = useMemo(
    () => productOptionTypes(options),
    [options],
  );

  const subSkus = useMemo(() => {
    if (!mainVariant) return [];
    return variants
      .filter(v => Number(v.id) !== Number(mainVariant.id))
      .map(v => v.sku)
      .filter(Boolean);
  }, [variants, mainVariant]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 size={14} className="animate-spin" />
        Loading variants…
      </div>
    );
  }

  if (!productId) {
    return (
      <p className="text-sm text-muted-foreground">
        Publish this item to Shopify first to manage variants.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <VariantTypesEditor
        productId={productId}
        mco={item.mco}
        optionTypes={optionTypes}
        disabled={!published}
        onSaved={load}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">Shopify variants ({variants.length})</p>
        {mainVariant && String(mainVariant.sku) !== String(item.mco) ? (
          <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-200/50 rounded-md px-3 py-2">
            No variant with SKU {item.mco}; using first variant as main. Set the main variant SKU to match the item code.
          </p>
        ) : null}
        <ShopifyVariantsEditor
          mco={item.mco}
          optionTypes={optionTypes}
          mainVariant={mainVariant}
          productId={productId}
          variants={variants}
          onRefresh={onRefresh}
        />
      </div>

      {subSkus.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Main: <code>{item.mco}</code>
          {' → '}
          subs:{' '}
          {subSkus.map((sku, i) => (
            <span key={sku}>
              {i > 0 ? ', ' : ''}
              <code>{sku}</code>
            </span>
          ))}
        </p>
      ) : null}

      {syncError ? <p className="text-sm text-destructive">{syncError}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
