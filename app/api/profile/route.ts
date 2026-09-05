import { getToken } from '@/lib/auth-server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

function cors(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = [process.env.SITE_URL, process.env.IMMICH_URL].filter(Boolean).map(url => new URL(url!).origin);
  if (origin && !allowed.includes(origin)) return null;
  const headers = new Headers({ 'cache-control': 'no-store', vary: 'Origin' });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
  }
  return headers;
}

export async function GET(request: Request) {
  const headers = cors(request);
  if (!headers) return new Response(null, { status: 403 });
  try {
    const token = await getToken();
    if (!token) return Response.json({ error: 'Sign in to Ovela.' }, { status: 401, headers });
    const client = new ConvexHttpClient(process.env.CONVEX_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL!);
    client.setAuth(token);
    const profile = await client.query(api.profile.identity, {});
    if (!profile) return Response.json({ error: 'Sign in to Ovela.' }, { status: 401, headers });
    return Response.json(profile, { headers });
  } catch {
    return Response.json({ error: 'Profile unavailable.' }, { status: 503, headers });
  }
}

export async function OPTIONS(request: Request) {
  const headers = cors(request);
  if (!headers) return new Response(null, { status: 403 });
  headers.set('access-control-allow-methods', 'GET, OPTIONS');
  return new Response(null, { status: 204, headers });
}
