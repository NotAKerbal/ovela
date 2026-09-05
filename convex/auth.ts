import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { oauthProvider } from '@better-auth/oauth-provider';
import { jwt } from 'better-auth/plugins/jwt';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { components, internal } from './_generated/api';
import type { Doc, DataModel } from './_generated/dataModel';
import authConfig from './auth.config';
import authSchema from './betterAuth/schema';
import { hashToken } from './token';

const authFunctions: AuthFunctions = internal.auth;
export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema },
  authFunctions,
  triggers: { user: { onCreate: async (ctx, user) => {
    const email = user.email.trim().toLowerCase();
    const existing = await ctx.db.query('people').first();
    const enrollmentHash = user.enrollmentHash;
    if (!enrollmentHash) throw new Error('A valid invitation is required.');
    const invitation = existing
      ? await ctx.db.query('invitations').withIndex('by_token', q => q.eq('tokenHash', enrollmentHash)).unique()
      : null;
    // Revalidate the exact proof inside the user-creation transaction. An old
    // request must never consume a replacement invitation for the same email.
    if (existing && (!invitation || invitation.email !== email || invitation.consumed || invitation.revoked || invitation.expiresAt <= Date.now())) {
      throw new Error('A valid invitation is required.');
    }
    if (!existing && (!process.env.OVELA_SETUP_TOKEN || enrollmentHash !== hashToken(process.env.OVELA_SETUP_TOKEN))) {
      throw new Error('A valid setup key is required.');
    }
    if (!existing) {
      const defaults = [
        { name: 'Photos', description: 'Your memories, gathered.', icon: 'photos' as const, color: '#bcc5ac', ink: '#516348' },
        { name: 'Files', description: 'Everything in its place.', icon: 'files' as const, color: '#d8c6a5', ink: '#80633d' },
        { name: 'Media', description: 'Something good to watch.', icon: 'media' as const, color: '#aebfc6', ink: '#456575' },
        { name: 'Notes', description: 'Room for your ideas.', icon: 'notes' as const, color: '#d4b7a7', ink: '#875e4a' },
      ];
      const bundledPhotos = (await ctx.db.query('applications').collect()).some(app => app.provider === 'immich');
      for (const app of defaults) {
        if (app.icon === 'photos' && bundledPhotos) continue;
        await ctx.db.insert('applications', { ...app, url: '' });
      }
    }
    await ctx.db.insert('people', { authId: user._id, name: user.name, email, role: existing ? invitation!.role : 'admin', suspended: false, appIds: invitation?.appIds ?? [] });
    if (invitation) await ctx.db.patch(invitation._id, { consumed: true });
  } }, session: { onCreate: async (ctx, session) => {
    const person = await ctx.db.query('people').withIndex('by_auth', q => q.eq('authId', session.userId)).unique();
    if (!person || person.suspended) throw new Error('This account does not have access.');
  } } },
});
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  appName: 'Ovela', baseURL: process.env.SITE_URL, secret: process.env.BETTER_AUTH_SECRET,
  database: authComponent.adapter(ctx),
  emailAndPassword: { enabled: true, minPasswordLength: 12, autoSignIn: true },
  user: {
    changeEmail: { enabled: false },
    additionalFields: { enrollmentHash: { type: 'string', required: false, input: false, returned: false } },
  },
  databaseHooks: { user: { create: { before: async (user, request) => {
    const token = request?.headers?.get('x-ovela-invite') ?? '';
    if (token.length < 32 || token.length > 256) throw new APIError('FORBIDDEN', { message: 'This invitation is invalid or expired.' });
    return { data: { ...user, enrollmentHash: hashToken(token) } };
  } } } },
  session: { expiresIn: 60 * 60 * 24 * 7 },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 100, customRules: {
    // Reading file previews and saving documents each authenticate through this endpoint.
    '/convex/token': { window: 60, max: 600 },
    '/sign-in/email': { window: 60, max: 10 },
    '/sign-up/email': { window: 60, max: 5 },
  } },
  hooks: { before: createAuthMiddleware(async request => {
    // This package only issues identity tokens for Immich. Reject resource
    // indicators while OAuth Provider 1.6 has GHSA-p2fr-6hmx-4528.
    if (request.path?.startsWith('/oauth2/') && (
      request.body?.resource !== undefined || new URL(request.request?.url ?? 'http://localhost').searchParams.has('resource')
    )) throw new APIError('BAD_REQUEST', { error: 'invalid_target', error_description: 'Resource indicators are not supported.' });
    if (request.path === '/sign-up/email') {
      const allowed: boolean = await ctx.runQuery(internal.management.canRegister, { email: String(request.body?.email ?? ''), token: request.headers?.get('x-ovela-invite') ?? '' });
      if (!allowed) throw new APIError('FORBIDDEN', { message: 'This invitation is invalid or expired.' });
    }
  }) },
  // Identity and sessionId are supplied by the plugin. Keep enrollment proof
  // and other persisted user fields out of client-readable JWT claims.
  plugins: [convexSessionPlugin(), jwt({
    jwt: { issuer: `${process.env.SITE_URL}/api/auth`, definePayload: () => ({}) },
    jwks: { keyPairConfig: { alg: 'RS256' } },
    adapter: {
      getJwks: async () => {
        const keys: Doc<'oidcKeys'>[] = await ctx.runQuery(internal.sso.oidcKeys, {});
        return keys.map(oidcKey);
      },
      createJwk: async key => {
        if (!('runMutation' in ctx)) throw new Error('Key creation requires a mutation context.');
        const record: Doc<'oidcKeys'> = await ctx.runMutation(internal.sso.createOidcKey, {
          publicKey: key.publicKey, privateKey: key.privateKey,
          ...(key.expiresAt ? { expiresAt: key.expiresAt.getTime() } : {}),
        });
        return oidcKey(record);
      },
    },
  }), oauthProvider({
    loginPage: '/sign-in', consentPage: '/sign-in', scopes: ['openid', 'email', 'profile'],
    grantTypes: ['authorization_code'], validAudiences: [`${process.env.SITE_URL}/api/auth`], allowDynamicClientRegistration: false,
    clientPrivileges: async () => false,
    storeClientSecret: { hash: hashToken },
    postLogin: {
      page: '/sign-in', consentReferenceId: async ({ user }) => { await assertPhotosAccess(ctx, user.id); return undefined; },
      shouldRedirect: async ({ user }) => { await assertPhotosAccess(ctx, user.id); return false; },
    },
    customIdTokenClaims: async ({ user }) => photosClaims(ctx, user.id),
    customUserInfoClaims: async ({ user }) => photosClaims(ctx, user.id),
  })],
} satisfies BetterAuthOptions);
export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

