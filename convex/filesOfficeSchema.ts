import { defineTable } from "convex/server";
import { v } from "convex/values";
export const officeTables = {
  fileOfficeSessions: defineTable({
    tokenHash: v.string(),
    fileId: v.id("files"),
    personId: v.optional(v.id("people")),
    shareLinkId: v.optional(v.id("fileLinks")),
    sharePasswordHash: v.optional(v.string()),
    expiresAt: v.number(),
  }).index("by_token", ["tokenHash"]),
  fileOfficeLocks: defineTable({
    fileId: v.id("files"),
    value: v.string(),
    expiresAt: v.number(),
  }).index("by_file", ["fileId"]),
};
