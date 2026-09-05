import { ConvexError, v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { currentPerson, requirePerson } from './security';

// Leave room for serialization under Convex's function argument limit.
const MAX_IMAGE_BYTES = 512 * 1024;
function imageType(image: ArrayBuffer) {
  const bytes = new Uint8Array(image);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ConvexError('Use a profile picture smaller than 512 KB.');
  const starts = (signature: number[], offset = 0) => signature.every((byte, i) => bytes[offset + i] === byte);
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (starts([255, 216, 255])) return 'image/jpeg';
  if (starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8)) return 'image/webp';
  throw new ConvexError('Choose a PNG, JPEG, or WebP image.');
}

export const photo = query({
  args: {},
  handler: async ctx => {
    const person = await currentPerson(ctx);
    return person && !person.suspended && person.photoId ? ctx.storage.getUrl(person.photoId) : null;
  },
});

export const uploadOwner = internalQuery({
  args: {},
  handler: async ctx => (await requirePerson(ctx))._id,
});

export const attach = internalMutation({
  args: { photoId: v.id('_storage'), personId: v.id('people') },
  handler: async (ctx, args) => {
    const person = await requirePerson(ctx);
    if (person._id !== args.personId) throw new ConvexError('Your account has changed. Please try again.');
    await ctx.db.patch(person._id, { photoId: args.photoId });
    if (person.photoId) await ctx.storage.delete(person.photoId);
  },
});

export const upload = action({
  args: { image: v.bytes() },
  handler: async (ctx, args): Promise<void> => {
    const personId = await ctx.runQuery(internal.profile.uploadOwner, {});
    const type = imageType(args.image);
    const photoId = await ctx.storage.store(new Blob([args.image], { type }));
    try {
      // Recheck the session and suspension after storage finishes.
      await ctx.runMutation(internal.profile.attach, { photoId, personId });
    } catch (error) {
      await ctx.storage.delete(photoId);
      throw error;
    }
  },
});

export const remove = mutation({
  args: {},
  handler: async ctx => {
    const person = await requirePerson(ctx);
    if (person.photoId) {
      await ctx.storage.delete(person.photoId);
      await ctx.db.patch(person._id, { photoId: undefined });
    }
  },
});

// Shared profile data is always scoped to the current Ovela session.
export const identity = query({
  args: {},
  handler: async ctx => {
    const person = await currentPerson(ctx);
    if (!person || person.suspended) return null;
    const url = person.photoId ? await ctx.storage.getUrl(person.photoId) : null;
    return { subject: person.authId, name: person.name, picture: publicProfilePicture(url) };
  },
});

export function publicProfilePicture(storageUrl: string | null) {
  if (!storageUrl || !process.env.SITE_URL) return null;
  const id = new URL(storageUrl).pathname.split('/').pop();
  return id ? `${process.env.SITE_URL.replace(/\/$/, '')}/api/profile-image/${encodeURIComponent(id)}` : null;
}
