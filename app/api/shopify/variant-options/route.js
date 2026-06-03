import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../lib/shopify';
import { fetchVariantOptionSuggestions } from '../../../../lib/shopifyVariantTypes';

export async function GET() {
  try {
    const { token, domain } = await getShopifyToken();
    const options = await fetchVariantOptionSuggestions(domain, token);
    return NextResponse.json({ options });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
