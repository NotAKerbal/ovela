import { ConvexError } from 'convex/values';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { authComponent } from './auth';
export { hashToken } from './token';
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function validEmail(email: string) { if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError('Enter a valid email address.'); return normalizeEmail(email); }
export function nonempty(text: string, max = 100) { const value = text.trim(); if (!value || value.length > max) throw new ConvexError(`Enter between 1 and ${max} characters.`); return value; }
export async function currentPerson(ctx: QueryCtx | MutationCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  return await ctx.db.query('people').withIndex('by_auth', q => q.eq('authId', user._id)).unique();
}
export async function requirePerson(ctx: QueryCtx | MutationCtx) {
  const person = await currentPerson(ctx);
  if (!person || person.suspended) throw new ConvexError('Your account does not have access.');
  return person;
}
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const person = await requirePerson(ctx);
  if (person.role !== 'admin') throw new ConvexError('Administrator access is required.');
  return person;
}
