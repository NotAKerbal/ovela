/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { importJWK, SignJWT } from "jose";
import { symmetricDecrypt } from "better-auth/crypto";
import { createAuth, authComponent, createAuthOptions } from "../convex/auth";
import authSchema from "../convex/betterAuth/schema";
import { components, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const authModules = import.meta.glob("../convex/betterAuth/**/*.ts");
function backend() {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);
  return t;
}
afterEach(() => vi.unstubAllEnvs());
describe("Photos single sign-on", () => {
  it("requires the bundled Photos grant and checks suspension on every authorization", async () => {
    const t = backend();
    const { id, photos } = await t.run(async (ctx) => {
      const photos = await ctx.db.insert("applications", {
        name: "Photos",
        description: "",
        url: "",
        icon: "photos",
        color: "",
        ink: "",
        provider: "immich",
      });
      const otherPhotos = await ctx.db.insert("applications", {
        name: "Other photos",
        description: "",
        url: "",
        icon: "photos",
        color: "",
        ink: "",
      });
      const id = await ctx.db.insert("people", {
        authId: "member",
        name: "Member",
        email: "member@example.com",
        role: "member",
        suspended: false,
        appIds: [otherPhotos],
      });
      return { id, photos };
    });
    expect(
      await t.query(internal.sso.canAccessPhotos, { authId: "unknown" }),
    ).toBe(false);
    expect(
      await t.query(internal.sso.canAccessPhotos, { authId: "member" }),
    ).toBe(false);
    await t.run((ctx) => ctx.db.patch(id, { appIds: [photos] }));
    expect(
      await t.query(internal.sso.canAccessPhotos, { authId: "member" }),
    ).toBe(true);
    await t.run((ctx) => ctx.db.patch(id, { suspended: true }));
    expect(
      await t.query(internal.sso.canAccessPhotos, { authId: "member" }),
    ).toBe(false);
    await t.run((ctx) =>
      ctx.db.patch(id, { role: "admin", suspended: false, appIds: [] }),
    );
    expect(
      await t.query(internal.sso.canAccessPhotos, { authId: "member" }),
    ).toBe(true);
    expect(await t.query(internal.sso.photosRole, { authId: "member" })).toBe(
      "admin",
    );
  });
  it("configures one confidential client and rotates its secret without duplicating it", async () => {
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
    vi.stubEnv("IMMICH_URL", "http://127.0.0.1:2283");
    vi.stubEnv("OVELA_IMMICH_CLIENT_SECRET", "test-secret-a");
    const t = backend();
    await t.mutation(internal.sso.configureImmich, {});
    const get = () =>
      t.action((ctx) =>
        authComponent
          .adapter(ctx)(createAuthOptions(ctx))
          .findOne<Record<string, unknown>>({
            model: "oauthClient",
            where: [{ field: "clientId", value: "immich" }],
          }),
      );
    const first = await get();
    expect(first).toMatchObject({
      clientId: "immich",
      public: false,
      skipConsent: true,
      requirePKCE: true,
      redirectUris: [
        "http://127.0.0.1:2283/auth/login",
        "http://127.0.0.1:2283/user-settings",
        "http://127.0.0.1:2283/api/oauth/mobile-redirect",
      ],
    });
    expect(first?.clientSecret).not.toBe("test-secret-a");
    vi.stubEnv("OVELA_IMMICH_CLIENT_SECRET", "test-secret-b");
    await t.mutation(internal.sso.configureImmich, {});
    const second = await get();
    expect(second?.id).toBe(first?.id);
    expect(second?.clientSecret).not.toBe(first?.clientSecret);
  });
});

