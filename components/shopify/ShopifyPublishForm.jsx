'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ImageIcon, Loader2, ShoppingBag, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { fn6Quantity, formatFn6Weight, shopifyInventoryPayloadFromGwebQty } from '../../lib/fn6ItemFields';
import { formatGwebWeightDisplay } from '../../lib/gwebWeightMetafield';
import { buildDefaultDescription, buildDefaultSpec, splitBodyHtml } from '../../lib/fn6Spec';
import { getItemImageUrls } from '../../lib/mediaUrl';
import {
  addShopifyProductImage,
  buildPublishPayload,
  fetchShopifyCollections,
  lookupShopifyProduct,
  publishShopifyItem,
  removeShopifyItem,
  removeShopifyProductImage,
  updateShopifyItem,
} from '../../lib/shopifyItemWorkflow';
import ProductOrganization from './ProductOrganization';

function urlPathKey(url) {
  if (!url) return '';
  try {
    const p = new URL(url).pathname;
    return p.split('/').filter(Boolean).pop() || p;
  } catch {
    return String(url).split('/').pop() || String(url);
  }
}

function mediaUrlOnShopify(src, shopifyImages) {
  const key = urlPathKey(src);
  if (!key) return false;
  return shopifyImages.some(img => urlPathKey(img.url) === key || img.url === src);
}

