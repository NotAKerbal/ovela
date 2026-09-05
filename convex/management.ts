import { query, mutation, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { role, icon } from './schema';
import { hashToken, normalizeEmail, validEmail, nonempty, currentPerson, requirePerson, requireAdmin } from './security';

export const setupStatus = query({ args: {}, handler: async ctx => ({ needsSetup: !(await ctx.db.query('people').first()) }) });
export const viewer = query({ args: {}, handler: currentPerson });
export const canRegister = internalQuery({ args: { email: v.string(), token: v.string() }, handler: async (ctx, args) => {
  if (args.token.length < 32 || args.token.length > 256) return false;
  const hasPeople = await ctx.db.query('people').first();
  if (!hasPeople) return !!process.env.OVELA_SETUP_TOKEN && hashToken(args.token) === hashToken(process.env.OVELA_SETUP_TOKEN);
  const invite = await ctx.db.query('invitations').withIndex('by_token', q => q.eq('tokenHash', hashToken(args.token))).unique();
  return !!invite && !invite.revoked && !invite.consumed && invite.expiresAt > Date.now() && invite.email === normalizeEmail(args.email);
} });
export const invitationInfo = query({ args: { token: v.string() }, handler: async (ctx, { token }) => {
  if (token.length < 32 || token.length > 256) return null;
  const invite = await ctx.db.query('invitations').withIndex('by_token', q => q.eq('tokenHash', hashToken(token))).unique();
  return invite && !invite.revoked && !invite.consumed && invite.expiresAt > Date.now() ? { email: invite.email, name: invite.name } : null;
} });
export const home = query({ args: {}, handler: async ctx => {
  const person = await requirePerson(ctx);
  const applications = await ctx.db.query('applications').collect();
  return applications.filter(app => person.role === 'admin' || person.appIds.includes(app._id));
} });
export const directory = query({ args: {}, handler: async ctx => {
  await requireAdmin(ctx);
  const people = await ctx.db.query('people').collect();
  const applications = await ctx.db.query('applications').collect();
  const invitations = (await ctx.db.query('invitations').collect()).filter(i => !i.consumed && !i.revoked).map(({ tokenHash: _secret, ...invite }) => invite);
  return { people, applications, invitations };
} });
async function validateAppIds(ctx: MutationCtx, ids: Id<'applications'>[]) {
  const distinct = [...new Set(ids)];
  if (distinct.length > 200) throw new ConvexError('Too many applications.');
  for (const id of distinct) if (!await ctx.db.get(id)) throw new ConvexError('An application no longer exists.');
  return distinct;
}
export const invite = mutation({ args: { email: v.string(), name: v.string(), role, appIds: v.array(v.id('applications')), token: v.string() }, handler: async (ctx, args) => {
  await requireAdmin(ctx);
  const email = validEmail(args.email), name = nonempty(args.name);
  if (!/^[a-f0-9]{64}$/.test(args.token)) throw new ConvexError('Could not create a secure invitation.');
  if (await ctx.db.query('people').withIndex('by_email', q => q.eq('email', email)).first()) throw new ConvexError('This person already has an account.');
  const appIds = await validateAppIds(ctx, args.appIds);
  // Reissuing an invitation invalidates every earlier link for this email.
  for (const previous of await ctx.db.query('invitations').withIndex('by_email', q => q.eq('email', email)).collect()) if (!previous.consumed) await ctx.db.patch(previous._id, { revoked: true });
  return await ctx.db.insert('invitations', { email, name, role: args.role, appIds, tokenHash: hashToken(args.token), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, consumed: false, revoked: false });
} });
export const revokeInvite = mutation({ args: { id: v.id('invitations') }, handler: async (ctx, { id }) => { await requireAdmin(ctx); if (!await ctx.db.get(id)) throw new ConvexError('Invitation not found.'); await ctx.db.patch(id, { revoked: true }); } });
export const savePerson = mutation({ args: { id: v.id('people'), role, appIds: v.array(v.id('applications')), suspended: v.boolean() }, handler: async (ctx, args) => {
  await requireAdmin(ctx);
  const person = await ctx.db.get(args.id);
  if (!person) throw new ConvexError('Person not found.');
  const appIds = await validateAppIds(ctx, args.appIds);
  if (person.role === 'admin' && !person.suspended && (args.role !== 'admin' || args.suspended)) {
    const admins = (await ctx.db.query('people').collect()).filter(p => p.role === 'admin' && !p.suspended);
    if (admins.length <= 1) throw new ConvexError('Keep at least one active administrator.');
  }
  await ctx.db.patch(args.id, { role: args.role, appIds, suspended: args.suspended });
  // Every request checks this live record, so suspension also blocks existing sessions.
} });
export const saveApplication = mutation({ args: { id: v.optional(v.id('applications')), name: v.string(), description: v.string(), url: v.string(), icon }, handler: async (ctx, args) => {
  await requireAdmin(ctx);
  const name = nonempty(args.name, 60), description = args.description.trim();
  if (description.length > 160) throw new ConvexError('Keep the description under 160 characters.');
  const url = args.url.trim();
  if (url) { let parsed: URL; try { parsed = new URL(url); } catch { throw new ConvexError('Enter a complete http or https URL.'); } if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || url.length > 2048) throw new ConvexError('Use an http or https URL without credentials.'); }
  const palette = { photos: ['#bcc5ac', '#516348'], files: ['#d8c6a5', '#80633d'], media: ['#aebfc6', '#456575'], notes: ['#d4b7a7', '#875e4a'] };
  const [color, ink] = palette[args.icon];
  const data = { name, description, url, icon: args.icon, color, ink };
  if (args.id) { if (!await ctx.db.get(args.id)) throw new ConvexError('Application not found.'); await ctx.db.patch(args.id, data); return args.id; }
  return await ctx.db.insert('applications', data);
} });
