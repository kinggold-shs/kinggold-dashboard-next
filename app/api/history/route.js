import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../lib/shopify';
import { listShopifyPurchaseHistory } from '../../../lib/shopifyOrderHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const { token, domain } = await getShopifyToken();
    const data = await listShopifyPurchaseHistory(domain, token, {
      page: searchParams.get('page') || 1,
      pageSize: searchParams.get('page_size') || 25,
      search: searchParams.get('search') || '',
      from: searchParams.get('from') || '',
      to: searchParams.get('to') || '',
      // 'pending' is used by the Payments page to list orders awaiting a
      // manual approve/decline; history keeps its existing paid-only default.
      status: searchParams.get('status') || 'paid',
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
