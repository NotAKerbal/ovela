import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const optionalString = v.optional(v.union(v.null(), v.string()));
const optionalNumber = v.optional(v.union(v.null(), v.number()));

// Core Better Auth tables plus the Convex JWT key store. Keep additional user
// fields aligned with createAuthOptions when changing authentication features.
export default defineSchema({
  user: defineTable({
    name: v.string(), email: v.string(), emailVerified: v.boolean(),
    image: optionalString, createdAt: v.number(), updatedAt: v.number(),
    enrollmentHash: v.optional(v.string()),
  }).index('email_name', ['email', 'name']).index('name', ['name']),
  session: defineTable({
    expiresAt: v.number(), token: v.string(), createdAt: v.number(),
    updatedAt: v.number(), ipAddress: optionalString,
    userAgent: optionalString, userId: v.string(),
  }).index('expiresAt', ['expiresAt']).index('expiresAt_userId', ['expiresAt', 'userId'])
    .index('token', ['token']).index('userId', ['userId']),
  account: defineTable({
    accountId: v.string(), providerId: v.string(), userId: v.string(),
    accessToken: optionalString, refreshToken: optionalString, idToken: optionalString,
    accessTokenExpiresAt: optionalNumber, refreshTokenExpiresAt: optionalNumber,
    scope: optionalString, password: optionalString,
    createdAt: v.number(), updatedAt: v.number(),
  }).index('accountId', ['accountId']).index('accountId_providerId', ['accountId', 'providerId'])
    .index('providerId_userId', ['providerId', 'userId']).index('userId', ['userId']),
  verification: defineTable({
    identifier: v.string(), value: v.string(), expiresAt: v.number(),
    createdAt: v.number(), updatedAt: v.number(),
  }).index('expiresAt', ['expiresAt']).index('identifier', ['identifier']),
  jwks: defineTable({
    publicKey: v.string(), privateKey: v.string(), createdAt: v.number(), expiresAt: optionalNumber,
  }),
  rateLimit: defineTable({
    key: v.string(), count: v.number(), lastRequest: v.number(),
  }).index('key', ['key']),
});
