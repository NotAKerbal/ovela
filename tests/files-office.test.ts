/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import authSchema from "../convex/betterAuth/schema";
import { api, components } from "../convex/_generated/api";
import schema from "../convex/schema";
import { discoveryAction } from "../lib/office-discovery";
const modules = import.meta.glob("../convex/**/*.ts");
const authModules = import.meta.glob("../convex/betterAuth/**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: "Owner",
        email: "office@example.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: {
        userId: user._id,
        token: "test-session",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 60_000,
      },
    },
  });
  const personId = await t.run((ctx) =>
    ctx.db.insert("people", {
      authId: user._id,
      name: "Owner",
      email: "office@example.test",
      role: "admin",
      suspended: false,
      appIds: [],
    }),
  );
  const fileId = await t.run((ctx) =>
    ctx.db.insert("files", {
      name: "Document.docx",
      kind: "file",
      ownerId: personId,
      size: 42,
      revision: 1,
      mime: "application/octet-stream",
      updatedAt: now,
      trashed: false,
    }),
  );
  const client = t.withIdentity({ subject: user._id, sessionId: session._id });
  const token = "a".repeat(64);
  await client.mutation(api.filesOffice.create, { fileId, token });
  return { t, client, token, fileId, personId };
}
describe("office sessions", () => {
  it("scopes tokens to one file and revokes access immediately when suspended", async () => {
    const { t, token, fileId, personId } = await fixture();
    expect(
      (await t.query(api.filesOffice.inspect, { fileId, token })).canEdit,
    ).toBe(true);
    await expect(
      t.query(api.filesOffice.inspect, { fileId, token: "b".repeat(64) }),
    ).rejects.toThrow();
    const other = await t.run((ctx) =>
      ctx.db.insert("files", {
        name: "Other.docx",
        kind: "file",
        ownerId: personId,
        size: 0,
        revision: 1,
        mime: "",
        updatedAt: Date.now(),
        trashed: false,
      }),
    );
    await expect(
      t.query(api.filesOffice.inspect, { fileId: other, token }),
    ).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch(personId, { suspended: true }));
    await expect(
      t.query(api.filesOffice.inspect, { fileId, token }),
    ).rejects.toThrow();
  });
  it("prevents competing locks, refreshes a matching lock, and requires matching unlock", async () => {
    const { t, token, fileId } = await fixture();
    const lock = (
      operation: "LOCK" | "UNLOCK" | "REFRESH_LOCK" | "GET_LOCK",
      value: string,
    ) => t.mutation(api.filesOffice.lock, { fileId, token, operation, value });
    expect((await lock("LOCK", "editor-one")).ok).toBe(true);
    expect(await lock("LOCK", "editor-two")).toEqual({
      ok: false,
      value: "editor-one",
    });
    expect((await lock("REFRESH_LOCK", "editor-one")).ok).toBe(true);
    expect((await lock("UNLOCK", "editor-two")).ok).toBe(false);
    expect((await lock("UNLOCK", "editor-one")).ok).toBe(true);
    expect(await lock("GET_LOCK", "")).toEqual({ ok: true, value: "" });
  });
  it("rejects expired sessions", async () => {
    const { t, token, fileId } = await fixture();
    await t.run(async (ctx) => {
      const session = (await ctx.db.query("fileOfficeSessions").collect())[0];
      await ctx.db.patch(session._id, { expiresAt: 0 });
    });
    await expect(
      t.query(api.filesOffice.inspect, { fileId, token }),
    ).rejects.toThrow();
  });
  it("uses the supported action for the exact extension and removes discovery placeholders", () => {
    const xml =
      '<action name="edit" ext="docx" urlsrc="http://office/browser/abc/cool.html?&amp;lang=&lt;lang&gt;&amp;"/><action name="view" ext="docx" urlsrc="http://office/view?"/>';
    expect(discoveryAction(xml, "docx", true)).toBe(
      "http://office/browser/abc/cool.html?&lang=&",
    );
    expect(discoveryAction(xml, "docx", false)).toBe("http://office/view?");
    expect(() => discoveryAction(xml, "exe", true)).toThrow();
  });
});

