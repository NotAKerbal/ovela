/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import authSchema from '../convex/betterAuth/schema';
import { api, components } from '../convex/_generated/api';
import schema from '../convex/schema';

const modules = import.meta.glob('../convex/**/*.ts');
const authModules = import.meta.glob('../convex/betterAuth/**/*.ts');
function backend() {
  const t = convexTest(schema, modules);
  t.registerComponent('betterAuth', authSchema, authModules);
  return t;
}
async function person(t: ReturnType<typeof backend>, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'user', data: { name: email, email, emailVerified: true, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'session', data: { userId: user._id, token: `session-${email}`, createdAt: now, updatedAt: now, expiresAt: now + 60_000 } } });
  const id = await t.run(ctx => ctx.db.insert('people', { authId: user._id, email, name: email, role: 'member', suspended: false, appIds: [] }));
  return { id, client: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}
const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII='), c => c.charCodeAt(0)).buffer;

describe('profile photos', () => {
  it('stores an own photo, replaces and removes its files, leaving other users untouched', async () => {
    const t = backend();
    const alice = await person(t, 'alice@example.com');
    const bob = await person(t, 'bob@example.com');
    await alice.client.action(api.profile.upload, { image });
    const first = (await t.run(ctx => ctx.db.get(alice.id)))!.photoId!;
    expect(await alice.client.query(api.profile.photo)).toBeTruthy();
    expect(await bob.client.query(api.profile.photo)).toBeNull();
    await bob.client.mutation(api.profile.remove);
    expect(await t.run(async ctx => !!(await ctx.storage.get(first)))).toBe(true);
    await alice.client.action(api.profile.upload, { image });
    const second = (await t.run(ctx => ctx.db.get(alice.id)))!.photoId!;
    expect(second).not.toEqual(first);
    expect(await t.run(ctx => ctx.storage.get(first))).toBeNull();
    expect(await t.run(async ctx => (await ctx.storage.get(second))?.type)).toBe('image/png');
    await alice.client.mutation(api.profile.remove);
    expect(await t.run(ctx => ctx.storage.get(second))).toBeNull();
    expect(await alice.client.query(api.profile.photo)).toBeNull();
  });

  it('rejects anonymous and suspended uploads and removal', async () => {
    const t = backend();
    const alice = await person(t, 'alice@example.com');
    await alice.client.action(api.profile.upload, { image });
    const storedId = (await t.run(ctx => ctx.db.get(alice.id)))!.photoId!;
    await t.run(ctx => ctx.db.patch(alice.id, { suspended: true }));
    for (const client of [t, alice.client]) {
      await expect(client.action(api.profile.upload, { image })).rejects.toThrow('does not have access');
      await expect(client.mutation(api.profile.remove)).rejects.toThrow('does not have access');
      expect(await client.query(api.profile.photo)).toBeNull();
    }
    expect(await t.run(async ctx => !!(await ctx.storage.get(storedId)))).toBe(true);
  });

  it('rejects active content and oversized files without changing the existing photo', async () => {
    const t = backend();
    const alice = await person(t, 'alice@example.com');
    await alice.client.action(api.profile.upload, { image });
    const storedId = (await t.run(ctx => ctx.db.get(alice.id)))!.photoId!;
    await expect(alice.client.action(api.profile.upload, { image: new TextEncoder().encode('<svg onload="alert(1)"/>').buffer })).rejects.toThrow('PNG, JPEG, or WebP');
    await expect(alice.client.action(api.profile.upload, { image: new ArrayBuffer(512 * 1024 + 1) })).rejects.toThrow('smaller than 512 KB');
    expect((await t.run(ctx => ctx.db.get(alice.id)))?.photoId).toEqual(storedId);
    expect(await t.run(ctx => ctx.db.system.query('_storage').collect())).toHaveLength(1);
  });
});
