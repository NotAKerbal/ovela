import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const fileLinkTables = {
  fileLinks: defineTable({ fileId: v.id('files'), ownerId: v.id('people'), tokenHash: v.string(), passwordHash: v.optional(v.string()), role: v.union(v.literal('viewer'),v.literal('editor')), createdAt: v.number(), expiresAt: v.number(), revoked: v.boolean() }).index('by_token',['tokenHash']).index('by_file',['fileId']),
  fileLinkAttempts: defineTable({ linkId: v.id('fileLinks'), windowStart: v.number(), count: v.number() }).index('by_link',['linkId']),
};
