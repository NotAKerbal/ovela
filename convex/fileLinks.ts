import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { access, checkFilesPerson, requireFilesPerson } from './files';
type Ctx = MutationCtx | QueryCtx;
export function requireLinkServer(secret: string) {
  if (!process.env.OVELA_FILES_SECRET || secret !== process.env.OVELA_FILES_SECRET) throw new ConvexError('Share authorization failed.');
}
export async function linkAccess(ctx: Ctx, linkId: Id<'fileLinks'>, id?: Id<'files'>) {
  const link = await ctx.db.get(linkId);
  if (!link || link.revoked || link.expiresAt <= Date.now()) throw new ConvexError('Share not found.');
  await checkFilesPerson(ctx, link.ownerId);
  const root = await access(ctx, link.fileId, link.ownerId);
  if (!root.isOwner) throw new ConvexError('Share not found.');
  const target = id ? await access(ctx, id, link.ownerId) : root;
  const rootIndex = target.breadcrumbs.findIndex(item => item._id === link.fileId);
  if (rootIndex < 0) throw new ConvexError('Share not found.');
  return { link, node: target.node, canEdit: link.role === 'editor', breadcrumbs: target.breadcrumbs.slice(rootIndex), rootId: link.fileId };
}
export async function resolveLink(ctx: Ctx, tokenHash: string, id: Id<'files'> | undefined, unlocked: boolean) {
  const link = await ctx.db.query('fileLinks').withIndex('by_token',q=>q.eq('tokenHash',tokenHash)).unique();
  if (!link) throw new ConvexError('Share not found.');
  const root = await linkAccess(ctx,link._id);
  if (link.passwordHash && !unlocked) throw new ConvexError('SHARE_LOCKED');
  return id && id !== link.fileId ? await linkAccess(ctx,link._id,id) : root;
}
const tokenArgs={secret:v.string(),tokenHash:v.string(),id:v.optional(v.id('files')),unlocked:v.boolean()};
function nodeMetadata(node: Awaited<ReturnType<typeof linkAccess>>['node']) {
  return {_id:node._id,name:node.name,kind:node.kind,mime:node.mime,size:node.size,revision:node.revision,updatedAt:node.updatedAt};
}
export const create = mutation({args:{secret:v.string(),fileId:v.id('files'),tokenHash:v.string(),passwordHash:v.optional(v.string()),role:v.union(v.literal('viewer'),v.literal('editor')),expiresInDays:v.number()},handler:async(ctx,args)=>{
  requireLinkServer(args.secret);
  const person=await requireFilesPerson(ctx),root=await access(ctx,args.fileId,person._id);
  if(!root.isOwner)throw new ConvexError('Only the owner can create share links.');
  if(!/^[a-f0-9]{64}$/.test(args.tokenHash)||!Number.isInteger(args.expiresInDays)||args.expiresInDays<1||args.expiresInDays>365)throw new ConvexError('Choose an expiry between 1 and 365 days.');
  if(args.passwordHash&&!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(args.passwordHash))throw new ConvexError('Invalid password protection.');
  if(await ctx.db.query('fileLinks').withIndex('by_token',q=>q.eq('tokenHash',args.tokenHash)).unique())throw new ConvexError('Create a new share link.');
  const createdAt=Date.now(),expiresAt=createdAt+args.expiresInDays*86400000;
  const id=await ctx.db.insert('fileLinks',{fileId:args.fileId,ownerId:person._id,tokenHash:args.tokenHash,passwordHash:args.passwordHash,role:args.role,createdAt,expiresAt,revoked:false});
  return{id,expiresAt};
}});
export const list = query({args:{fileId:v.id('files')},handler:async(ctx,{fileId})=>{
  const root=await access(ctx,fileId,(await requireFilesPerson(ctx))._id);if(!root.isOwner)throw new ConvexError('Only the owner can manage links.');
  return(await ctx.db.query('fileLinks').withIndex('by_file',q=>q.eq('fileId',fileId)).collect()).map(link=>({_id:link._id,createdAt:link.createdAt,expiresAt:link.expiresAt,revoked:link.revoked,hasPassword:!!link.passwordHash,role:link.role}));
}});
export const revoke = mutation({args:{id:v.id('fileLinks')},handler:async(ctx,{id})=>{
  const person=await requireFilesPerson(ctx),link=await ctx.db.get(id);if(!link||link.ownerId!==person._id)throw new ConvexError('Only the owner can revoke links.');await ctx.db.patch(id,{revoked:true});
}});
export const resolve = query({args:tokenArgs,handler:async(ctx,args)=>{
  requireLinkServer(args.secret);
  const result=await resolveLink(ctx,args.tokenHash,args.id,args.unlocked);
  const children=result.node.kind==='folder'?await ctx.db.query('files').withIndex('by_parent',q=>q.eq('parentId',result.node._id)).collect():[];
  return{locked:false as const,node:nodeMetadata(result.node),items:children.filter(node=>!node.trashed).map(nodeMetadata).sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='folder'?-1:1),breadcrumbs:result.breadcrumbs,rootId:result.rootId,expiresAt:result.link.expiresAt,role:result.link.role};
}});
export const content = query({args:tokenArgs,handler:async(ctx,args)=>{
  requireLinkServer(args.secret);const result=await resolveLink(ctx,args.tokenHash,args.id,args.unlocked);
  if(result.node.kind!=='file')throw new ConvexError('File not found.');
  return{...result.node,canEdit:result.canEdit&&editableLinkedFile(result.node)};
}});
export const passwordAttempt = mutation({args:{secret:v.string(),tokenHash:v.string()},handler:async(ctx,args)=>{
  requireLinkServer(args.secret);
  const link=await ctx.db.query('fileLinks').withIndex('by_token',q=>q.eq('tokenHash',args.tokenHash)).unique();if(!link)throw new ConvexError('Share not found.');await linkAccess(ctx,link._id);
  if(!link.passwordHash)return{passwordHash:null,expiresAt:link.expiresAt};
  const now=Date.now(),bucket=await ctx.db.query('fileLinkAttempts').withIndex('by_link',q=>q.eq('linkId',link._id)).unique();
  if(bucket&&bucket.windowStart>now-10*60000&&bucket.count>=8)throw new ConvexError('SHARE_RATE_LIMIT');
  if(bucket)await ctx.db.patch(bucket._id,bucket.windowStart>now-10*60000?{count:bucket.count+1}:{count:1,windowStart:now});
  else await ctx.db.insert('fileLinkAttempts',{linkId:link._id,count:1,windowStart:now});
  return{passwordHash:link.passwordHash,expiresAt:link.expiresAt};
}});
function editableLinkedFile(node: {name:string;mime:string}) {
  return node.mime.startsWith('text/') || /\.(docx?|xlsx?|pptx?|odt|ods|odp|md|markdown|txt|json|jsonc|ts|tsx|js|jsx|css|html|xml|yml|yaml|csv|log|sh|py|rs|go|toml|ini|sql|java|c|cpp|h)$/i.test(node.name);
}
export async function commitLinkContent(ctx: MutationCtx,args:{linkId:Id<'fileLinks'>;id:Id<'files'>;storageKey:string;size:number;expectedRevision:number;officeLock?:string}) {
  const a=await linkAccess(ctx,args.linkId,args.id);
  if(!a.canEdit||a.node.kind!=='file'||!editableLinkedFile(a.node))throw new ConvexError('Share is read only.');
  const lock=await ctx.db.query('fileOfficeLocks').withIndex('by_file',q=>q.eq('fileId',args.id)).unique();
  if((args.officeLock!==undefined&&(!lock||lock.expiresAt<=Date.now()||lock.value!==args.officeLock))||(lock&&lock.expiresAt>Date.now()&&lock.value!==args.officeLock))throw new ConvexError('REVISION_CONFLICT');
  if(a.node.revision!==args.expectedRevision)throw new ConvexError('REVISION_CONFLICT');
  if(!/^[a-f0-9]{64}$/.test(args.storageKey)||!Number.isSafeInteger(args.size)||args.size<0||args.size>100*1024*1024)throw new ConvexError('Invalid file content.');
  const revision=a.node.revision+1;
  await ctx.db.patch(args.id,{storageKey:args.storageKey,size:args.size,revision,updatedAt:Date.now()});
  await ctx.db.insert('fileVersions',{fileId:args.id,storageKey:args.storageKey,size:args.size,revision,createdAt:Date.now()});
  return{revision};
}
export const commitContent = mutation({args:{...tokenArgs,id:v.id('files'),storageKey:v.string(),size:v.number(),expectedRevision:v.number()},handler:async(ctx,args)=>{
  requireLinkServer(args.secret);const a=await resolveLink(ctx,args.tokenHash,args.id,args.unlocked);
  return commitLinkContent(ctx,{linkId:a.link._id,id:args.id,storageKey:args.storageKey,size:args.size,expectedRevision:args.expectedRevision});
}});
