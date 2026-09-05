import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { authComponent, createAuthOptions } from "./auth";
import { hashToken } from "./token";
import { publicProfilePicture } from "./profile";

export const canAccessPhotos = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    const person = await ctx.db
      .query("people")
      .withIndex("by_auth", (q) => q.eq("authId", authId))
      .unique();
    if (!person || person.suspended) return false;
    if (person.role === "admin") return true;
    const apps = await Promise.all(person.appIds.map((id) => ctx.db.get(id)));
    return apps.some((app) => app?.provider === "immich");
  },
});

// Only the deployment CLI can configure this confidential, first-party client.
export const configureImmich = internalMutation({
  args: {},
  handler: async (ctx) => {
    const secret = process.env.OVELA_IMMICH_CLIENT_SECRET;
    const origin = process.env.IMMICH_URL;
    if (!secret || !origin) return;
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const data = {
      metadata: JSON.stringify({ ovelaProvider: "immich" }),
      clientId: "immich",
      clientSecret: hashToken(secret),
      name: "Ovela Photos",
      disabled: false,
      skipConsent: true,
      public: false,
      requirePKCE: true,
      redirectUris: [
        `${origin}/auth/login`,
        `${origin}/user-settings`,
        `${origin}/api/oauth/mobile-redirect`,
      ],
      scopes: ["openid", "email", "profile"],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "client_secret_post",
      updatedAt: new Date(),
    };
    const existing = await adapter.findOne({
      model: "oauthClient",
      where: [{ field: "clientId", value: "immich" }],
    });
    if (existing)
      await adapter.update({
        model: "oauthClient",
        where: [{ field: "clientId", value: "immich" }],
        update: data,
      });
    else
      await adapter.create({
        model: "oauthClient",
        data: { ...data, createdAt: new Date() },
      });
  },
});

export const photosRole = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    const person = await ctx.db
      .query("people")
      .withIndex("by_auth", (q) => q.eq("authId", authId))
      .unique();
    return person?.role === "admin" ? "admin" : "user";
  },
});

export const oidcKeys = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query("oidcKeys").collect(),
});
export const createOidcKey = internalMutation({
  args: {
    publicKey: v.string(),
    privateKey: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, key) => {
    const id = await ctx.db.insert("oidcKeys", {
      ...key,
      createdAt: Date.now(),
    });
    return (await ctx.db.get(id))!;
  },
});

export const photosProfile = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    const person = await ctx.db
      .query("people")
      .withIndex("by_auth", (q) => q.eq("authId", authId))
      .unique();
    if (!person || person.suspended) return null;
    const url = person.photoId
      ? await ctx.storage.getUrl(person.photoId)
      : null;
    return { name: person.name, picture: publicProfilePicture(url) };
  },
});

export const canAccessClient = internalQuery({
  args: { authId: v.string(), clientId: v.string() },
  handler: async (ctx, { authId, clientId }) => {
    const provider =
      clientId === "immich"
        ? "immich"
        : clientId === "pelican"
          ? "pelican"
          : null;
    if (!provider) return false;
    const person = await ctx.db
      .query("people")
      .withIndex("by_auth", (q) => q.eq("authId", authId))
      .unique();
    if (!person || person.suspended) return false;
    if (person.role === "admin") return true;
    const apps = await Promise.all(person.appIds.map((id) => ctx.db.get(id)));
    return apps.some((app) => app?.provider === provider);
  },
});
export const configurePelican = internalMutation({
  args: {},
  handler: async (ctx) => {
    const secret = process.env.OVELA_PELICAN_CLIENT_SECRET,
      url = process.env.PELICAN_URL;
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const existing = await adapter.findOne({
      model: "oauthClient",
      where: [{ field: "clientId", value: "pelican" }],
    });
    if (!url || !secret) {
      if (existing)
        await adapter.update({
          model: "oauthClient",
          where: [{ field: "clientId", value: "pelican" }],
          update: { disabled: true, updatedAt: new Date() },
        });
      return;
    }
    const origin = new URL(url);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error(
        "PELICAN_URL must be an HTTP(S) origin without credentials or a path.",
      );
    const data = {
      clientId: "pelican",
      clientSecret: hashToken(secret),
      name: "Ovela Games",
      metadata: JSON.stringify({ ovelaProvider: "pelican" }),
      disabled: false,
      skipConsent: true,
      public: false,
      // The supported Pelican generic OIDC plugin does not send a PKCE challenge.
      requirePKCE: false,
      redirectUris: [`${origin.origin}/auth/oauth/callback/ovela`],
      scopes: ["openid", "email", "profile"],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "client_secret_post",
      updatedAt: new Date(),
    };
    if (existing)
      await adapter.update({
        model: "oauthClient",
        where: [{ field: "clientId", value: "pelican" }],
        update: data,
      });
    else
      await adapter.create({
        model: "oauthClient",
        data: { ...data, createdAt: new Date() },
      });
  },
});

export const activeClient = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    if (!["immich", "pelican"].includes(clientId)) return false;
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const client = await adapter.findOne<{
      disabled?: boolean;
      public?: boolean;
      metadata?: { ovelaProvider?: string };
    }>({
      model: "oauthClient",
      where: [{ field: "clientId", value: clientId }],
    });
    return (
      !!client &&
      !client.disabled &&
      !client.public &&
      client.metadata?.ovelaProvider === clientId
    );
  },
});