async function assertPhotosAccess(ctx: GenericCtx<DataModel>, authId: string) {
  const allowed: boolean = await ctx.runQuery(internal.sso.canAccessPhotos, { authId });
  if (!allowed) throw new APIError('FORBIDDEN', { message: 'You do not have access to Photos.' });
}
async function photosClaims(ctx: GenericCtx<DataModel>, authId: string) {
  await assertPhotosAccess(ctx, authId);
  const role: string = await ctx.runQuery(internal.sso.photosRole, { authId });
  const profile: { name: string; picture: string | null } | null = await ctx.runQuery(internal.sso.photosProfile, { authId });
  return { immich_role: role, ...(profile ? { name: profile.name, ...(profile.picture ? { picture: profile.picture } : {}) } : {}) };
}

function oidcKey(key: Doc<'oidcKeys'>) {
  return { id: key._id, publicKey: key.publicKey, privateKey: key.privateKey, createdAt: new Date(key.createdAt), ...(key.expiresAt ? { expiresAt: new Date(key.expiresAt) } : {}) };
}

// Better Auth merges endpoints by key. Keep Convex's existing HTTP paths while
// separating its token/JWKS handlers from the OAuth provider's JWT plugin.
function convexSessionPlugin() {
  const plugin = convex({ authConfig, jwt: { definePayload: () => ({}) } });
  const { getToken, getJwks, ...endpoints } = plugin.endpoints;
  return { ...plugin, endpoints: { ...endpoints, getConvexToken: getToken, getConvexJwks: getJwks } };
}