it.each([
  { clientId: "immich", callback: "/auth/login" },
  { clientId: "immich", callback: "/api/oauth/mobile-redirect" },
  { clientId: "pelican", callback: "/auth/oauth/callback/ovela" },
])(
  "completes $clientId OIDC through $callback and denies suspended accounts",
  async ({ clientId, callback }) => {
    const redirectUri = `${clientId === "immich" ? "http://127.0.0.1:2283" : "https://games.example.com"}${callback}`;
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-secret-only-at-least-thirty-two-characters",
    );
    vi.stubEnv("IMMICH_URL", "http://127.0.0.1:2283");
    vi.stubEnv("OVELA_IMMICH_CLIENT_SECRET", "test-confidential-immich-secret");
    vi.stubEnv("OVELA_SETUP_TOKEN", "a".repeat(64));
    vi.stubEnv("PELICAN_URL", "https://games.example.com");
    vi.stubEnv(
      "OVELA_PELICAN_CLIENT_SECRET",
      "test-confidential-pelican-secret",
    );
    const t = backend();
    const request = async (path: string, init?: RequestInit) => {
      const raw = await t.action(async (ctx) => {
        const response = await createAuth(ctx).handler(
          new Request(`http://127.0.0.1:3000/api/auth${path}`, init),
        );
        return {
          status: response.status,
          headers: [...response.headers],
          body: await response.text(),
        };
      });
      return new Response(raw.body, {
        status: raw.status,
        headers: raw.headers,
      });
    };
    await t.mutation(internal.sso.configureImmich, {});
    await t.mutation(internal.sso.configurePelican, {});
    const signup = await request("/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ovela-invite": "a".repeat(64),
        origin: "http://127.0.0.1:3000",
      },
      body: JSON.stringify({
        name: "Test Admin",
        email: "admin@example.com",
        password: "test-password-for-oidc",
      }),
    });
    expect(signup.status).toBe(200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const convexToken = await request("/convex/token", { headers: { cookie } });
    expect(convexToken.status).toBe(200);
    const discovery = await request("/.well-known/openid-configuration");
    expect(await discovery.json()).toMatchObject({
      issuer: "http://127.0.0.1:3000/api/auth",
      id_token_signing_alg_values_supported: ["RS256"],
    });
    const verifier = "a".repeat(64);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...digest))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: "test-state",
      ...(clientId === "immich"
        ? { code_challenge: challenge, code_challenge_method: "S256" }
        : {}),
      nonce: "test-nonce",
    });
    const authorize = () =>
      request(`/oauth2/authorize?${params}`, {
        headers: { cookie, accept: "text/html" },
      });
    expect(
      (
        await request(
          `/oauth2/authorize?${params}&resource=https://unrelated.example`,
          { headers: { cookie } },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/oauth2/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            resource: "https://unrelated.example",
          }),
        })
      ).status,
    ).toBe(400);
    const authorization = await authorize();
    expect(authorization.status).toBe(302);
    const location = new URL(authorization.headers.get("location")!);
    expect(location.searchParams.get("error")).toBeNull();
    expect(`${location.origin}${location.pathname}`).toBe(redirectUri);
    const code = location.searchParams.get("code");
    expect(code).toBeTruthy();
    const token = await request("/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: redirectUri,
        ...(clientId === "immich" ? { code_verifier: verifier } : {}),
        client_id: clientId,
        client_secret: `test-confidential-${clientId}-secret`,
      }),
    });
    const result = await token.json();
    expect(token.status, JSON.stringify(result)).toBe(200);
    const claims = JSON.parse(
      atob(result.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    expect(claims).toMatchObject({
      iss: "http://127.0.0.1:3000/api/auth",
      aud: clientId,
      ...(clientId === "immich" ? { immich_role: "admin" } : {}),
      email: "admin@example.com",
      email_verified: false,
      nonce: "test-nonce",
    });
    expect(claims).not.toHaveProperty("enrollmentHash");
    if (clientId === "pelican") {
      expect(claims).not.toHaveProperty("immich_role");
      expect(claims).not.toHaveProperty("role");
      expect(claims).not.toHaveProperty("admin");
    }
    const userinfo = await request("/oauth2/userinfo", {
      headers: { authorization: `Bearer ${result.access_token}` },
    });
    expect(userinfo.status).toBe(200);
    expect(await userinfo.json()).toMatchObject({
      email: "admin@example.com",
      email_verified: false,
    });
    if (clientId === "pelican") {
      await t.mutation(internal.providers.configurePelican, {});
      const person = await t.run((ctx) => ctx.db.query("people").first());
      const games = await t.run(async (ctx) =>
        (await ctx.db.query("applications").collect()).find(
          (app) => app.provider === "pelican",
        ),
      );
      await t.run((ctx) =>
        ctx.db.patch(person!._id, { role: "member", appIds: [games!._id] }),
      );
      expect((await authorize()).status).toBe(302);
      const photosParams = new URLSearchParams({
        client_id: "immich",
        redirect_uri: "http://127.0.0.1:2283/auth/login",
        response_type: "code",
        scope: "openid email profile",
        state: "isolation",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      expect(
        (
          await request(`/oauth2/authorize?${photosParams}`, {
            headers: { cookie, accept: "text/html" },
          })
        ).status,
      ).toBe(403);
      const pending = new URL(
        (await authorize()).headers.get("location")!,
      ).searchParams.get("code")!;
      await t.run((ctx) => ctx.db.patch(person!._id, { appIds: [] }));
      expect((await authorize()).status).toBe(403);
      const revokedToken = await request("/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: pending,
          redirect_uri: redirectUri,
          client_id: "pelican",
          client_secret: "test-confidential-pelican-secret",
        }),
      });
      expect(revokedToken.status).toBe(403);
      expect([400, 403]).toContain(
        (
          await request("/oauth2/userinfo", {
            headers: { authorization: `Bearer ${result.access_token}` },
          })
        ).status,
      );
      await t.run((ctx) => ctx.db.patch(person!._id, { appIds: [games!._id] }));
    }
    const loggedOut = await request(`/oauth2/authorize?${params}`, {
      headers: { accept: "text/html" },
    });
    const loginLocation = new URL(
      loggedOut.headers.get("location")!,
      "http://127.0.0.1:3000",
    );
    expect(loginLocation.pathname).toBe("/sign-in");
    const resumed = await request("/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "test-password-for-oidc",
        oauth_query: loginLocation.search.slice(1),
      }),
    });
    const resumedBody = await resumed.json();
    expect(resumedBody.redirect).toBe(true);
    expect(new URL(resumedBody.url).searchParams.get("code")).toBeTruthy();
    if (clientId === "pelican") {
      const signingKey = (await t.run((ctx) =>
        ctx.db.query("oidcKeys").first(),
      ))!;
      const jwtAccess = await new SignJWT({
        sub: claims.sub,
        azp: "pelican",
        scope: "openid email profile",
      })
        .setProtectedHeader({ alg: "RS256", kid: signingKey._id })
        .setIssuer("http://127.0.0.1:3000/api/auth")
        .setAudience("http://127.0.0.1:3000/api/auth")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(
          await importJWK(
            JSON.parse(
              await symmetricDecrypt({
                key: process.env.BETTER_AUTH_SECRET!,
                data: JSON.parse(signingKey.privateKey),
              }),
            ),
            "RS256",
          ),
        );
      expect(
        (
          await request("/oauth2/userinfo", {
            headers: { authorization: `Bearer ${jwtAccess}` },
          })
        ).status,
      ).toBe(200);
      vi.stubEnv("PELICAN_URL", "");
      await t.mutation(internal.sso.configurePelican, {});
      expect([400, 403]).toContain(
        (
          await request("/oauth2/userinfo", {
            headers: { authorization: `Bearer ${result.access_token}` },
          })
        ).status,
      );
      expect([400, 403]).toContain(
        (
          await request("/oauth2/userinfo", {
            headers: { authorization: `Bearer ${jwtAccess}` },
          })
        ).status,
      );
      vi.stubEnv("PELICAN_URL", "https://games.example.com");
      await t.mutation(internal.sso.configurePelican, {});
    }
    await t.run(async (ctx) => {
      const person = (await ctx.db.query("people").first())!;
      await ctx.db.patch(person._id, { suspended: true });
    });
    expect((await authorize()).status).toBe(403);
    // Access-token validation now also checks current app access; the provider maps rejected opaque tokens to400.
    expect([400, 403]).toContain(
      (
        await request("/oauth2/userinfo", {
          headers: { authorization: `Bearer ${result.access_token}` },
        })
      ).status,
    );
  },
);

