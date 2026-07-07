import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { fetchFn6ByMco } from '../../../../lib/fn6Server';
import { getSoldPriceForSku } from '../../../../lib/soldPriceLookup';
import { findShopifyProduct } from '../../../../lib/shopifyProductLookup';
import { fetchCodeChainsMetafield } from '../../../../lib/codeChainService';
import { isSkuSold, hasPriorSale } from '../../../../lib/soldDetection';

const API_VERSION = '2024-10';

function normalizeQt(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function findVariantAcrossPage(products, sku) {
  const needle = String(sku || '').trim();
  if (!needle) return null;
  for (const product of products || []) {
    for (const variant of product.variants || []) {
      if (String(variant.sku || '').trim() === needle) {
        return { productId: product.id != null ? Number(product.id) : null };
      }
    }
  }
  return null;
}

async function findProductIdBySkuRest(domain, token, sku) {
  const url = `https://${domain}/admin/api/${API_VERSION}/products.json?fields=id,variants.sku&limit=250`;
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return findVariantAcrossPage(data.products, sku)?.productId ?? null;
}

function isSkuInChains(chains, sku) {
  const needle = String(sku || '').trim();
  if (!needle) return false;
  for (const chain of chains || []) {
    const soldCodes = Array.isArray(chain?.soldCodes) ? chain.soldCodes : [];
    if (soldCodes.some(code => String(code || '').trim() === needle)) return true;
    const codes = Array.isArray(chain?.codes) ? chain.codes : [];
    const activeIndex = Number(chain?.activeIndex) || 0;
    for (let i = 0; i < activeIndex && i < codes.length; i += 1) {
      if (String(codes[i] || '').trim() === needle) return true;
    }
  }
  return false;
}

/** GET ?sku=<sku> — compound sold verdict (Gweb qt + prior sale + chain soldCodes). */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = (searchParams.get('sku') ?? '').trim();
    if (!sku) {
      return NextResponse.json({ error: 'sku is required' }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();

    // Gweb stock signal
    let gwebQt = null;
    try {
      const { item } = await fetchFn6ByMco(sku);
      gwebQt = normalizeQt(item?.qt ?? item?.quantity ?? item?.item?.qt);
    } catch {
      gwebQt = null;
    }

    // Past sale record from Shopify order snapshots
    const soldResult = await getSoldPriceForSku(domain, token, sku);
    const soldSnapshot = soldResult?.found ? soldResult : null;

    // Find the SKU's product (try GraphQL first, fall back to 1-page REST scan)
    let productId = null;
    try {
      const found = await findShopifyProduct(domain, token, { sku });
      if (found?.productId != null) productId = Number(found.productId);
    } catch {
      productId = null;
    }
    if (productId == null) {
      productId = await findProductIdBySkuRest(domain, token, sku);
    }

    // Sold-codes check
    let chains = [];
    if (productId != null) {
      try {
        const { payload } = await fetchCodeChainsMetafield(domain, token, productId);
        chains = Array.isArray(payload?.chains) ? payload.chains : [];
      } catch {
        chains = [];
      }
    }
    const hasSoldCode = isSkuInChains(chains, sku);

    const isInSoldCodes = hasSoldCode;
    const sold = isSkuSold({ gwebQt, soldSnapshot, isInSoldCodes });

    return NextResponse.json(
      {
        sold,
        sku,
        gwebQt,
        hasPriorSale: hasPriorSale(soldSnapshot, isInSoldCodes),
        hasSoldCode,
        soldSnapshot,
        shopifyProductId: productId,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        sold: false,
        error: err?.message || 'Internal error',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
