/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import authSchema from '../convex/betterAuth/schema';
import { api, components, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import schema from '../convex/schema';
import { hashToken } from '../convex/token';

const modules = import.meta.glob('../convex/**/*.ts');
const authModules = import.meta.glob('../convex/betterAuth/**/*.ts');
function backend() {
  const t = convexTest(schema, modules);
  t.registerComponent('betterAuth', authSchema, authModules);
  return t;
}
type Backend = ReturnType<typeof backend>;
async function person(t: Backend, role: 'admin' | 'member', email: string, appIds: Id<'applications'>[] = []) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'user', data: { name: email, email, emailVerified: true, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'session', data: { userId: user._id, token: `session-${email}`, createdAt: now, updatedAt: now, expiresAt: now + 60_000 } } });
  const id = await t.run(ctx => ctx.db.insert('people', { authId: user._id, email, name: email, role, suspended: false, appIds }));
  return { id, authId: user._id, client: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}
async function application(t: Backend, name: string) {
  return t.run(ctx => ctx.db.insert('applications', { name, description: '', url: 'https://example.com', icon: 'photos', color: '#abc', ink: '#123' }));
}
const token = 'a'.repeat(64);
afterEach(() => vi.unstubAllEnvs());

describe('management authorization', () => {
  it('denies anonymous and ordinary members access to administration and writes', async () => {
    const t = backend();
    const member = await person(t, 'member', 'member@example.com');
    for (const client of [t, member.client]) {
      await expect(client.query(api.management.directory, {})).rejects.toThrow();
      await expect(client.mutation(api.management.saveApplication, { name: 'Files', description: '', url: '', icon: 'files' })).rejects.toThrow();
      await expect(client.mutation(api.management.invite, { email: 'new@example.com', name: 'New', role: 'admin', appIds: [], token })).rejects.toThrow();
      await expect(client.mutation(api.management.savePerson, { id: member.id, role: 'admin', appIds: [], suspended: false })).rejects.toThrow();
    }
    expect(await t.run(ctx => ctx.db.query('invitations').collect())).toEqual([]);
  });

  it('returns only assigned apps to members and all apps to administrators', async () => {
    const t = backend();
    const photos = await application(t, 'Photos');
    await application(t, 'Files');
    const member = await person(t, 'member', 'member@example.com', [photos]);
    const admin = await person(t, 'admin', 'admin@example.com');
    expect((await member.client.query(api.management.home, {})).map(app => app.name)).toEqual(['Photos']);
    expect(await admin.client.query(api.management.home, {})).toHaveLength(2);
    await expect(t.query(api.management.home, {})).rejects.toThrow();
  });

  it('protects the last active administrator and blocks a suspended user with an existing session', async () => {
    const t = backend();
    const admin = await person(t, 'admin', 'admin@example.com');
    await expect(admin.client.mutation(api.management.savePerson, { id: admin.id, role: 'member', suspended: false, appIds: [] })).rejects.toThrow('Keep at least one active administrator');
    await expect(admin.client.mutation(api.management.savePerson, { id: admin.id, role: 'admin', suspended: true, appIds: [] })).rejects.toThrow('Keep at least one active administrator');
    const second = await person(t, 'admin', 'second@example.com');
    await admin.client.mutation(api.management.savePerson, { id: second.id, role: 'admin', suspended: true, appIds: [] });
    await expect(second.client.query(api.management.directory, {})).rejects.toThrow();
    await expect(second.client.query(api.management.home, {})).rejects.toThrow();
    await expect(t.mutation(internal.auth.onCreate, { model: 'session', doc: { userId: second.authId } })).rejects.toThrow('does not have access');
    await expect(admin.client.mutation(api.management.savePerson, { id: admin.id, role: 'member', suspended: false, appIds: [] })).rejects.toThrow('Keep at least one active administrator');
  });

  it('rejects unsafe app URLs while allowing a local HTTP destination', async () => {
    const t = backend();
    const admin = await person(t, 'admin', 'admin@example.com');
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.com', 'photos.local']) {
      await expect(admin.client.mutation(api.management.saveApplication, { name: 'Photos', description: '', url, icon: 'photos' })).rejects.toThrow();
    }
    const id = await admin.client.mutation(api.management.saveApplication, { name: 'Photos', description: '', url: 'http://photos.local:3000', icon: 'photos' });
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ url: 'http://photos.local:3000' });
  });
});

