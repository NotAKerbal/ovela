import { handler } from '@/lib/auth-server';

export const POST = handler.POST;
export async function GET(request: Request) {
  const response = await handler.GET(request);
  // The Next.js-to-Convex fetch hop makes Better Auth encode redirects as
  // JSON. Restore HTTP navigation for the OAuth authorization endpoint.
  if (new URL(request.url).pathname === '/api/auth/oauth2/authorize' && response.status === 200 && response.headers.get('content-type')?.includes('application/json')) {
    const result = await response.clone().json();
    if (result.redirect === true && typeof result.url === 'string') {
      const headers = new Headers(response.headers);
      headers.delete('content-type');
      headers.delete('content-length');
      headers.set('location', result.url);
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 302, headers });
    }
  }
  return response;
}
