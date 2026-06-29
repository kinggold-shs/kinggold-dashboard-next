import { NextResponse } from 'next/server';
import { getPublicApiBaseUrl } from '../../../../lib/publicEnv';

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
 * GET — returns the live 18K + 21K gold price per gram and USD→EGP rate.
 *
 * Fetches the gold-rate endpoint from Gweb which provides pr18, pr21,
 * and dollar (USD→EGP rate) directly.
 *
 * Cached 30s. Polled by the theme every 60s for instant updates.
 */
export async function GET() {
  const base = getPublicApiBaseUrl();

  try {
    const res = await fetch(
      `${base}/Sup/api/gold-rate/`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      return json({ error: `Gold-rate fetch failed: ${res.status}` }, 502);
    }
    const data = await res.json();

    const pr18 = Number(data.pr18);
    const pr21 = Number(data.pr21);
    const usdRate = Number(data.dollar) || 1;

    if (!Number.isFinite(pr18) || pr18 <= 0) {
      return json({ error: 'Invalid 18K gold price from Gweb' }, 502);
    }
    if (!Number.isFinite(pr21) || pr21 <= 0) {
      return json({ error: 'Invalid 21K gold price from Gweb' }, 502);
    }

    return json({
      pr18: Math.round(pr18 * 100) / 100,
      pr21: Math.round(pr21 * 100) / 100,
      usd_rate: usdRate,
      updated_at: data.updated_at || new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: err.message || 'Internal error' }, 500);
  }
}
