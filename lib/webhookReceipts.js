import { getShopifyToken } from './shopify.js';

const NAMESPACE = 'kinggold';
const KEY = 'webhook_receipts';
const MAX_ENTRIES = 25;

async function getShopifyMetafieldJson(domain, token, namespace, key) {
  const url = `https://${domain}/admin/api/2024-10/metafields.json?namespace=${namespace}&key=${key}&owner_resource=shop`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const mf = data.metafields?.[0];
  if (!mf) return null;
  try { return JSON.parse(mf.value); } catch { return null; }
}

async function setShopifyMetafieldJson(domain, token, namespace, key, value) {
  const url = `https://${domain}/admin/api/2024-10/metafields.json`;
  const body = JSON.stringify({
    metafield: { namespace, key, value: JSON.stringify(value), type: 'json', owner_resource: 'shop' },
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body,
  });
  return res.ok;
}

export async function recordWebhookReceipt(entry) {
  const { token, domain } = await getShopifyToken();
  const current = (await getShopifyMetafieldJson(domain, token, NAMESPACE, KEY)) ?? [];
  const updated = [{ ...entry, at: entry.at ?? new Date().toISOString() }, ...current].slice(0, MAX_ENTRIES);
  await setShopifyMetafieldJson(domain, token, NAMESPACE, KEY, updated);
}

export async function readWebhookReceipts() {
  const { token, domain } = await getShopifyToken();
  return (await getShopifyMetafieldJson(domain, token, NAMESPACE, KEY)) ?? [];
}
