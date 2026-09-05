import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { authComponent, createAuthOptions } from './auth';
import { hashToken } from './token';

export const canAccessPhotos = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    const person = await ctx.db.query('people').withIndex('by_auth', q => q.eq('authId', authId)).unique();
    if (!person || person.suspended) return false;
    if (person.role === 'admin') return true;
    const apps = await Promise.all(person.appIds.map(id => ctx.db.get(id)));
    return apps.some(app => app?.provider === 'immich');
  },
});

// Only the deployment CLI can configure this confidential, first-party client.
export const configureImmich = internalMutation({
  args: {},
  handler: async ctx => {
    const secret = process.env.OVELA_IMMICH_CLIENT_SECRET;
    const origin = process.env.IMMICH_URL;
    if (!secret || !origin) return;
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const data = {
      clientId: 'immich', clientSecret: hashToken(secret), name: 'Ovela Photos', disabled: false,
      skipConsent: true, public: false, requirePKCE: true,
      redirectUris: [`${origin}/auth/login`, `${origin}/user-settings`],
      scopes: ['openid', 'email', 'profile'], grantTypes: ['authorization_code'], responseTypes: ['code'],
      tokenEndpointAuthMethod: 'client_secret_post', updatedAt: new Date(),
    };
    const existing = await adapter.findOne({ model: 'oauthClient', where: [{ field: 'clientId', value: 'immich' }] });
    if (existing) await adapter.update({ model: 'oauthClient', where: [{ field: 'clientId', value: 'immich' }], update: data });
    else await adapter.create({ model: 'oauthClient', data: { ...data, createdAt: new Date() } });
  },
});

export const photosRole = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    const person = await ctx.db.query('people').withIndex('by_auth', q => q.eq('authId', authId)).unique();
    return person?.role === 'admin' ? 'admin' : 'user';
  },
});

export const oidcKeys = internalQuery({ args: {}, handler: ctx => ctx.db.query('oidcKeys').collect() });
export const createOidcKey = internalMutation({
  args: { publicKey: v.string(), privateKey: v.string(), expiresAt: v.optional(v.number()) },
  handler: async (ctx, key) => {
    const id = await ctx.db.insert('oidcKeys', { ...key, createdAt: Date.now() });
    return (await ctx.db.get(id))!;
  },
});
