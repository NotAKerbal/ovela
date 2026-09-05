/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { createAuth, authComponent, createAuthOptions } from '../convex/auth';
import authSchema from '../convex/betterAuth/schema';
import { components, internal } from '../convex/_generated/api';
const modules = import.meta.glob('../convex/**/*.ts');
const authModules = import.meta.glob('../convex/betterAuth/**/*.ts');
function backend() { const t = convexTest(schema, modules); t.registerComponent('betterAuth', authSchema, authModules); return t; }
afterEach(() => vi.unstubAllEnvs());
describe('Photos single sign-on', () => {
  it('requires the bundled Photos grant and checks suspension on every authorization', async () => {
    const t = backend();
    const { id, photos } = await t.run(async ctx => {
      const photos = await ctx.db.insert('applications', { name: 'Photos', description: '', url: '', icon: 'photos', color: '', ink: '', provider: 'immich' });
      const otherPhotos = await ctx.db.insert('applications', { name: 'Other photos', description: '', url: '', icon: 'photos', color: '', ink: '' });
      const id = await ctx.db.insert('people', { authId: 'member', name: 'Member', email: 'member@example.com', role: 'member', suspended: false, appIds: [otherPhotos] });
      return { id, photos };
    });
    expect(await t.query(internal.sso.canAccessPhotos, { authId: 'unknown' })).toBe(false);
    expect(await t.query(internal.sso.canAccessPhotos, { authId: 'member' })).toBe(false);
    await t.run(ctx => ctx.db.patch(id, { appIds: [photos] }));
    expect(await t.query(internal.sso.canAccessPhotos, { authId: 'member' })).toBe(true);
    await t.run(ctx => ctx.db.patch(id, { suspended: true }));
    expect(await t.query(internal.sso.canAccessPhotos, { authId: 'member' })).toBe(false);
    await t.run(ctx => ctx.db.patch(id, { role: 'admin', suspended: false, appIds: [] }));
    expect(await t.query(internal.sso.canAccessPhotos, { authId: 'member' })).toBe(true);
    expect(await t.query(internal.sso.photosRole, { authId: 'member' })).toBe('admin');
  });
  it('configures one confidential client and rotates its secret without duplicating it', async () => {
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:3000');
    vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
    vi.stubEnv('IMMICH_URL', 'http://127.0.0.1:2283');
    vi.stubEnv('OVELA_IMMICH_CLIENT_SECRET', 'test-secret-a');
    const t = backend();
    await t.mutation(internal.sso.configureImmich, {});
    const get = () => t.action(ctx => authComponent.adapter(ctx)(createAuthOptions(ctx)).findOne<Record<string, unknown>>({ model: 'oauthClient', where: [{ field: 'clientId', value: 'immich' }] }));
    const first = await get();
    expect(first).toMatchObject({ clientId: 'immich', public: false, skipConsent: true, requirePKCE: true, redirectUris: ['http://127.0.0.1:2283/auth/login', 'http://127.0.0.1:2283/user-settings', 'http://127.0.0.1:2283/api/oauth/mobile-redirect'] });
    expect(first?.clientSecret).not.toBe('test-secret-a');
    vi.stubEnv('OVELA_IMMICH_CLIENT_SECRET', 'test-secret-b');
    await t.mutation(internal.sso.configureImmich, {});
    const second = await get();
    expect(second?.id).toBe(first?.id);
    expect(second?.clientSecret).not.toBe(first?.clientSecret);
  });
});

it.each(['/auth/login', '/api/oauth/mobile-redirect'])('completes OIDC through %s and denies suspended accounts', async callback => {
  const redirectUri = `http://127.0.0.1:2283${callback}`;
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:3000');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-only-at-least-thirty-two-characters');
  vi.stubEnv('IMMICH_URL', 'http://127.0.0.1:2283');
  vi.stubEnv('OVELA_IMMICH_CLIENT_SECRET', 'test-confidential-immich-secret');
  vi.stubEnv('OVELA_SETUP_TOKEN', 'a'.repeat(64));
  const t = backend();
  const request = async (path: string, init?: RequestInit) => {
    const raw = await t.action(async ctx => {
      const response = await createAuth(ctx).handler(new Request(`http://127.0.0.1:3000/api/auth${path}`, init));
      return { status: response.status, headers: [...response.headers], body: await response.text() };
    });
    return new Response(raw.body, { status: raw.status, headers: raw.headers });
  };
  await t.mutation(internal.sso.configureImmich, {});
  const signup = await request('/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ovela-invite': 'a'.repeat(64), origin: 'http://127.0.0.1:3000' }, body: JSON.stringify({ name: 'Test Admin', email: 'admin@example.com', password: 'test-password-for-oidc' }) });
  expect(signup.status).toBe(200);
  const cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const convexToken = await request('/convex/token', { headers: { cookie } });
  expect(convexToken.status).toBe(200);
  const discovery = await request('/.well-known/openid-configuration');
  expect(await discovery.json()).toMatchObject({ issuer: 'http://127.0.0.1:3000/api/auth', id_token_signing_alg_values_supported: ['RS256'] });
  const verifier = 'a'.repeat(64);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const params = new URLSearchParams({ client_id: 'immich', redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state: 'test-state', code_challenge: challenge, code_challenge_method: 'S256', nonce: 'test-nonce' });
  const authorize = () => request(`/oauth2/authorize?${params}`, { headers: { cookie, accept: 'text/html' } });
  expect((await request(`/oauth2/authorize?${params}&resource=https://unrelated.example`, { headers: { cookie } })).status).toBe(400);
  expect((await request('/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', resource: 'https://unrelated.example' }) })).status).toBe(400);
  const authorization = await authorize();
  expect(authorization.status).toBe(302);
  const location = new URL(authorization.headers.get('location')!);
  expect(location.searchParams.get('error')).toBeNull();
  expect(`${location.origin}${location.pathname}`).toBe(redirectUri);
  const code = location.searchParams.get('code');
  expect(code).toBeTruthy();
  const token = await request('/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri, code_verifier: verifier, client_id: 'immich', client_secret: 'test-confidential-immich-secret' }) });
  const result = await token.json();
  expect(token.status, JSON.stringify(result)).toBe(200);
  const claims = JSON.parse(atob(result.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  expect(claims).toMatchObject({ iss: 'http://127.0.0.1:3000/api/auth', aud: 'immich', immich_role: 'admin', email: 'admin@example.com', email_verified: false, nonce: 'test-nonce' });
  expect(claims).not.toHaveProperty('enrollmentHash');
  const loggedOut = await request(`/oauth2/authorize?${params}`, { headers: { accept: 'text/html' } });
  const loginLocation = new URL(loggedOut.headers.get('location')!, 'http://127.0.0.1:3000');
  expect(loginLocation.pathname).toBe('/sign-in');
  const resumed = await request('/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'test-password-for-oidc', oauth_query: loginLocation.search.slice(1) }),
  });
  const resumedBody = await resumed.json();
  expect(resumedBody.redirect).toBe(true);
  expect(new URL(resumedBody.url).searchParams.get('code')).toBeTruthy();
  await t.run(async ctx => { const person = (await ctx.db.query('people').first())!; await ctx.db.patch(person._id, { suspended: true }); });
  expect((await authorize()).status).toBe(403);
  expect((await request('/oauth2/userinfo', { headers: { authorization: `Bearer ${result.access_token}` } })).status).toBe(403);
});
