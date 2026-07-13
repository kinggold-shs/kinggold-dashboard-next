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
      // all | paid | pending | voided. Defaults to 'all' so no order is hidden
      // and the order numbers run with no gaps.
      status: searchParams.get('status') || 'all',
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
