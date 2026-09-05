import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { access, requireFilesPerson, checkFilesPerson } from "./files";
import { hashToken } from "./token";
import { linkAccess, resolveLink, commitLinkContent } from "./fileLinks";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function sessionAccess(
  ctx: QueryCtx | MutationCtx,
  token: string,
  fileId: Id<"files">,
) {
  const session = await ctx.db
    .query("fileOfficeSessions")
    .withIndex("by_token", (q) => q.eq("tokenHash", hashToken(token)))
    .unique();
  if (!session || session.expiresAt <= Date.now() || session.fileId !== fileId)
    throw new ConvexError("Office session expired. Reopen the document.");
  if (session.shareLinkId) {
    const file = await linkAccess(ctx, session.shareLinkId, fileId);
    if (file.link.passwordHash !== session.sharePasswordHash) throw new ConvexError("Office session expired. Reopen the shared document.");
    return { session, person: null, ...file };
  }
  if (!session.personId) throw new ConvexError("Invalid office session.");
  const person = await checkFilesPerson(ctx, session.personId);
  const file = await access(ctx, fileId, person._id);
  return { session, person, ...file };
}
export const create = mutation({
  args: { fileId: v.id("files"), token: v.string() },
  handler: async (ctx, { fileId, token }) => {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new ConvexError("Invalid office token.");
    const person = await requireFilesPerson(ctx);
    const { node } = await access(ctx, fileId, person._id);
    if (node.kind !== "file") throw new ConvexError("Open a document.");
    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    await ctx.db.insert("fileOfficeSessions", {
      fileId,
      tokenHash: hashToken(token),
      personId: person._id,
      expiresAt,
    });
    return { expiresAt };
  },
});
export const inspect = query({
  args: { fileId: v.id("files"), token: v.string() },
  handler: async (ctx, { fileId, token }) => {
    const { node, person, canEdit, session } = await sessionAccess(ctx, token, fileId);
    return {
      personId: person?._id,
      shareLinkId: session.shareLinkId,
      userId: person?._id ?? `guest-${session._id}`,
      name: person?.name ?? "Guest",
      canEdit,
      file: {
        name: node.name,
        size: node.size,
        revision: node.revision,
        ownerId: node.ownerId,
      },
    };
  },
});
export const lock = mutation({
  args: {
    fileId: v.id("files"),
    token: v.string(),
    operation: v.union(
      v.literal("LOCK"),
      v.literal("UNLOCK"),
      v.literal("REFRESH_LOCK"),
      v.literal("GET_LOCK"),
    ),
    value: v.string(),
    oldValue: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { canEdit } = await sessionAccess(ctx, args.token, args.fileId);
    if (!canEdit) throw new ConvexError("Editing is not allowed.");
    if (args.value.length > 1024) throw new ConvexError("Lock is too long.");
    const stored = await ctx.db
      .query("fileOfficeLocks")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .unique();
    const current = stored && stored.expiresAt > Date.now() ? stored.value : "";
    if (args.operation === "GET_LOCK") return { ok: true, value: current };
    if (!args.value) throw new ConvexError("Lock is required.");
    if (args.operation === "LOCK") {
      if (
        (args.oldValue !== undefined && args.oldValue !== current) ||
        (args.oldValue === undefined && current && current !== args.value)
      )
        return { ok: false, value: current };
      const update = {
        value: args.value,
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
      if (stored) await ctx.db.patch(stored._id, update);
      else
        await ctx.db.insert("fileOfficeLocks", {
          fileId: args.fileId,
          ...update,
        });
    } else {
      if (!current || current !== args.value)
        return { ok: false, value: current };
      if (args.operation === "UNLOCK") await ctx.db.delete(stored!._id);
      else
        await ctx.db.patch(stored!._id, {
          expiresAt: Date.now() + 30 * 60 * 1000,
        });
    }
    return { ok: true, value: args.operation === "UNLOCK" ? "" : args.value };
  },
});

function requireOfficeServer(secret: string) {
  if (!process.env.OVELA_FILES_SECRET || secret !== process.env.OVELA_FILES_SECRET) throw new ConvexError("Server authorization required.");
}
export const createShared = mutation({
  args: { secret: v.string(), tokenHash: v.string(), unlocked: v.boolean(), fileId: v.id("files"), token: v.string() },
  handler: async (ctx, args) => {
    requireOfficeServer(args.secret);
    if (!/^[a-f0-9]{64}$/.test(args.token)) throw new ConvexError("Invalid office token.");
    const { link, node } = await resolveLink(ctx, args.tokenHash, args.fileId, args.unlocked);
    if (node.kind !== "file") throw new ConvexError("Open a document.");
    const expiresAt = Math.min(Date.now() + 8 * 60 * 60 * 1000, link.expiresAt ?? Infinity);
    await ctx.db.insert("fileOfficeSessions", { fileId: args.fileId, tokenHash: hashToken(args.token), shareLinkId: link._id, sharePasswordHash: link.passwordHash, expiresAt });
    return { expiresAt };
  },
});
export const serverGet = query({
  args: { secret: v.string(), token: v.string(), fileId: v.id("files") },
  handler: async (ctx, args) => {
    requireOfficeServer(args.secret);
    const { node, canEdit } = await sessionAccess(ctx, args.token, args.fileId);
    return { ...node, canEdit };
  },
});
export const commitShared = mutation({
  args: { secret: v.string(), token: v.string(), fileId: v.id("files"), storageKey: v.string(), size: v.number(), expectedRevision: v.number(), officeLock: v.string() },
  handler: async (ctx, args) => {
    requireOfficeServer(args.secret);
    const { session, canEdit } = await sessionAccess(ctx, args.token, args.fileId);
    if (!session.shareLinkId || !canEdit) throw new ConvexError("File is read only.");
    return commitLinkContent(ctx, { linkId: session.shareLinkId, id: args.fileId, storageKey: args.storageKey, size: args.size, expectedRevision: args.expectedRevision, officeLock: args.officeLock });
  },
});
