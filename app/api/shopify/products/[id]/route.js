import { NextResponse } from 'next/server';
import { getShopifyToken } from '../../../../../lib/shopify';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { token, domain } = await getShopifyToken();

    const update = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.body_html !== undefined) update.body_html = body.body_html;
    if (body.product_type !== undefined) update.product_type = body.product_type;
    if (body.status !== undefined) update.status = body.status;
    if (body.images !== undefined) {
      update.images = body.images;
    }
    if (body.vendor !== undefined) update.vendor = body.vendor;
    if (body.tags !== undefined) update.tags = body.tags;

    const res = await fetch(`https://${domain}/admin/api/2024-10/products/${id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ product: update }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.errors || 'Shopify API error');
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    if (body.price !== undefined && body.variant_id != null) {
      const variantId = Number(body.variant_id);
      const price = String(Number(body.price).toFixed(2));
      const variantRes = await fetch(
        `https://${domain}/admin/api/2024-10/variants/${variantId}.json`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
          body: JSON.stringify({ variant: { id: variantId, price } }),
        },
      );
      const variantData = await variantRes.json().catch(() => ({}));
      if (!variantRes.ok) {
        const errMsg = typeof variantData.errors === 'object'
          ? JSON.stringify(variantData.errors)
          : (variantData.errors || 'Failed to update variant price on Shopify');
        return NextResponse.json(
          { error: `Product updated but main variant price failed: ${errMsg}` },
          { status: 502 },
        );
      }
    }

    if (body.collectionIds !== undefined) {
      try {
        const desired = new Set(
          (Array.isArray(body.collectionIds) ? body.collectionIds : [])
            .map(Number)
            .filter(Boolean),
        );

        const customRes = await fetch(
          `https://${domain}/admin/api/2024-10/custom_collections.json?limit=250`,
          { headers: { 'X-Shopify-Access-Token': token } },
        );
        const customData = await customRes.json().catch(() => ({}));
        if (!customRes.ok) {
          const errMsg = typeof customData.errors === 'object'
            ? JSON.stringify(customData.errors)
            : (customData.errors || 'Failed to load custom collections');
          throw new Error(errMsg);
        }
        const editableCustomIds = new Set(
          (customData.custom_collections || []).map(c => Number(c.id)),
        );

        const collectsRes = await fetch(
          `https://${domain}/admin/api/2024-10/collects.json?product_id=${id}`,
          { headers: { 'X-Shopify-Access-Token': token } },
        );
        const collectsData = await collectsRes.json().catch(() => ({}));
        if (!collectsRes.ok) {
          const errMsg = typeof collectsData.errors === 'object'
            ? JSON.stringify(collectsData.errors)
            : (collectsData.errors || 'Failed to load product collections');
          throw new Error(errMsg);
        }

        const existing = collectsData.collects || [];
        const existingCollectionIds = new Set(existing.map(c => Number(c.collection_id)));

        for (const collect of existing) {
          const cid = Number(collect.collection_id);
          if (editableCustomIds.has(cid) && !desired.has(cid)) {
            const delRes = await fetch(
              `https://${domain}/admin/api/2024-10/collects/${collect.id}.json`,
              {
                method: 'DELETE',
                headers: { 'X-Shopify-Access-Token': token },
              },
            );
            if (!delRes.ok) {
              const delData = await delRes.json().catch(() => ({}));
              const errMsg = typeof delData.errors === 'object'
                ? JSON.stringify(delData.errors)
                : (delData.errors || `HTTP ${delRes.status}`);
              throw new Error(`Failed to remove collection ${cid}: ${errMsg}`);
            }
          }
        }

        for (const cid of desired) {
          if (!editableCustomIds.has(cid)) continue;
          if (!existingCollectionIds.has(cid)) {
            const addRes = await fetch(`https://${domain}/admin/api/2024-10/collects.json`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': token,
              },
              body: JSON.stringify({
                collect: { product_id: Number(id), collection_id: cid },
              }),
            });
            if (!addRes.ok) {
              const addData = await addRes.json().catch(() => ({}));
              const errMsg = typeof addData.errors === 'object'
                ? JSON.stringify(addData.errors)
                : (addData.errors || `HTTP ${addRes.status}`);
              throw new Error(`Failed to add collection ${cid}: ${errMsg}`);
            }
          }
        }
      } catch (collectErr) {
        return NextResponse.json(
          { error: `Product updated but collection sync failed: ${collectErr.message}` },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({ product: data.product });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { token, domain } = await getShopifyToken();

    const res = await fetch(`https://${domain}/admin/api/2024-10/products/${id}.json`, {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.errors || 'Shopify API error' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
