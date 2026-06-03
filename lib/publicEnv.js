const DEFAULT_API_BASE = 'http://127.0.0.1:8080';

/** NEXT_PUBLIC_* may be set but empty after `vercel env pull`; treat as unset. */
export function getPublicApiBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return (trimmed || DEFAULT_API_BASE).replace(/\/$/, '');
}
