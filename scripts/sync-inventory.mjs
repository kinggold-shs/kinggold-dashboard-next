import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const GWEB_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://kinggoldretail.e-jewelry-softwarehouse.com';
const API_VERSION = '2024-10';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const THROTTLE_MS = 500;
const PROGRESS_EVERY = 10;

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function vlog(msg) {
  if (VERBOSE) process.stdout.write(`${msg}\n`);
}

function assertEnv() {
  const missing = [];
  if (!DOMAIN) missing.push('SHOPIFY_STORE_DOMAIN');
  if (!CLIENT_ID) missing.push('SHOPIFY_CLIENT_ID');
  if (!CLIENT_SECRET) missing.push('SHOPIFY_CLIENT_SECRET');
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}. Run with: node --env-file=.env.local scripts/sync-inventory.mjs`);
  }
}

async function getToken() {
  const res = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

function adminFetch(token, path, init = {}) {
  return fetch(`https://${DOMAIN}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function graphql(token, query, variables) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  if (json.data?.userErrors?.length) throw new Error(`UserErrors: ${JSON.stringify(json.data.userErrors)}`);
  return json.data;
}

function parseLinkPageInfo(linkHeader, rel) {
  if (!linkHeader) return null;
  const re = new RegExp(`<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="${rel}"`);
  const m = linkHeader.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchAllVariantInventory(token) {
  const variants = [];
  let pageInfo = null;
  let pages = 0;
  do {
    const url = pageInfo
      ? `/products.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : `/products.json?limit=250`;
    const res = await adminFetch(token, url);
    if (!res.ok) throw new Error(`products.json: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const link = res.headers.get('Link') || '';
    pageInfo = parseLinkPageInfo(link, 'next');
    for (const p of data.products || []) {
      for (const v of p.variants || []) {
        if (!v.sku) continue;
        variants.push({
          variantId: v.id,
          sku: v.sku,
          productTitle: p.title,
          currentQty: v.inventory_quantity == null ? null : Number(v.inventory_quantity),
          tracked: v.inventory_management === 'shopify',
        });
      }
    }
    pages += 1;
  } while (pageInfo);
  log(`  fetched ${variants.length} variants in ${pages} page(s)`);
  return variants;
}

async function fetchPrimaryLocation(token) {
  const data = await graphql(token, `
    query PrimaryLocation {
      locations(first: 5) {
        edges { node { id name isActive } }
      }
    }
  `);
  const edges = data?.locations?.edges || [];
  const active = edges.find((e) => e.node?.isActive)?.node
    || edges[0]?.node
    || null;
  if (!active?.id) throw new Error('No Shopify location found. Add one in Admin → Settings → Locations.');
  return active;
}

async function fetchGwebQty(sku) {
  const url = `${GWEB_BASE}/Sup/api/fn6/by-mco/${encodeURIComponent(sku)}/`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gweb ${res.status}`);
  const data = await res.json();
  const raw = data?.qt ?? data?.quantity ?? data?.item?.qt;
  const qty = Number(raw);
  return Number.isFinite(qty) ? qty : null;
}

async function ensureTracked(token, inventoryItemId, currentlyTracked) {
  if (currentlyTracked) return;
  await graphql(token, `
    mutation SetTracked($id: ID!) {
      inventoryItemUpdate(id: $id, input: { tracked: true }) {
        inventoryItem { id tracked }
        userErrors { field message }
      }
    }
  `, { id: inventoryItemId });
}

async function setOnHand(token, inventoryItemId, locationId, quantity) {
  await graphql(token, `
    mutation SetOnHand($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) {
        userErrors { field message }
      }
    }
  `, {
    input: {
      reason: 'correction',
      setQuantities: [{ inventoryItemId, locationId, quantity }],
    },
  });
}

async function fetchInventoryItemIdForVariant(token, variantGid) {
  const data = await graphql(token, `
    query VariantInvItem($id: ID!) {
      productVariant(id: $id) {
        inventoryItem { id tracked }
      }
    }
  `, { id: variantGid });
  return data?.productVariant?.inventoryItem || null;
}

function variantGid(id) {
  const s = String(id).trim();
  return s.startsWith('gid://') ? s : `gid://shopify/ProductVariant/${s}`;
}