it("isolates Games and Photos grants and rejects unknown clients even for administrators", async () => {
  const t = backend();
  const ids = await t.run(async (ctx) => {
    const photos = await ctx.db.insert("applications", {
      name: "Photos",
      description: "",
      url: "",
      icon: "photos",
      color: "",
      ink: "",
      provider: "immich",
    });
    const games = await ctx.db.insert("applications", {
      name: "Games",
      description: "",
      url: "",
      icon: "media",
      color: "",
      ink: "",
      provider: "pelican",
    });
    const person = await ctx.db.insert("people", {
      authId: "member",
      name: "Member",
      email: "member@example.com",
      role: "member",
      suspended: false,
      appIds: [games],
    });
    return { photos, games, person };
  });
  expect(
    await t.query(internal.sso.canAccessClient, {
      authId: "member",
      clientId: "pelican",
    }),
  ).toBe(true);
  expect(
    await t.query(internal.sso.canAccessClient, {
      authId: "member",
      clientId: "immich",
    }),
  ).toBe(false);
  await t.run((ctx) => ctx.db.patch(ids.person, { appIds: [ids.photos] }));
  expect(
    await t.query(internal.sso.canAccessClient, {
      authId: "member",
      clientId: "pelican",
    }),
  ).toBe(false);
  expect(
    await t.query(internal.sso.canAccessClient, {
      authId: "member",
      clientId: "immich",
    }),
  ).toBe(true);
  await t.run((ctx) => ctx.db.patch(ids.person, { role: "admin", appIds: [] }));
  expect(
    await t.query(internal.sso.canAccessClient, {
      authId: "member",
      clientId: "unknown",
    }),
  ).toBe(false);
  await t.run((ctx) => ctx.db.patch(ids.person, { suspended: true }));
  expect(
    await t.query(internal.sso.canAccessClient, {
      authId: "member",
      clientId: "pelican",
    }),
  ).toBe(false);
});
it("configures optional Pelican client once, preserves role boundaries and disables it when removed", async () => {
  vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
  vi.stubEnv("PELICAN_URL", "https://games.example.com");
  vi.stubEnv("OVELA_PELICAN_CLIENT_SECRET", "test-pelican-secret");
  const t = backend();
  await t.mutation(internal.providers.configurePelican, {});
  await t.mutation(internal.providers.configurePelican, {});
  await t.mutation(internal.sso.configurePelican, {});
  const get = () =>
    t.action((ctx) =>
      authComponent
        .adapter(ctx)(createAuthOptions(ctx))
        .findOne<Record<string, unknown>>({
          model: "oauthClient",
          where: [{ field: "clientId", value: "pelican" }],
        }),
    );
  const client = await get();
  expect(client).toMatchObject({
    clientId: "pelican",
    public: false,
    requirePKCE: false,
    tokenEndpointAuthMethod: "client_secret_post",
    redirectUris: ["https://games.example.com/auth/oauth/callback/ovela"],
    metadata: { ovelaProvider: "pelican" },
  });
  expect(client?.clientSecret).not.toBe("test-pelican-secret");
  expect(
    (await t.run((ctx) => ctx.db.query("applications").collect())).filter(
      (app) => app.provider === "pelican",
    ),
  ).toHaveLength(1);
  vi.stubEnv("PELICAN_URL", "");
  await t.mutation(internal.sso.configurePelican, {});
  expect(await get()).toMatchObject({ id: client?.id, disabled: true });
});