describe('registration and invitations', () => {
  it('requires the setup secret before the first user and rejects it after setup', async () => {
    vi.stubEnv('OVELA_SETUP_TOKEN', token);
    const t = backend();
    expect(await t.query(internal.management.canRegister, { email: 'owner@example.com', token: '' })).toBe(false);
    expect(await t.query(internal.management.canRegister, { email: 'owner@example.com', token: 'b'.repeat(64) })).toBe(false);
    expect(await t.query(internal.management.canRegister, { email: 'owner@example.com', token })).toBe(true);
    const owner = { _id: 'owner-auth-id', name: 'Owner', email: 'owner@example.com' };
    await expect(t.mutation(internal.auth.onCreate, { model: 'user', doc: owner })).rejects.toThrow();
    await expect(t.mutation(internal.auth.onCreate, { model: 'user', doc: { ...owner, enrollmentHash: hashToken('wrong-setup-key') } })).rejects.toThrow();
    expect(await t.query(api.management.setupStatus, {})).toEqual({ needsSetup: true });
    await t.mutation(internal.auth.onCreate, { model: 'user', doc: { ...owner, enrollmentHash: hashToken(token) } });
    expect(await t.run(ctx => ctx.db.query('people').first())).toMatchObject({ role: 'admin', email: owner.email });
    expect(await t.query(internal.management.canRegister, { email: 'owner@example.com', token })).toBe(false);
  });

  it('stores only a hash, binds the invitation to email, and invalidates old links when reissued', async () => {
    const t = backend();
    const admin = await person(t, 'admin', 'admin@example.com');
    const invite = { email: 'new@example.com', name: 'New', role: 'member' as const, appIds: [], token };
    const id = await admin.client.mutation(api.management.invite, invite);
    const stored = await t.run(ctx => ctx.db.get(id));
    expect(stored?.tokenHash).not.toEqual(token);
    expect(JSON.stringify(await admin.client.query(api.management.directory, {}))).not.toContain(stored?.tokenHash);
    expect(await t.query(internal.management.canRegister, { email: ' NEW@example.com ', token })).toBe(true);
    expect(await t.query(internal.management.canRegister, { email: 'other@example.com', token })).toBe(false);
    expect(await t.query(internal.management.canRegister, { email: invite.email, token: 'b'.repeat(64) })).toBe(false);
    const replacement = 'c'.repeat(64);
    const replacementId = await admin.client.mutation(api.management.invite, { ...invite, token: replacement });
    expect(await t.query(api.management.invitationInfo, { token })).toBeNull();
    await admin.client.mutation(api.management.revokeInvite, { id: replacementId });
    expect(await t.query(internal.management.canRegister, { email: invite.email, token: replacement })).toBe(false);
  });

  it('rejects expired invitations and consumes an invitation when its user is provisioned', async () => {
    const t = backend();
    const admin = await person(t, 'admin', 'admin@example.com');
    const appId = await application(t, 'Photos');
    const id = await admin.client.mutation(api.management.invite, { email: 'new@example.com', name: 'New', role: 'member', appIds: [appId], token });
    await t.run(ctx => ctx.db.patch(id, { expiresAt: Date.now() - 1 }));
    expect(await t.query(api.management.invitationInfo, { token })).toBeNull();
    expect(await t.query(internal.management.canRegister, { email: 'new@example.com', token })).toBe(false);
    await t.run(ctx => ctx.db.patch(id, { expiresAt: Date.now() + 60_000 }));
    await t.mutation(internal.auth.onCreate, { model: 'user', doc: { _id: 'new-auth-id', name: 'New', email: 'new@example.com', enrollmentHash: hashToken(token) } });
    const newPerson = await t.run(ctx => ctx.db.query('people').withIndex('by_auth', q => q.eq('authId', 'new-auth-id')).unique());
    expect(newPerson).toMatchObject({ role: 'member', appIds: [appId] });
    expect(await t.query(internal.management.canRegister, { email: 'new@example.com', token })).toBe(false);
    expect(await t.query(api.management.invitationInfo, { token })).toBeNull();
    await expect(t.mutation(internal.auth.onCreate, { model: 'user', doc: { _id: 'another-auth-id', name: 'New', email: 'new@example.com', enrollmentHash: hashToken(token) } })).rejects.toThrow('valid invitation');
  });

  it('cannot consume a replacement invitation after the original was validated', async () => {
    const t = backend();
    const admin = await person(t, 'admin', 'admin@example.com');
    const invite = { email: 'new@example.com', name: 'New', role: 'member' as const, appIds: [], token };
    await admin.client.mutation(api.management.invite, invite);
    expect(await t.query(internal.management.canRegister, { email: invite.email, token })).toBe(true);
    const replacement = 'b'.repeat(64);
    const replacementId = await admin.client.mutation(api.management.invite, { ...invite, token: replacement, role: 'admin' });
    await expect(t.mutation(internal.auth.onCreate, { model: 'user', doc: { _id: 'stale-signup', name: 'New', email: invite.email, enrollmentHash: hashToken(token) } })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.get(replacementId))).toMatchObject({ consumed: false, revoked: false, role: 'admin' });
    expect(await t.run(ctx => ctx.db.query('people').withIndex('by_auth', q => q.eq('authId', 'stale-signup')).unique())).toBeNull();
    expect(await t.query(internal.management.canRegister, { email: invite.email, token: replacement })).toBe(true);
  });
});
