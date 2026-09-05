import { fileLinkTables } from './fileLinksSchema';
import { officeTables } from './filesOfficeSchema';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export const role = v.union(v.literal('admin'), v.literal('member'));
export const icon = v.union(v.literal('photos'), v.literal('files'), v.literal('media'), v.literal('notes'));
export default defineSchema({
  ...officeTables,
  ...fileLinkTables,
  files: defineTable({ name: v.string(), kind: v.union(v.literal('file'),v.literal('folder')), parentId: v.optional(v.id('files')), ownerId: v.id('people'), mime: v.string(), size: v.number(), revision: v.number(), storageKey: v.optional(v.string()), updatedAt: v.number(), trashed: v.boolean() }).index('by_owner_parent',['ownerId','parentId']).index('by_parent',['parentId']),
  fileGrants: defineTable({fileId:v.id('files'),personId:v.id('people'),role:v.union(v.literal('viewer'),v.literal('editor'))}).index('by_file_person',['fileId','personId']).index('by_person',['personId']),
  fileVersions: defineTable({fileId:v.id('files'),revision:v.number(),storageKey:v.string(),size:v.number(),createdAt:v.number()}).index('by_file',['fileId']),
  oidcKeys: defineTable({ publicKey: v.string(), privateKey: v.string(), createdAt: v.number(), expiresAt: v.optional(v.number()) }),
  people: defineTable({ authId: v.string(), name: v.string(), email: v.string(), role, suspended: v.boolean(), photoId: v.optional(v.id('_storage')), appIds: v.array(v.id('applications')) }).index('by_auth', ['authId']).index('by_email', ['email']),
  applications: defineTable({ name: v.string(), description: v.string(), url: v.string(), provider: v.optional(v.union(v.literal('immich'), v.literal('pelican'))), icon, color: v.string(), ink: v.string() }),
  invitations: defineTable({ email: v.string(), name: v.string(), role, appIds: v.array(v.id('applications')), tokenHash: v.string(), expiresAt: v.number(), consumed: v.boolean(), revoked: v.boolean() }).index('by_token', ['tokenHash']).index('by_email', ['email']),
});