async function main() {
  assertEnv();
  log(`[sync-inventory] domain=${DOMAIN} gweb=${GWEB_BASE} dryRun=${DRY_RUN}`);

  const token = await getToken();
  log(`[sync-inventory] token acquired`);

  const location = await fetchPrimaryLocation(token);
  log(`[sync-inventory] primary location: ${location.name || location.id}`);

  const variants = await fetchAllVariantInventory(token);
  if (variants.length === 0) {
    log('[sync-inventory] no variants with SKU found. Exiting.');
    return;
  }

  const summary = {
    total: variants.length,
    unchanged: 0,
    updated: 0,
    notInGweb: 0,
    enableTracking: 0,
    errors: [],
  };

  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    const label = `[${i + 1}/${variants.length}] ${v.sku}`;
    try {
      const qt = await fetchGwebQty(v.sku);
      if (qt == null) {
        summary.notInGweb += 1;
        vlog(`  ${label} not in gweb — skip`);
        if (i % PROGRESS_EVERY === 0) log(`  progress ${i + 1}/${variants.length} (skipped ${summary.notInGweb} not in gweb)`);
        await sleep(THROTTLE_MS);
        continue;
      }
      const desired = qt > 0 ? 1 : 0;

      if (v.tracked && v.currentQty === desired) {
        summary.unchanged += 1;
        vlog(`  ${label} qt=${qt} → qty=${desired} (unchanged)`);
        if (i % PROGRESS_EVERY === 0) log(`  progress ${i + 1}/${variants.length} (unchanged so far: ${summary.unchanged})`);
        await sleep(THROTTLE_MS);
        continue;
      }

      if (DRY_RUN) {
        const wouldTrack = v.tracked ? 'tracked' : 'will-enable-tracking';
        log(`  ${label} DRY-RUN qt=${qt} desired=${desired} current=${v.currentQty} ${wouldTrack}`);
        summary.updated += 1;
        if (!v.tracked) summary.enableTracking += 1;
        continue;
      }

      const invItem = v.tracked
        ? null
        : await fetchInventoryItemIdForVariant(token, variantGid(v.variantId));

      if (!v.tracked) {
        if (!invItem?.id) {
          summary.errors.push({ sku: v.sku, error: 'inventoryItem id not found' });
          log(`  ${label} ERROR: no inventoryItem`);
          await sleep(THROTTLE_MS);
          continue;
        }
        await ensureTracked(token, invItem.id, false);
        summary.enableTracking += 1;
        if (!invItem.tracked) {
          summary.errors.push({ sku: v.sku, error: 'failed to enable tracking' });
          log(`  ${label} ERROR: failed to enable tracking`);
          await sleep(THROTTLE_MS);
          continue;
        }
      }

      const finalInvItemId = invItem?.id || null;
      if (!finalInvItemId) {
        summary.errors.push({ sku: v.sku, error: 'no inventoryItem id (untracked variant without prior lookup)' });
        log(`  ${label} ERROR: no inventoryItem id`);
        await sleep(THROTTLE_MS);
        continue;
      }

      await setOnHand(token, finalInvItemId, location.id, desired);
      summary.updated += 1;
      log(`  ${label} qt=${qt} → qty=${desired} (was ${v.currentQty})${v.tracked ? '' : ' +tracking'}`);
      if (i % PROGRESS_EVERY === 0 && i > 0) {
        log(`  ---- progress ${i + 1}/${variants.length} (updated: ${summary.updated}, unchanged: ${summary.unchanged}, errors: ${summary.errors.length}) ----`);
      }
      await sleep(THROTTLE_MS);
    } catch (e) {
      summary.errors.push({ sku: v.sku, error: e.message || String(e) });
      log(`  ${label} ERROR: ${e.message || e}`);
      await sleep(THROTTLE_MS);
    }
  }

  log('');
  log('=== SUMMARY ===');
  log(`total:        ${summary.total}`);
  log(`updated:      ${summary.updated}`);
  log(`  (tracking enabled on ${summary.enableTracking})`);
  log(`unchanged:    ${summary.unchanged}`);
  log(`not in gweb:  ${summary.notInGweb}`);
  log(`errors:       ${summary.errors.length}`);
  if (summary.errors.length) {
    for (const e of summary.errors.slice(0, 20)) {
      log(`  ${e.sku}: ${e.error}`);
    }
    if (summary.errors.length > 20) log(`  ... and ${summary.errors.length - 20} more`);
  }
  if (DRY_RUN) log('(DRY RUN — no changes written)');
}

main().catch((e) => {
  log(`[sync-inventory] FATAL: ${e.message || e}`);
  process.exit(1);
});
