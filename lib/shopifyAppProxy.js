import crypto from 'crypto';

/**
 * Verify Shopify App Proxy query signature (HMAC-SHA256).
 * @see https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
 * @param {Record<string, string | string[] | undefined>} query
 * @param {string} clientSecret
 */
export function verifyAppProxySignature(query, clientSecret) {
  if (!clientSecret || !query || typeof query !== 'object') {
    return false;
  }

  const signature = query.signature;
  if (!signature || typeof signature !== 'string') {
    return false;
  }

  const params = { ...query };
  delete params.signature;

  const sorted = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      const v = Array.isArray(value) ? value.join(',') : String(value ?? '');
      return `${key}=${v}`;
    })
    .join('');

  const digest = crypto
    .createHmac('sha256', clientSecret)
    .update(sorted)
    .digest('hex');

  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}
