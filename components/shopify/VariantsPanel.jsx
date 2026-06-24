'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info, Loader2, Tags } from 'lucide-react';
import {
  fetchVariantGroups,
  lookupShopifyProduct,
  saveVariantGroups,
} from '../../lib/shopifyItemWorkflow';
import {
  buildMetafieldGroups,
  findMainVariant,
  mergeOptionTypesCatalog,
  productOptionTypes,
} from '../../lib/variantModel';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import ShopifyVariantsEditor from './ShopifyVariantsEditor';
import CodeChainsEditor from './CodeChainsEditor';
import VariantTypesEditor from './VariantTypesEditor';

export default function VariantsPanel({ item }) {
  const [productId, setProductId] = useState(null);
  const [published, setPublished] = useState(false);
  const [variants, setVariants] = useState([]);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [variantTypesDirty, setVariantTypesDirty] = useState(false);
  const [draftOptionTypes, setDraftOptionTypes] = useState([]);

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
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const maxRetries = 4;
    try {
      let lookup, data;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          lookup = await lookupShopifyProduct(item);
          break;
        } catch (err) {
          if (attempt < maxRetries && /exceeded|rate.?limit|429/i.test(err.message || '')) {
            await sleep(1000 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }
      if (!lookup.found || !lookup.productId) {
        setProductId(null);
        setPublished(false);
        setVariants([]);
        setOptions([]);
        return;
      }
      setProductId(lookup.productId);
      setPublished(lookup.status !== 'draft');
      await sleep(600);
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          data = await fetchVariantGroups(lookup.productId);
          break;
        } catch (err) {
          if (attempt < maxRetries && /exceeded|rate.?limit|429/i.test(err.message || '')) {
            await sleep(1000 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }
      applyProductData(data);
      try {
        await sleep(600);
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

  const catalogOptionTypes = useMemo(
    () => mergeOptionTypesCatalog(optionTypes, draftOptionTypes),
    [optionTypes, draftOptionTypes],
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
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 py-10"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 size={22} className="animate-spin text-gold-600" />
        <p className="text-sm text-muted-foreground">Loading variants from Shopify…</p>
      </div>
    );
  }

  if (!productId) {
    return (
      <Alert variant="info" className="border-gold-200/60 bg-gold-50/40">
        <Info className="size-4 text-gold-600" />
        <AlertTitle>Not published yet</AlertTitle>
        <AlertDescription>
          Publish this item to Shopify first to manage variant types and sub-variants.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <section
        className="rounded-lg border border-border/80 bg-muted/5 p-4 sm:p-5"
        aria-label="Variant types"
      >
        <VariantTypesEditor
          productId={productId}
          mco={item.mco}
          optionTypes={optionTypes}
          disabled={!published}
          onSaved={load}
          onDirtyChange={setVariantTypesDirty}
          onDraftTypesChange={setDraftOptionTypes}
        />
      </section>

      <Separator />

      <section
        className="rounded-lg border border-border/80 bg-muted/5 p-4 sm:p-5"
        aria-label="Code chains"
      >
        <CodeChainsEditor
          productId={productId}
          mco={item.mco}
          disabled={!published || variantTypesDirty}
          onVariantsChanged={onRefresh}
        />
        {variantTypesDirty ? (
          <p className="text-xs text-amber-700 dark:text-amber-500 mt-3">
            Save variant types above before editing code chains.
          </p>
        ) : null}
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tags size={16} className="text-gold-600 shrink-0" />
            <h4 className="text-sm font-semibold text-foreground">Shopify variants</h4>
            <Badge variant="secondary">{variants.length}</Badge>
          </div>
          {subSkus.length > 0 ? (
            <p className="text-xs text-muted-foreground w-full sm:w-auto sm:text-right">
              Main <code className="rounded bg-muted px-1 py-0.5 text-gold-800">{item.mco}</code>
              {' → '}
              {subSkus.map((sku, i) => (
                <span key={sku}>
                  {i > 0 ? ', ' : ''}
                  <code className="rounded bg-muted px-1 py-0.5">{sku}</code>
                </span>
              ))}
            </p>
          ) : null}
        </div>

        {mainVariant && String(mainVariant.sku) !== String(item.mco) ? (
          <Alert variant="warning">
            <AlertCircle className="size-4" />
            <AlertTitle>Main variant SKU mismatch</AlertTitle>
            <AlertDescription>
              No variant with SKU <code className="font-mono text-xs">{item.mco}</code>; using the
              first variant as main. Set the main variant SKU to match the item code.
            </AlertDescription>
          </Alert>
        ) : null}

        <ShopifyVariantsEditor
          mco={item.mco}
          optionTypes={catalogOptionTypes}
          shopifyOptions={options}
          variantTypesDirty={variantTypesDirty}
          mainVariant={mainVariant}
          productId={productId}
          variants={variants}
          onRefresh={onRefresh}
          hideSubVariantActions
        />
      </section>

      {syncError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Metafield sync failed</AlertTitle>
          <AlertDescription>{syncError}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load variants</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