describe('public office sessions', () => {
  const secret = 'office-test-server-secret';
  afterEach(() => vi.unstubAllEnvs());
  async function sharedFixture(passwordHash?: string) {
    vi.stubEnv('OVELA_FILES_SECRET', secret);
    const base = await fixture();
    const linkTokenHash = 'c'.repeat(64), officeToken = 'd'.repeat(64);
    const linkId = await base.t.run(ctx => ctx.db.insert('fileLinks', { fileId: base.fileId, ownerId: base.personId, tokenHash: linkTokenHash, passwordHash, role: 'editor', createdAt: Date.now(), expiresAt: Date.now() + 60_000, revoked: false }));
    const createArgs = { secret, tokenHash: linkTokenHash, unlocked: !passwordHash, fileId: base.fileId, token: officeToken };
    return { ...base, linkId, officeToken, createArgs };
  }
  it('requires server authorization and password unlock before issuing office access', async () => {
    const { t, createArgs } = await sharedFixture('protected-password-hash');
    await expect(t.mutation(api.filesOffice.createShared, { ...createArgs, unlocked: true, secret: 'wrong' })).rejects.toThrow();
    await expect(t.mutation(api.filesOffice.createShared, createArgs)).rejects.toThrow('SHARE_LOCKED');
    expect((await t.mutation(api.filesOffice.createShared, { ...createArgs, unlocked: true })).expiresAt).toBeGreaterThan(Date.now());
  });
  it('uses guest identity and immediately honors a downgrade, revocation and password change', async () => {
    const { t, createArgs, officeToken, fileId, linkId, personId } = await sharedFixture();
    await t.mutation(api.filesOffice.createShared, createArgs);
    const args = { token: officeToken, fileId };
    const initial = await t.query(api.filesOffice.inspect, args);
    expect(initial.personId).toBeUndefined(); expect(initial.userId).not.toBe(personId); expect(initial.canEdit).toBe(true);
    await t.mutation(api.filesOffice.lock, { ...args, operation: 'LOCK', value: 'guest-lock' });
    expect(await t.mutation(api.filesOffice.commitShared, { ...args, secret, storageKey: 'f'.repeat(64), size: 42, expectedRevision: 1, officeLock: 'guest-lock' })).toEqual({ revision: 2 });
    await t.run(ctx => ctx.db.patch(linkId, { role: 'viewer' }));
    expect((await t.query(api.filesOffice.inspect, args)).canEdit).toBe(false);
    await expect(t.mutation(api.filesOffice.commitShared, { ...args, secret, storageKey: 'f'.repeat(64), size: 42, expectedRevision: 1, officeLock: 'guest-lock' })).rejects.toThrow();
    await t.run(ctx => ctx.db.patch(linkId, { passwordHash: 'new-password' }));
    await expect(t.query(api.filesOffice.inspect, args)).rejects.toThrow();
    await t.run(ctx => ctx.db.patch(linkId, { passwordHash: undefined, revoked: true }));
    await expect(t.query(api.filesOffice.inspect, args)).rejects.toThrow();
  });
  it('enforces link scope and expiration on existing WOPI sessions', async () => {
    const { t, createArgs, officeToken, fileId, linkId, personId } = await sharedFixture();
    const other = await t.run(ctx => ctx.db.insert('files', { name: 'Private.docx', kind: 'file', ownerId: personId, size: 0, revision: 1, mime: '', updatedAt: Date.now(), trashed: false }));
    await expect(t.mutation(api.filesOffice.createShared, { ...createArgs, fileId: other })).rejects.toThrow();
    await t.mutation(api.filesOffice.createShared, createArgs);
    await expect(t.query(api.filesOffice.serverGet, { secret: 'wrong', fileId, token: officeToken })).rejects.toThrow();
    await t.run(ctx => ctx.db.patch(linkId, { expiresAt: 0 }));
    await expect(t.query(api.filesOffice.inspect, { fileId, token: officeToken })).rejects.toThrow();
  });
});
