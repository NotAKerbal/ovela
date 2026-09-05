import { beforeEach, describe, expect, it, vi } from 'vitest';
const proxy = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/lib/auth-server', () => ({ handler: proxy }));
import { GET } from '../app/api/auth/[...all]/route';
beforeEach(() => vi.resetAllMocks());
describe('OAuth navigation through the Next.js proxy', () => {
  it('turns the provider redirect into navigation and preserves its cookies', async () => {
    proxy.GET.mockResolvedValue(new Response(JSON.stringify({ redirect: true, url: 'http://127.0.0.1:2283/auth/login?code=test' }), {
      headers: { 'content-type': 'application/json', 'content-length': '80', 'set-cookie': 'oauth=test; HttpOnly; SameSite=Lax' },
    }));
    const response = await GET(new Request('http://127.0.0.1:3000/api/auth/oauth2/authorize?client_id=immich'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:2283/auth/login?code=test');
    expect(response.headers.get('set-cookie')).toBe('oauth=test; HttpOnly; SameSite=Lax');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('content-length')).toBe(false);
  });
  it('leaves non-redirect authorization responses and other endpoints untouched', async () => {
    for (const [path, body] of [
      ['/oauth2/authorize', { error: 'access_denied' }],
      ['/get-session', { redirect: true, url: '/account' }],
    ] as const) {
      const upstream = Response.json(body);
      proxy.GET.mockResolvedValue(upstream);
      expect(await GET(new Request(`http://127.0.0.1:3000/api/auth${path}`))).toBe(upstream);
    }
  });
});
