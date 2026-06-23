import { NextResponse } from 'next/server';
import { getPublicApiBaseUrl } from '../../../../lib/publicEnv';
import { applyFn6Price18k } from '../../../../lib/fn6Price18k';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Cache-Control': 'public, max-age=30',
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

/**
 * GET — returns the live 18K gold price per gram and USD→EGP rate.
 *
 * Fetches a reference SKU from Gweb by-mco (any kinggold item works — all
 * items return the same gold_price and dollar at a given moment, since they
 * come from gp.objects.last() and Fc2 respectively). The 18K price is
 * derived as gold_21 × 6/7.
 *
 * Cached 30s. Polled by the theme every 60s for instant updates.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const refSku = searchParams.get('sku')?.trim();
  const base = getPublicApiBaseUrl();

  if (!refSku) {
    return json({ error: 'sku query param required (reference SKU)' }, 400);
  }

  try {
    const res = await fetch(
      `${base}/Sup/api/fn6/by-mco/${encodeURIComponent(refSku)}/`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      return json({ error: `Gweb fetch failed: ${res.status}` }, 502);
    }
    const item = await res.json();
    applyFn6Price18k(item);

    const gold21 = Number(item?.gold_price) * (7 / 6); // reverse 18K → 21K gram price
    const usdRate = Number(item?.dollar) || 1;
    const gold18 = gold21 * (6 / 7);

    if (!Number.isFinite(gold21) || gold21 <= 0) {
      return json({ error: 'Invalid gold price from Gweb' }, 502);
    }

    return json({
      gold_21: Math.round(gold21 * 100) / 100,
      gold_18: Math.round(gold18 * 100) / 100,
      usd_rate: usdRate,
      updated_at: item?.updated_at || new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: err.message || 'Internal error' }, 500);
  }
}
