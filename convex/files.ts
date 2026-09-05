import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { requirePerson } from "./security";
type Ctx = QueryCtx | MutationCtx;
export async function requireFilesPerson(ctx: Ctx) {
  const person = await requirePerson(ctx);
  await checkFilesPerson(ctx, person._id);
  return person;
}
export async function checkFilesPerson(ctx: Ctx, id: Id<"people">) {
  const person = await ctx.db.get(id);
  if (!person || person.suspended)
    throw new ConvexError("Files access denied.");
  if (person.role !== "admin") {
    const apps = await Promise.all(person.appIds.map((id) => ctx.db.get(id)));
    if (!apps.some((app) => app?.icon === "files"))
      throw new ConvexError("Files access denied.");
  }
  return person;
}
export async function access(
  ctx: Ctx,
  id: Id<"files">,
  personId: Id<"people">,
) {
  const node = await ctx.db.get(id);
  if (!node) throw new ConvexError("File not found.");
  const ancestors: Doc<"files">[] = [];
  let current: Doc<"files"> | null = node;
  let canRead = node.ownerId === personId,
    canEdit = canRead;
  while (current) {
    if (current.trashed) throw new ConvexError("File not found.");
    ancestors.unshift(current);
    const grant = await ctx.db
      .query("fileGrants")
      .withIndex("by_file_person", (q) =>
        q.eq("fileId", current!._id).eq("personId", personId),
      )
      .unique();
    if (grant) {
      canRead = true;
      canEdit ||= grant.role === "editor";
    }
    if (ancestors.length > 64)
      throw new ConvexError("Folder nesting limit reached.");
    const parentId: Id<"files"> | undefined = current.parentId;
    current = parentId ? await ctx.db.get(parentId) : null;
    if (parentId && !current) throw new ConvexError("File not found.");
  }
  if (!canRead) throw new ConvexError("Files access denied.");
  // Do not expose names of private ancestors above the shared entry point.
  const visible = [];
  for (const item of ancestors) {
    if (
      item.ownerId === personId ||
      (await ctx.db
        .query("fileGrants")
        .withIndex("by_file_person", (q) =>
          q.eq("fileId", item._id).eq("personId", personId),
        )
        .unique()) ||
      visible.length
    )
      visible.push({ _id: item._id, name: item.name, kind: item.kind });
  }
  return {
    node,
    canEdit,
    isOwner: node.ownerId === personId,
    breadcrumbs: visible,
    depth: ancestors.length,
  };
}
function name(value: string) {
  value = value.trim();
  if (
    !value ||
    value.length > 255 ||
    /[\x00-\x1f/\\]/.test(value) ||
    value === "." ||
    value === ".."
  )
    throw new ConvexError("Choose a valid file name.");
  return value;
}
function publicNode(result: Awaited<ReturnType<typeof access>>) {
  const { storageKey: _, ...node } = result.node;
  const parentId = result.breadcrumbs.some((item) => item._id === node.parentId)
    ? node.parentId
    : undefined;
  return {
    ...node,
    parentId,
    canEdit: result.canEdit,
    isOwner: result.isOwner,
    breadcrumbs: result.breadcrumbs,
  };
}
async function destination(
  ctx: Ctx,
  personId: Id<"people">,
  parentId?: Id<"files">,
) {
  if (!parentId) return personId;
  const a = await access(ctx, parentId, personId);
  if (!a.canEdit || a.node.kind !== "folder")
    throw new ConvexError("Folder is read only.");
  if (a.depth >= 60) throw new ConvexError("Folder nesting limit reached.");
  return a.node.ownerId;
}
async function uniqueName(
  ctx: Ctx,
  ownerId: Id<"people">,
  parentId: Id<"files"> | undefined,
  value: string,
  except?: Id<"files">,
) {
  const siblings = await ctx.db
    .query("files")
    .withIndex("by_owner_parent", (q) =>
      q.eq("ownerId", ownerId).eq("parentId", parentId),
    )
    .collect();
  if (
    siblings.some(
      (n) =>
        !n.trashed &&
        n._id !== except &&
        n.name.toLowerCase() === value.toLowerCase(),
    )
  )
    throw new ConvexError("A file with that name already exists.");
}
export const list = query({
  args: {
    parentId: v.optional(v.id("files")),
    shared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const person = await requireFilesPerson(ctx);
    let nodes: Doc<"files">[],
      breadcrumbs: {
        _id: Id<"files">;
        name: string;
        kind: "file" | "folder";
      }[] = [],
      canEdit = true;
    if (args.parentId) {
      const a = await access(ctx, args.parentId, person._id);
      if (a.node.kind !== "folder") throw new ConvexError("Not a folder.");
      breadcrumbs = a.breadcrumbs;
      canEdit = a.canEdit;
      nodes = await ctx.db
        .query("files")
        .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
        .collect();
    } else if (args.shared) {
      canEdit = false;
      const grants = await ctx.db
        .query("fileGrants")
        .withIndex("by_person", (q) => q.eq("personId", person._id))
        .collect();
      nodes = (
        await Promise.all(grants.map((g) => ctx.db.get(g.fileId)))
      ).filter((n): n is Doc<"files"> => !!n && n.ownerId !== person._id);
    } else
      nodes = await ctx.db
        .query("files")
        .withIndex("by_owner_parent", (q) =>
          q.eq("ownerId", person._id).eq("parentId", undefined),
        )
        .collect();
    const items = [];
    for (const node of nodes.filter((n) => !n.trashed)) {
      try {
        items.push(publicNode(await access(ctx, node._id, person._id)));
      } catch {
        /* A shared ancestor may have been trashed. */
      }
    }
    items.sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name)
        : a.kind === "folder"
          ? -1
          : 1,
    );
    return { items, breadcrumbs, canEdit };
  },
});
export const get = query({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) =>
    publicNode(await access(ctx, id, (await requireFilesPerson(ctx))._id)),
});
export const createFolder = mutation({
  args: { name: v.string(), parentId: v.optional(v.id("files")) },
  handler: async (ctx, args) => {
    const person = await requireFilesPerson(ctx),
      ownerId = await destination(ctx, person._id, args.parentId),
      value = name(args.name);
    await uniqueName(ctx, ownerId, args.parentId, value);
    return await ctx.db.insert("files", {
      name: value,
      parentId: args.parentId,
      ownerId,
      kind: "folder",
      mime: "",
      size: 0,
      revision: 1,
      updatedAt: Date.now(),
      trashed: false,
    });
  },
});
export const rename = mutation({
  args: { id: v.id("files"), name: v.string() },
  handler: async (ctx, args) => {
    const a = await access(ctx, args.id, (await requireFilesPerson(ctx))._id);
    if (!a.canEdit) throw new ConvexError("File is read only.");
    const value = name(args.name);
    await uniqueName(ctx, a.node.ownerId, a.node.parentId, value, args.id);
    await ctx.db.patch(args.id, { name: value, updatedAt: Date.now() });
  },
});
export const trash = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) => {
    const a = await access(ctx, id, (await requireFilesPerson(ctx))._id);
    if (!a.isOwner)
      throw new ConvexError("Only the owner can move files to trash.");
    await ctx.db.patch(id, { trashed: true, updatedAt: Date.now() });
  },
});
export const recipients = query({
  args: {},
  handler: async (ctx) => {
    const p = await requireFilesPerson(ctx);
    const fileApps = new Set(
      (await ctx.db.query("applications").collect())
        .filter((app) => app.icon === "files")
        .map((app) => app._id),
    );
    return (await ctx.db.query("people").collect())
      .filter(
        (person) =>
          !person.suspended &&
          person._id !== p._id &&
          (person.role === "admin" ||
            person.appIds.some((id) => fileApps.has(id))),
      )
      .map((person) => ({
        _id: person._id,
        name: person.name,
        email: person.email,
      }));
  },
});
export const grants = query({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) => {
    const a = await access(ctx, id, (await requireFilesPerson(ctx))._id);
    if (!a.isOwner) throw new ConvexError("Only the owner can manage sharing.");
    return await ctx.db
      .query("fileGrants")
      .withIndex("by_file_person", (q) => q.eq("fileId", id))
      .collect();
  },
});
export const share = mutation({
  args: {
    id: v.id("files"),
    personId: v.id("people"),
    role: v.union(v.literal("viewer"), v.literal("editor"), v.null()),
  },
  handler: async (ctx, args) => {
    const a = await access(ctx, args.id, (await requireFilesPerson(ctx))._id);
    if (!a.isOwner) throw new ConvexError("Only the owner can manage sharing.");
    if (args.personId === a.node.ownerId)
      throw new ConvexError("The owner already has access.");
    if (args.role) await checkFilesPerson(ctx, args.personId);
    const existing = await ctx.db
      .query("fileGrants")
      .withIndex("by_file_person", (q) =>
        q.eq("fileId", args.id).eq("personId", args.personId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    if (args.role)
      await ctx.db.insert("fileGrants", {
        fileId: args.id,
        personId: args.personId,
        role: args.role,
      });
  },
});
function server(secret: string) {
  if (
    !process.env.OVELA_FILES_SECRET ||
    secret !== process.env.OVELA_FILES_SECRET
  )
    throw new ConvexError("Files server authorization failed.");
}
const serverArgs = { secret: v.string(), personId: v.optional(v.id("people")) };
async function serverPerson(
  ctx: Ctx,
  args: { secret: string; personId?: Id<"people"> },
) {
  server(args.secret);
  return args.personId
    ? await checkFilesPerson(ctx, args.personId)
    : await requireFilesPerson(ctx);
}
export const serverGet = query({
  args: { id: v.id("files"), ...serverArgs },
  handler: async (ctx, args) => {
    const a = await access(ctx, args.id, (await serverPerson(ctx, args))._id);
    return {
      ...a.node,
      canEdit: a.canEdit,
      isOwner: a.isOwner,
      breadcrumbs: a.breadcrumbs,
    };
  },
});
export const uploadTarget = query({
  args: { parentId: v.optional(v.id("files")) },
  handler: async (ctx, args) => {
    const p = await requireFilesPerson(ctx);
    return { ownerId: await destination(ctx, p._id, args.parentId) };
  },
});
const contentArgs = {
  storageKey: v.string(),
  size: v.number(),
  mime: v.string(),
};
function content(args: { storageKey: string; size: number; mime: string }) {
  if (
    !/^[a-f0-9]{64}$/.test(args.storageKey) ||
    !Number.isSafeInteger(args.size) ||
    args.size < 0 ||
    args.size > 100 * 1024 * 1024 ||
    args.mime.length > 200
  )
    throw new ConvexError("Invalid file content.");
}
export const commitUpload = mutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("files")),
    ...contentArgs,
    ...serverArgs,
  },
  handler: async (ctx, args) => {
    const p = await serverPerson(ctx, args),
      ownerId = await destination(ctx, p._id, args.parentId),
      value = name(args.name);
    content(args);
    await uniqueName(ctx, ownerId, args.parentId, value);
    const id = await ctx.db.insert("files", {
      name: value,
      parentId: args.parentId,
      ownerId,
      kind: "file",
      mime: args.mime,
      size: args.size,
      storageKey: args.storageKey,
      revision: 1,
      updatedAt: Date.now(),
      trashed: false,
    });
    await ctx.db.insert("fileVersions", {
      fileId: id,
      revision: 1,
      storageKey: args.storageKey,
      size: args.size,
      createdAt: Date.now(),
    });
    return publicNode(await access(ctx, id, p._id));
  },
});
export const commitContent = mutation({
  args: {
    id: v.id("files"),
    expectedRevision: v.number(),
    officeLock: v.optional(v.string()),
    ...contentArgs,
    ...serverArgs,
  },
  handler: async (ctx, args) => {
    const p = await serverPerson(ctx, args),
      a = await access(ctx, args.id, p._id);
    if (!a.canEdit || a.node.kind !== "file")
      throw new ConvexError("File is read only.");
    const lock = await ctx.db
      .query("fileOfficeLocks")
      .withIndex("by_file", (q) => q.eq("fileId", args.id))
      .unique();
    if (
      (args.officeLock !== undefined &&
        (!lock ||
          lock.expiresAt <= Date.now() ||
          lock.value !== args.officeLock)) ||
      (lock && lock.expiresAt > Date.now() && lock.value !== args.officeLock)
    )
      throw new ConvexError(
        "REVISION_CONFLICT: File is open in the office editor.",
      );
    if (a.node.revision !== args.expectedRevision)
      throw new ConvexError("REVISION_CONFLICT");
    content(args);
    const revision = a.node.revision + 1;
    await ctx.db.patch(args.id, {
      storageKey: args.storageKey,
      size: args.size,
      mime: args.mime,
      revision,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("fileVersions", {
      fileId: args.id,
      revision,
      storageKey: args.storageKey,
      size: args.size,
      createdAt: Date.now(),
    });
    return publicNode(await access(ctx, args.id, p._id));
  },
});

export const restore = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) => {
    const person = await requireFilesPerson(ctx),
      node = await ctx.db.get(id);
    if (!node || node.ownerId !== person._id)
      throw new ConvexError("Only the owner can restore files.");
    if (node.parentId) await access(ctx, node.parentId, person._id);
    await uniqueName(ctx, node.ownerId, node.parentId, node.name, id);
    await ctx.db.patch(id, { trashed: false, updatedAt: Date.now() });
  },
});
export const move = mutation({
  args: { id: v.id("files"), parentId: v.optional(v.id("files")) },
  handler: async (ctx, args) => {
    const person = await requireFilesPerson(ctx),
      a = await access(ctx, args.id, person._id);
    if (!a.isOwner) throw new ConvexError("Only the owner can move files.");
    const ownerId = await destination(ctx, person._id, args.parentId);
    if (ownerId !== a.node.ownerId)
      throw new ConvexError("Move files within your own storage.");
    if (args.parentId) {
      const target = await access(ctx, args.parentId, person._id);
      if (target.breadcrumbs.some((n) => n._id === args.id))
        throw new ConvexError("A folder cannot contain itself.");
    }
    // Moving a whole subtree must not make its descendants inaccessible at the depth limit.
    const targetDepth = args.parentId
      ? (await access(ctx, args.parentId, person._id)).depth
      : 0;
    let frontier = [a.node],
      depth = targetDepth;
    while (frontier.length) {
      if (++depth > 60) throw new ConvexError("Folder nesting limit reached.");
      const children = await Promise.all(
        frontier
          .filter((node) => node.kind === "folder")
          .map((node) =>
            ctx.db
              .query("files")
              .withIndex("by_parent", (q) => q.eq("parentId", node._id))
              .collect(),
          ),
      );
      frontier = children.flat();
    }
    await uniqueName(ctx, ownerId, args.parentId, a.node.name, args.id);
    await ctx.db.patch(args.id, {
      parentId: args.parentId,
      updatedAt: Date.now(),
    });
  },
});
