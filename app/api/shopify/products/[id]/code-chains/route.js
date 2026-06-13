import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../../lib/shopify';
import {
  advanceChain,
  applyChainDefaults,
  enrichChainsForClient,
  enumerateChainOptionCombos,
  fetchCodeChainsMetafield,
  getActiveCode,
  mergeChainsWithScaffold,
  migrateSubVariantsToChains,
  parseCodeChains,
  processOrderLineForChains,
  saveCodeChainsMetafield,
  syncAllChainsToShopify,
  validateCodeChains,
} from '../../../../../../lib/codeChainService';
import { fetchFn6ByMco } from '../../../../../../lib/fn6Server';
import { fetchProductVariants } from '../../../../../../lib/variantGroupService';
import { filterCustomerOptionTypes, productOptionTypes } from '../../../../../../lib/variantModel';

async function loadProductContext(domain, token, productId) {
  const product = await fetchProductVariants(domain, token, productId);
  if (!product) {
    return { error: 'Product not found', status: 404 };
  }
  return { product };
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const productId = String(id).trim();
    if (!productId) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const mco = searchParams.get('mco') || '';

    const { token, domain } = await getShopifyToken();
    const ctx = await loadProductContext(domain, token, productId);
    if (ctx.error) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const optionTypes = productOptionTypes(ctx.product.options);
    const customerOptionTypes = filterCustomerOptionTypes(optionTypes);
    const scaffold = enumerateChainOptionCombos(customerOptionTypes, ctx.product.options);
    const { metafieldId, payload } = await fetchCodeChainsMetafield(domain, token, productId);
    let chains = mergeChainsWithScaffold(payload.chains, scaffold);
    chains = applyChainDefaults(chains, ctx.product.variants, ctx.product.options, mco);

    return NextResponse.json({
      productId,
      metafieldId,
      codeChains: {
        ...payload,
        chains: enrichChainsForClient(chains, ctx.product.variants, ctx.product.options, mco),
      },
      variants: ctx.product.variants,
      options: ctx.product.options,
      customerOptionTypes,
      productTitle: ctx.product.title,
      mco,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const productId = String(id).trim();
    if (!productId) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    const body = await request.json();
    const mco = String(body.mco || '').trim();
    const incoming = body.codeChains ?? body;
    let payload;
    try {
      payload = parseCodeChains(incoming);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const { token, domain } = await getShopifyToken();
    const ctx = await loadProductContext(domain, token, productId);
    if (ctx.error) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    payload.chains = applyChainDefaults(
      payload.chains || [],
      ctx.product.variants,
      ctx.product.options,
      mco,
    );
    payload.chains = payload.chains.filter(c => (c.codes || []).length > 0);

    const optionTypes = productOptionTypes(ctx.product.options);
    const customerOptionTypes = filterCustomerOptionTypes(optionTypes);
    const validationErrors = validateCodeChains(payload, customerOptionTypes);
    if (validationErrors.length) {
      return NextResponse.json({ error: validationErrors.join('; ') }, { status: 400 });
    }

    for (const chain of payload.chains) {
      for (const code of chain.codes || []) {
        const { item } = await fetchFn6ByMco(code);
        if (!item) {
          return NextResponse.json({ error: `FN6 code not found: ${code}` }, { status: 400 });
        }
      }
    }

    const { metafieldId } = await fetchCodeChainsMetafield(domain, token, productId);
    const saved = await saveCodeChainsMetafield(
      domain,
      token,
      productId,
      payload,
      metafieldId,
    );

    const syncResult = await syncAllChainsToShopify(
      domain,
      token,
      productId,
      saved,
      mco || getActiveCode(saved.chains?.[0]) || '',
    );

    return NextResponse.json({
      productId,
      codeChains: {
        ...saved,
        chains: enrichChainsForClient(
          syncResult.chains,
          syncResult.variants || ctx.product.variants,
          ctx.product.options,
          mco,
        ),
      },
      variants: syncResult.variants,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST — manual advance or migrate from sub-variants */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const productId = String(id).trim();
    const body = await request.json();
    const action = body.action || 'advance';
    const mco = String(body.mco || '').trim();
    const chainKey = String(body.chainKey || '').trim();

    const { token, domain } = await getShopifyToken();
    const ctx = await loadProductContext(domain, token, productId);
    if (ctx.error) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    if (action === 'migrate') {
      const optionTypes = productOptionTypes(ctx.product.options);
      const customerOptionTypes = filterCustomerOptionTypes(optionTypes);
      const migrated = migrateSubVariantsToChains(
        ctx.product.variants,
        mco,
        customerOptionTypes,
        ctx.product.options,
      );
      migrated.chains = applyChainDefaults(
        migrated.chains,
        ctx.product.variants,
        ctx.product.options,
        mco,
      );
      const { metafieldId } = await fetchCodeChainsMetafield(domain, token, productId);
      const saved = await saveCodeChainsMetafield(domain, token, productId, migrated, metafieldId);
      return NextResponse.json({
        codeChains: {
          ...saved,
          chains: enrichChainsForClient(
            saved.chains,
            ctx.product.variants,
            ctx.product.options,
            mco,
          ),
        },
      });
    }

    if (action === 'advance') {
      const { metafieldId, payload } = await fetchCodeChainsMetafield(domain, token, productId);
      const chain = (payload.chains || []).find(c => c.key === chainKey);
      if (!chain) {
        return NextResponse.json({ error: 'Chain not found' }, { status: 404 });
      }
      const active = getActiveCode(chain);
      if (!active) {
        return NextResponse.json({ error: 'Chain has no active code to advance' }, { status: 400 });
      }

      const advanced = advanceChain(chain, active);
      const nextChains = payload.chains.map(c => (c.key === chainKey ? advanced : c));
      const saved = await saveCodeChainsMetafield(
        domain,
        token,
        productId,
        { chains: nextChains },
        metafieldId,
      );
      const syncResult = await syncAllChainsToShopify(domain, token, productId, saved, mco);
      return NextResponse.json({
        soldCode: active,
        nextCode: getActiveCode(advanced),
        codeChains: {
          ...saved,
          chains: enrichChainsForClient(
            syncResult.chains,
            syncResult.variants || ctx.product.variants,
            ctx.product.options,
            mco,
          ),
        },
        variants: syncResult.variants,
      });
    }

    if (action === 'process_line') {
      const result = await processOrderLineForChains(
        domain,
        token,
        productId,
        body.sku,
        mco,
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
