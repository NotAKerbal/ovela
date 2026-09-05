import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { filesClient,filesSecret,assertFilesOrigin,filesError } from '@/lib/files-server';
import { newLinkToken,hashLinkToken,hashLinkPassword } from '@/lib/file-links';
import { boundedBody } from '@/lib/files-storage';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertFilesOrigin(request);const client=await filesClient();
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,4096)));
  if(typeof body.fileId!=='string'||(body.password!==undefined&&typeof body.password!=='string'))throw new Error('Invalid share link settings.');
  const token=newLinkToken(),passwordHash=body.password?await hashLinkPassword(body.password):undefined;
  const result=await client.mutation(api.fileLinks.create,{secret:filesSecret(),fileId:body.fileId as Id<'files'>,tokenHash:hashLinkToken(token),passwordHash,role:body.role??'viewer',expiresInDays:body.expiresInDays??7});
  return Response.json({...result,url:`${new URL(process.env.SITE_URL??request.url).origin}/s/${token}`},{status:201,headers:{'cache-control':'no-store'}});
}catch(error){return filesError(error);}}
export async function GET(request:Request){try{
  const fileId=new URL(request.url).searchParams.get('fileId');if(!fileId)throw new Error('Choose a file.');
  const links=await(await filesClient()).query(api.fileLinks.list,{fileId:fileId as Id<'files'>});return Response.json({links},{headers:{'cache-control':'no-store'}});
}catch(error){return filesError(error);}}
export async function DELETE(request:Request){try{
  assertFilesOrigin(request);const client=await filesClient(),body=JSON.parse(new TextDecoder().decode(await boundedBody(request,1024)));
  await client.mutation(api.fileLinks.revoke,{id:body.id as Id<'fileLinks'>});return new Response(null,{status:204});
}catch(error){return filesError(error);}}
