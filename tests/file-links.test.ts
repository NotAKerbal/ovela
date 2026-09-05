/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import authSchema from '../convex/betterAuth/schema';
import { api, components } from '../convex/_generated/api';
import schema from '../convex/schema';
const modules=import.meta.glob('../convex/**/*.ts'),authModules=import.meta.glob('../convex/betterAuth/**/*.ts');
const secret='test-files-secret',tokenHash='a'.repeat(64);
function backend(){const t=convexTest(schema,modules);t.registerComponent('betterAuth',authSchema,authModules);process.env.OVELA_FILES_SECRET=secret;return t;}
async function person(t:ReturnType<typeof backend>,email:string){
  const now=Date.now(),user=await t.mutation(components.betterAuth.adapter.create,{input:{model:'user',data:{name:email,email,emailVerified:true,createdAt:now,updatedAt:now}}});
  const session=await t.mutation(components.betterAuth.adapter.create,{input:{model:'session',data:{userId:user._id,token:email,createdAt:now,updatedAt:now,expiresAt:now+60000}}});
  const app=await t.run(ctx=>ctx.db.insert('applications',{name:'Files',description:'',url:'/files',icon:'files',color:'sage',ink:'sage'}));
  const id=await t.run(ctx=>ctx.db.insert('people',{authId:user._id,name:email,email,role:'member',suspended:false,appIds:[app]}));
  return{id,client:t.withIdentity({subject:user._id,sessionId:session._id})};
}
const upload={secret,storageKey:'b'.repeat(64),size:10,mime:'text/plain'};
const share={secret,tokenHash,role:'viewer' as const,expiresInDays:7};
const publicArgs={secret,tokenHash,unlocked:false};
describe('Public file links',()=>{
  it('allows only owners to create/list/revoke links and never returns passwords or tokens in list',async()=>{
    const t=backend(),a=await person(t,'a@example.com'),b=await person(t,'b@example.com');
    const file=await a.client.mutation(api.files.commitUpload,{...upload,name:'note.md'});
    await a.client.mutation(api.files.share,{id:file._id,personId:b.id,role:'editor'});
    await expect(b.client.mutation(api.fileLinks.create,{...share,fileId:file._id})).rejects.toThrow('Only the owner');
    await expect(a.client.mutation(api.fileLinks.create,{...share,secret:'bad',fileId:file._id})).rejects.toThrow('authorization');
    const link=await a.client.mutation(api.fileLinks.create,{...share,fileId:file._id});
    const list=await a.client.query(api.fileLinks.list,{fileId:file._id});expect(list).toHaveLength(1);expect(list[0]).not.toHaveProperty('tokenHash');expect(list[0]).not.toHaveProperty('passwordHash');
    await expect(b.client.query(api.fileLinks.list,{fileId:file._id})).rejects.toThrow('Only the owner');
    await expect(b.client.mutation(api.fileLinks.revoke,{id:link.id})).rejects.toThrow('Only the owner');
    await a.client.mutation(api.fileLinks.revoke,{id:link.id});await expect(t.query(api.fileLinks.resolve,publicArgs)).rejects.toThrow('not found');
  });
  it('contains folder access, hides private ancestors, and rejects children moved outside a link',async()=>{
    const t=backend(),a=await person(t,'a@example.com');
    const privateRoot=await a.client.mutation(api.files.createFolder,{name:'Secret parent'}),folder=await a.client.mutation(api.files.createFolder,{name:'Shared folder',parentId:privateRoot});
    const file=await a.client.mutation(api.files.commitUpload,{...upload,name:'note.md',parentId:folder});
    await a.client.mutation(api.fileLinks.create,{...share,fileId:folder});
    const root=await t.query(api.fileLinks.resolve,publicArgs);expect(root.breadcrumbs.map(n=>n.name)).toEqual(['Shared folder']);expect(root.items[0]).not.toHaveProperty('storageKey');expect(root.items[0]).not.toHaveProperty('ownerId');
    await expect(t.query(api.fileLinks.resolve,{...publicArgs,id:privateRoot})).rejects.toThrow('not found');
    expect((await t.query(api.fileLinks.content,{...publicArgs,id:file._id})).name).toBe('note.md');
    await a.client.mutation(api.files.move,{id:file._id});await expect(t.query(api.fileLinks.content,{...publicArgs,id:file._id})).rejects.toThrow('not found');
  });
  it('checks passwords, expiry and owner access and durably bounds password guesses',async()=>{
    const t=backend(),a=await person(t,'a@example.com'),file=await a.client.mutation(api.files.commitUpload,{...upload,name:'note.md'});
    const link=await a.client.mutation(api.fileLinks.create,{...share,fileId:file._id,passwordHash:`scrypt:${'c'.repeat(32)}:${'d'.repeat(128)}`});
    await expect(t.query(api.fileLinks.resolve,publicArgs)).rejects.toThrow('SHARE_LOCKED');
    expect((await t.query(api.fileLinks.resolve,{...publicArgs,unlocked:true})).node.name).toBe('note.md');
    for(let i=0;i<8;i++)await t.mutation(api.fileLinks.passwordAttempt,{secret,tokenHash});
    await expect(t.mutation(api.fileLinks.passwordAttempt,{secret,tokenHash})).rejects.toThrow('SHARE_RATE_LIMIT');
    await t.run(ctx=>ctx.db.patch(a.id,{suspended:true}));await expect(t.query(api.fileLinks.resolve,{...publicArgs,unlocked:true})).rejects.toThrow('access denied');
    await t.run(ctx=>ctx.db.patch(a.id,{suspended:false,appIds:[]}));await expect(t.query(api.fileLinks.resolve,{...publicArgs,unlocked:true})).rejects.toThrow('access denied');
    await t.run(ctx=>ctx.db.patch(link.id,{expiresAt:Date.now()-1}));await expect(t.query(api.fileLinks.resolve,{...publicArgs,unlocked:true})).rejects.toThrow('not found');
  });
  it('scopes public edits, enforces viewer mode, immutable revisions and current office locks',async()=>{
    const t=backend(),a=await person(t,'a@example.com'),file=await a.client.mutation(api.files.commitUpload,{...upload,name:'note.md'});
    const link=await a.client.mutation(api.fileLinks.create,{...share,fileId:file._id});
    const save={...publicArgs,id:file._id,storageKey:'c'.repeat(64),size:4,expectedRevision:1};
    await expect(t.mutation(api.fileLinks.commitContent,save)).rejects.toThrow('read only');
    await t.run(ctx=>ctx.db.patch(link.id,{role:'editor'}));await t.mutation(api.fileLinks.commitContent,save);
    await expect(t.mutation(api.fileLinks.commitContent,save)).rejects.toThrow('REVISION_CONFLICT');
    await t.run(ctx=>ctx.db.insert('fileOfficeLocks',{fileId:file._id,value:'lock',expiresAt:Date.now()+60000}));
    await expect(t.mutation(api.fileLinks.commitContent,{...save,expectedRevision:2})).rejects.toThrow('REVISION_CONFLICT');
    const other=await a.client.mutation(api.files.commitUpload,{...upload,name:'outside.md'});
    await expect(t.mutation(api.fileLinks.commitContent,{...save,id:other._id})).rejects.toThrow('not found');
    await a.client.mutation(api.files.trash,{id:file._id});await expect(t.mutation(api.fileLinks.commitContent,{...save,expectedRevision:2})).rejects.toThrow('not found');
    expect((await t.run(ctx=>ctx.db.query('fileVersions').withIndex('by_file',q=>q.eq('fileId',file._id)).collect())).map(v=>v.revision)).toEqual([1,2]);
  });
});
