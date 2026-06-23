import { NextResponse } from 'next/server';
import { getPublicApiBaseUrl } from '../../../../lib/publicEnv';
import { applyFn6Price18k, roundedFn6Price18k } from '../../../../lib/fn6Price18k';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Cache-Control': 'public, max-age=15',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const MAX_SKUS = 50;
const PER_SKU_TIMEOUT_MS = 2500;

/**
 * GET — batch 18K price lookup for the theme (collection pages, etc).
 *
 * ?skus=A,B,C (max 50) → for each, fetches by-mco from Gweb, applies 18K
 * transform, returns { [sku]: { price, weight, gold_18, prc, prcus } }.
 * Used as a fallback when variant metafields are missing on the storefront.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const skusParam = (searchParams.get('skus') || '').trim();
  if (!skusParam) {
    return json({ error: 'skus query param required' }, 400);
  }

  const skus = skusParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_SKUS);
  if (skus.length === 0) {
    return json({ error: 'no valid SKUs' }, 400);
  }

  const base = getPublicApiBaseUrl();
  const results = {};

  await Promise.all(skus.map(async (sku) => {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), PER_SKU_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(
          `${base}/Sup/api/fn6/by-mco/${encodeURIComponent(sku)}/`,
          { cache: 'no-store', signal: ac.signal },
        );
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        results[sku] = { found: false, error: `HTTP ${res.status}` };
        return;
      }
      const item = await res.json();
      applyFn6Price18k(item);
      results[sku] = {
        found: true,
        price: roundedFn6Price18k(item),
        weight: item?.go_cr != null ? `${Number(item.go_cr).toFixed(2)}g` : null,
        gold_18: item?.gold_price != null ? Math.round(Number(item.gold_price) * 100) / 100 : null,
        prc: item?.prc != null && item.prc !== '' ? Number(item.prc) : 0,
        prcus: item?.prcus != null && item.prcus !== '' ? Number(item.prcus) : 0,
      };
    } catch (e) {
      results[sku] = { found: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
    }
  }));

  return json({ prices: results, count: Object.keys(results).length });
}