export default function ShopifyPublishForm({
  item,
  mediaBusy,
  onShopifyImagesChange,
  onMediaChange,
  onShopifyListingUpdated,
}) {
  const [title, setTitle] = useState(item.idis || `Gold Item ${item.mco}`);
  const [productType, setProductType] = useState('Ring');
  const [vendor, setVendor] = useState('KingGold');
  const [tags, setTags] = useState([]);
  const [collectionsAvailable, setCollectionsAvailable] = useState([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);
  const [hydratedCollections, setHydratedCollections] = useState(null);
  const [status, setStatus] = useState('active');
  const [description, setDescription] = useState(() => buildDefaultDescription(item));
  const [spec, setSpec] = useState(() => buildDefaultSpec(item));
  const [replaceImages, setReplaceImages] = useState(false);

  const [shopifyLoading, setShopifyLoading] = useState(true);
  const [productId, setProductId] = useState(null);
  const [variantId, setVariantId] = useState(null);
  const [shopUrl, setShopUrl] = useState(null);
  const [shopifyImages, setShopifyImages] = useState([]);

  const [saving, setSaving] = useState(false);
  const [pubError, setPubError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageActionBusy, setImageActionBusy] = useState(false);
  const [confirmDeleteImageId, setConfirmDeleteImageId] = useState(null);

  const itemPrice = useMemo(() => {
    if (item.price == null || item.price === '') return '';
    return String(Math.round(Number(item.price) / 5) * 5);
  }, [item.price]);

  const itemWeightLabel = useMemo(
    () => formatGwebWeightDisplay(item.go_cr) || formatFn6Weight(item),
    [item.go_cr, item],
  );

  const imageUrls = useMemo(() => getItemImageUrls(item), [item]);
  const mediaImageCount = imageUrls.length;
  const shopifyImageCount = shopifyImages.length;
  const isListed = Boolean(productId);
  const mediaNotOnShopify = useMemo(
    () => imageUrls.filter(src => !mediaUrlOnShopify(src, shopifyImages)),
    [imageUrls, shopifyImages],
  );
  const busy = saving || deleting || mediaBusy || imageActionBusy;

  const resetToNotListed = useCallback(() => {
    setProductId(null);
    setVariantId(null);
    setShopUrl(null);
    setShopifyImages([]);
    onShopifyImagesChange?.(0);
    setTitle(item.idis || `Gold Item ${item.mco}`);
    setProductType('Ring');
    setVendor('KingGold');
    setTags([]);
    setSelectedCollectionIds([]);
    setHydratedCollections(null);
    setStatus('active');
    setDescription(buildDefaultDescription(item));
    setSpec(buildDefaultSpec(item));
    setReplaceImages(getItemImageUrls(item).length > 0);
    setConfirmDeleteImageId(null);
  }, [item, onShopifyImagesChange]);

  const loadShopify = useCallback(async () => {
    setShopifyLoading(true);
    setPubError('');
    try {
      const data = await lookupShopifyProduct(item);
      if (data.found) {
        const images = data.images || [];
        setProductId(data.productId);
        setVariantId(data.variantId);
        setTitle(data.title || item.idis || `Gold Item ${item.mco}`);
        setProductType(data.product_type || 'Ring');
        setVendor(data.vendor || 'KingGold');
        setTags(Array.isArray(data.tags) ? data.tags : []);
        setSelectedCollectionIds([]);
        setHydratedCollections(data.collections || []);
        setStatus(data.status || 'active');
        const split = splitBodyHtml(data.body_html, item);
        setDescription(split.description);
        setSpec(split.spec);
        setShopUrl(data.shopUrl);
        setShopifyImages(images);
        onShopifyImagesChange?.(images.length);
        const vpsCount = getItemImageUrls(item).length;
        setReplaceImages(vpsCount > 0 && images.length > 0 ? true : vpsCount > 0);
      } else {
        resetToNotListed();
      }
    } catch (err) {
      setPubError(err.message || 'Could not load Shopify status');
    } finally {
      setShopifyLoading(false);
    }
  }, [item, onShopifyImagesChange, resetToNotListed]);

  useEffect(() => {
    loadShopify();
  }, [loadShopify]);

  useEffect(() => {
    fetchShopifyCollections()
      .then(data => setCollectionsAvailable(data.collections || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (hydratedCollections === null || collectionsAvailable.length === 0) return;
    const customIds = new Set(collectionsAvailable.map(c => Number(c.id)));
    setSelectedCollectionIds(
      hydratedCollections
        .map(c => Number(c.id))
        .filter(id => customIds.has(id)),
    );
  }, [hydratedCollections, collectionsAvailable]);

  useEffect(() => {
    if (mediaImageCount > 0 && shopifyImageCount === 0) {
      setReplaceImages(true);
    }
  }, [mediaImageCount, shopifyImageCount]);

  const handlePublish = async () => {
    setSaving(true);
    setPubError('');
    setSuccessMsg('');
    try {
      const payload = {
        ...buildPublishPayload({
          title,
          description,
          spec,
          productType,
          price: itemPrice,
          status,
          sku: item.mco,
          imageUrls,
          vendor,
          tags,
          collectionIds: selectedCollectionIds,
        }),
        ...shopifyInventoryPayloadFromGwebQty(fn6Quantity(item)),
      };
      const data = await publishShopifyItem(payload);
      setSuccessMsg('Published to Shopify');
      setShopUrl(data.shopUrl || null);
      await loadShopify();
      onShopifyListingUpdated?.();
    } catch (err) {
      setPubError(err.message || 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!productId) return;
    setSaving(true);
    setPubError('');
    setSuccessMsg('');
    try {
      const payload = buildPublishPayload({
        title,
        description,
        spec,
        productType,
        price: itemPrice,
        status,
        sku: item.mco,
        imageUrls,
        vendor,
        tags,
        collectionIds: selectedCollectionIds,
      });
      await updateShopifyItem(productId, {
        title: payload.title,
        body_html: payload.body_html,
        product_type: payload.product_type,
        vendor: payload.vendor,
        tags: payload.tags,
        collectionIds: payload.collectionIds,
        price: payload.price,
        status: payload.status,
        variant_id: variantId,
        ...(replaceImages ? { images: payload.images } : {}),
      });
      setSuccessMsg('Shopify product updated');
      await loadShopify();
      onShopifyListingUpdated?.();
    } catch (err) {
      setPubError(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    setDeleting(true);
    setPubError('');
    setSuccessMsg('');
    try {
      await removeShopifyItem(productId);
      resetToNotListed();
      setSuccessMsg('Removed from Shopify');
      setConfirmDelete(false);
      await loadShopify();
      onShopifyListingUpdated?.();
    } catch (err) {
      setPubError(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteShopifyImage = async (imageId) => {
    if (!productId || !imageId) return;
    if (!window.confirm('Remove this image from the Shopify product?')) return;
    setImageActionBusy(true);
    setPubError('');
    setSuccessMsg('');
    try {
      await removeShopifyProductImage(productId, imageId);
      setConfirmDeleteImageId(null);
      setSuccessMsg('Shopify image removed');
      await loadShopify();
      onMediaChange?.();
    } catch (err) {
      setPubError(err.message || 'Failed to delete image');
    } finally {
      setImageActionBusy(false);
    }
  };

  const handleAddFromMedia = async () => {
    if (!productId || mediaNotOnShopify.length === 0) return;
    setImageActionBusy(true);
    setPubError('');
    setSuccessMsg('');
    try {
      for (const src of mediaNotOnShopify) {
        await addShopifyProductImage(productId, src);
      }
      setSuccessMsg(
        mediaNotOnShopify.length === 1
          ? 'Added 1 image from Media'
          : `Added ${mediaNotOnShopify.length} images from Media`,
      );
      await loadShopify();
      onMediaChange?.();
    } catch (err) {
      setPubError(err.message || 'Failed to add images');
    } finally {
      setImageActionBusy(false);
    }
  };

  return (
    <div className="shopify-form">
      <div className="shopify-form-header">
        <ShoppingBag size={15} />
        <span>Publish to Shopify</span>
        {shopifyLoading ? (
          <span className="shopify-form-status-pill loading">
            <Loader2 size={11} className="animate-spin" /> Checking…
          </span>
        ) : isListed ? (
          <span className={`shopify-form-status-pill ${status === 'active' ? 'active' : 'draft'}`}>
            {status}
          </span>
        ) : (
          <span className="shopify-form-status-pill draft">Not listed</span>
        )}
      </div>
      <div className="shopify-form-body">
        {isListed && shopifyImageCount > 0 && (
          <div className="shopify-images-preview">
            <span className="text-xs text-muted-foreground font-medium">Shopify photos ({shopifyImageCount})</span>
            <div className="media-preview-row">
              {shopifyImages.map(img => (
                <div key={img.id || img.url} className="media-thumb media-thumb-new" title="Shopify image">
                  <img src={img.url} alt="" />
                  {img.id && (
                    confirmDeleteImageId === img.id ? (
                      <div className="media-thumb-confirm">
                        <button
                          type="button"
                          className="text-[10px] text-white underline"
                          onClick={() => handleDeleteShopifyImage(img.id)}
                          disabled={imageActionBusy}
                        >
                          {imageActionBusy ? '…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          className="text-[10px] text-white/80 underline"
                          onClick={() => setConfirmDeleteImageId(null)}
                          disabled={imageActionBusy}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="media-thumb-remove"
                        onClick={() => setConfirmDeleteImageId(img.id)}
                        aria-label="Delete"
                        title="Delete"
                        disabled={imageActionBusy}
                      >
                        <X size={10} />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
            {mediaImageCount > 0 && mediaNotOnShopify.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-8 text-xs"
                onClick={handleAddFromMedia}
                disabled={busy}
              >
                {imageActionBusy
                  ? <><Loader2 size={12} className="animate-spin mr-1" />Adding…</>
                  : <>Upload from Media ({mediaNotOnShopify.length})</>
                }
              </Button>
            )}
          </div>
        )}
        {isListed && shopifyImageCount === 0 && mediaNotOnShopify.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleAddFromMedia}
            disabled={busy}
          >
            {imageActionBusy
              ? <><Loader2 size={12} className="animate-spin mr-1" />Adding…</>
              : <>Upload from Media ({mediaNotOnShopify.length})</>
            }
          </Button>
        )}
        {isListed && mediaImageCount > 0 && (
          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={replaceImages}
              onChange={e => setReplaceImages(e.target.checked)}
              className="rounded mt-0.5"
            />
            <span>
              Replace all Shopify photos with Media on update ({mediaImageCount} VPS image{mediaImageCount !== 1 ? 's' : ''})
            </span>
          </label>
        )}
        {shopifyLoading ? (
          <div className="media-used-note">
            <Loader2 size={12} className="animate-spin shrink-0" />
            <span>Checking images on Shopify…</span>
          </div>
        ) : mediaImageCount > 0 ? (
          <div className="media-used-note">
            <ImageIcon size={12} />
            <span>
              {mediaImageCount} image{mediaImageCount !== 1 ? 's' : ''} from Media
              {isListed && replaceImages ? ' will replace Shopify images on update' : ' will be attached on publish'}
            </span>
          </div>
        ) : shopifyImageCount > 0 ? (
          <div className="media-used-note">
            <ImageIcon size={12} />
            <span>
              {shopifyImageCount} image{shopifyImageCount !== 1 ? 's' : ''} on Shopify
              {isListed ? ' — delete individually above, add from Media, or use replace-all on update' : ''}
            </span>
          </div>
        ) : (
          <div className="media-used-note text-amber-700">
            <AlertCircle size={12} />
            <span>No images — publish/update without photos</span>
          </div>
        )}
        <div className="form-row">
          <label className="form-label">Product Name</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Product title" />
        </div>
        <ProductOrganization
          productType={productType}
          onProductTypeChange={setProductType}
          vendor={vendor}
          onVendorChange={setVendor}
          tags={tags}
          onTagsChange={setTags}
          collectionsAvailable={collectionsAvailable}
          selectedCollectionIds={selectedCollectionIds}
          onSelectedCollectionIdsChange={setSelectedCollectionIds}
        />
        <div className="form-row">
          <label className="form-label">Price (EGP)</label>
          <Input
            type="text"
            value={itemPrice}
            readOnly
            disabled
            placeholder="—"
            className="bg-muted/50 cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Price is set automatically from the live gold price.
          </p>
        </div>
        <div className="form-row">
          <label className="form-label">Weight (GWEB)</label>
          <Input
            type="text"
            value={itemWeightLabel}
            readOnly
            disabled
            placeholder="—"
            className="bg-muted/50 cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Weight is stored on the Shopify variant as custom.gweb_weight (not a customer option).
          </p>
        </div>
        {isListed && (
          <div className="form-row">
            <label className="form-label">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="form-select">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        )}
        <p className="text-xs text-muted-foreground -mt-1">
          Description and Spec are combined on the Shopify product page.
        </p>
        <div className="form-row">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="form-label mb-0">Description</label>
            <button
              type="button"
              className="text-xs text-gold-600 hover:underline"
              onClick={() => setDescription(buildDefaultDescription(item))}
            >
              Reset from item
            </button>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="form-textarea text-sm"
            rows={4}
            placeholder="Product marketing copy…"
          />
        </div>
        <div className="form-row">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="form-label mb-0">Spec</label>
            <button
              type="button"
              className="text-xs text-gold-600 hover:underline"
              onClick={() => setSpec(buildDefaultSpec(item))}
            >
              Reset spec from item
            </button>
          </div>
          <textarea
            value={spec}
            onChange={e => setSpec(e.target.value)}
            className="form-textarea font-mono text-xs"
            rows={8}
            placeholder="Gold price, weight, karat, SKU…"
          />
        </div>
        {shopUrl && (
          <p className="text-xs">
            <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-gold-600 underline">
              View on Shopify
            </a>
          </p>
        )}
        {successMsg && (
          <div className="pub-success">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {pubError && (
          <div className="pub-error">
            <AlertCircle size={14} className="shrink-0" />
            <span>{pubError}</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {isListed ? (
            <>
              <Button onClick={handleUpdate} disabled={busy || !title.trim() || !itemPrice} className="w-full">
                {saving
                  ? <><Loader2 size={14} className="animate-spin mr-2" />Updating…</>
                  : <><ShoppingBag size={14} className="mr-2" />Update on Shopify</>
                }
              </Button>
              {confirmDelete ? (
                <div className="flex gap-2">
                  <Button onClick={handleDelete} disabled={deleting} variant="destructive" className="flex-1">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm remove'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setConfirmDelete(true)} disabled={busy} variant="outline" className="w-full text-destructive">
                  <Trash2 size={14} className="mr-2" />Remove from Shopify
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handlePublish} disabled={busy || !title.trim() || !itemPrice} className="w-full">
              {saving
                ? <><Loader2 size={14} className="animate-spin mr-2" />Publishing…</>
                : <><ShoppingBag size={14} className="mr-2" />Publish to Shopify</>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
