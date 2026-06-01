import { NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
  'kinggoldretail.e-jewelry-softwarehouse.com',
  '127.0.0.1',
  'localhost',
]);

function hostAllowed(url) {
  try {
    const host = new URL(url).hostname;
    if (ALLOWED_HOSTS.has(host)) return true;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    if (apiBase) {
      const apiHost = new URL(apiBase).hostname;
      return host === apiHost;
    }
  } catch {
    return false;
  }
  return false;
}

/** Proxy VPS media through Vercel (fixes HTTPS mixed content / broken img on scan page). */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('url');
    if (!raw) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    let target = raw;
    if (target.startsWith('/')) {
      const base = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
      target = `${base}${target}`;
    }

    if (!hostAllowed(target)) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
    }

    const upstream = await fetch(target, { next: { revalidate: 300 } });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Upstream fetch failed' }, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
