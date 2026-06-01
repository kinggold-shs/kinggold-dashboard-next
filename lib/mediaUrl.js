const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

/**
 * Resolve Django media URLs for browser use (absolute + HTTPS on production dashboard).
 */
export function resolveMediaUrl(url) {
  if (!url) return null;
  let resolved = url;
  if (resolved.startsWith('/')) {
    resolved = `${API_BASE}${resolved}`;
  } else if (!/^https?:\/\//i.test(resolved)) {
    resolved = `${API_BASE}/${resolved.replace(/^\//, '')}`;
  }
  try {
    const parsed = new URL(resolved);
    if (parsed.protocol === 'http:' && typeof window !== 'undefined' && window.location?.protocol === 'https:') {
      parsed.protocol = 'https:';
      resolved = parsed.toString();
    } else if (parsed.protocol === 'http:' && API_BASE.startsWith('https://')) {
      parsed.protocol = 'https:';
      resolved = parsed.toString();
    }
  } catch {
    // keep resolved as-is
  }
  return resolved;
}

export function resolveMediaUrls(urls) {
  return (urls || []).map(resolveMediaUrl).filter(Boolean);
}

/** VPS gold photo + uploaded images (deduped) for Shopify publish. */
export function getItemImageUrls(item) {
  const urls = [];
  const gold = resolveMediaUrl(item?.gold_photo_url);
  if (gold) urls.push(gold);
  for (const m of item?.media_files || []) {
    if (m.media_type === 'image' && m.url) {
      const u = resolveMediaUrl(m.url);
      if (u) urls.push(u);
    }
  }
  return [...new Set(urls)];
}
