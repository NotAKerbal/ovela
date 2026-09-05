import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { query, token, setAuth } = vi.hoisted(() => ({ query: vi.fn(), token: vi.fn(), setAuth: vi.fn() }));
vi.mock('convex/browser', () => ({ ConvexHttpClient: class { query = query; setAuth = setAuth; } }));
vi.mock('@/convex/_generated/api', () => ({ api: { profile: { identity: 'profile:identity' } } }));
vi.mock('@/lib/auth-server', () => ({ getToken: token }));
import { GET, OPTIONS } from '../app/api/profile/route';
import { GET as image } from '../app/api/profile-image/[id]/route';
beforeEach(() => {
  vi.resetAllMocks();
  token.mockResolvedValue('test-session-token');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:3000');
  vi.stubEnv('IMMICH_URL', 'http://127.0.0.1:2283');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (origin: string) => new Request('http://127.0.0.1:3000/api/profile', { headers: { origin } });
describe('Ovela photo profile bridge', () => {
  it('allows the configured Photos origin and returns only the authenticated profile', async () => {
    query.mockResolvedValue({ subject: 'own-user', name: 'Isaac', picture: null });
    const response = await GET(request('http://127.0.0.1:2283'));
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:2283');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ subject: 'own-user', name: 'Isaac', picture: null });
    expect(query.mock.calls[0][1]).toEqual({});
    expect(setAuth).toHaveBeenCalledWith('test-session-token');
  });
  it('rejects other origins before querying and requires an active session', async () => {
    expect((await GET(request('https://unrelated.example'))).status).toBe(403);
    expect((await OPTIONS(request('https://unrelated.example'))).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue(null);
    expect((await GET(request('http://127.0.0.1:2283'))).status).toBe(401);
  });
  it('proxies only opaque storage IDs and image content from the configured backend', async () => {
    vi.stubEnv('CONVEX_INTERNAL_URL', 'http://backend:3210');
    const fetchMock = vi.fn().mockResolvedValue(new Response('image', { headers: { 'content-type': 'image/webp' } }));
    vi.stubGlobal('fetch', fetchMock);
    const call = (id: string) => image(new Request('http://home/api/profile-image/test'), { params: Promise.resolve({ id }) });
    expect((await call('../../secrets')).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await call('12345678-abcd-1234-abcd-123456789abc')).status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend:3210/api/storage/12345678-abcd-1234-abcd-123456789abc');
    fetchMock.mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    expect((await call('12345678-abcd-1234-abcd-123456789abc')).status).toBe(404);
  });
});
