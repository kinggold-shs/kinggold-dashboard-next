import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { getPublicApiBaseUrl } from '../../../../lib/publicEnv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METAFIELDS_SET_MUTATION = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key namespace value }
      userErrors { field message }
    }
  }
`;

const API_VERSION = '2024-10';

export async function GET() {
  let token, domain;
  try {
    const creds = await getShopifyToken();
    token = creds.token;
    domain = creds.domain;
  } catch (err) {
    return NextResponse.json({ error: 'Shopify credentials not configured' }, { status: 500 });
  }

  const base = getPublicApiBaseUrl();

  let pr18, usdRate, updatedAt;
  try {
    const rateRes = await fetch(`${base}/Sup/api/gold-rate/`, { cache: 'no-store' });
    if (!rateRes.ok) throw new Error(`Gold-rate fetch failed: ${rateRes.status}`);
    const data = await rateRes.json();
    pr18 = Number(data.pr18);
    usdRate = Number(data.dollar) || 1;
    updatedAt = data.updated_at || new Date().toISOString();
    if (!Number.isFinite(pr18) || pr18 <= 0) throw new Error('Invalid pr18 value');
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  try {
    const gqlRes = await fetch(
      `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({
          query: METAFIELDS_SET_MUTATION,
          variables: {
            metafields: [
              {
                ownerType: 'SHOP',
                namespace: 'custom',
                key: 'gweb_pr18',
                type: 'number_decimal',
                value: String(pr18),
              },
              {
                ownerType: 'SHOP',
                namespace: 'custom',
                key: 'gweb_usd_rate',
                type: 'number_decimal',
                value: String(usdRate),
              },
            ],
          },
        }),
      },
    );
    const result = await gqlRes.json();
    const errors = result?.data?.metafieldsSet?.userErrors;
    if (errors?.length) {
      return NextResponse.json({ error: errors[0].message }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pr18, usd_rate: usdRate, updated_at: updatedAt });
}
