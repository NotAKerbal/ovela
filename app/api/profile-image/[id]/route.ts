// Convex storage URLs are public capability URLs. Proxy only their opaque IDs
// so the same picture URL works in browsers and within the self-hosted network.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(id)) return new Response(null, { status: 404 });
  const backend = process.env.CONVEX_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!backend) return new Response(null, { status: 503 });
  try {
    const response = await fetch(`${backend.replace(/\/$/, '')}/api/storage/${encodeURIComponent(id)}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !type || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) return new Response(null, { status: 404 });
    return new Response(response.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
  } catch {
    return new Response(null, { status: 502 });
  }
}
