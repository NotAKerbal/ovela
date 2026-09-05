import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export const role = v.union(v.literal('admin'), v.literal('member'));
export const icon = v.union(v.literal('photos'), v.literal('files'), v.literal('media'), v.literal('notes'));
export default defineSchema({
  people: defineTable({ authId: v.string(), name: v.string(), email: v.string(), role, suspended: v.boolean(), photoId: v.optional(v.id('_storage')), appIds: v.array(v.id('applications')) }).index('by_auth', ['authId']).index('by_email', ['email']),
  applications: defineTable({ name: v.string(), description: v.string(), url: v.string(), icon, color: v.string(), ink: v.string() }),
  invitations: defineTable({ email: v.string(), name: v.string(), role, appIds: v.array(v.id('applications')), tokenHash: v.string(), expiresAt: v.number(), consumed: v.boolean(), revoked: v.boolean() }).index('by_token', ['tokenHash']).index('by_email', ['email']),
});
