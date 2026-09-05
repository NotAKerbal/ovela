import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { filesSecret,assertFilesOrigin } from '@/lib/files-server';
import { fileLinkClient,hashLinkToken,verifyLinkUnlock,fileLinkError } from '@/lib/file-links';
import { boundedBody,storeFile } from '@/lib/files-storage';
import { fileContentResponse } from '@/lib/files-response';
type Context={params:Promise<{token:string;id:string}>};
export async function GET(request:Request,{params}:Context){try{
  const {token,id}=await params;
  const node=await fileLinkClient().query(api.fileLinks.content,{secret:filesSecret(),tokenHash:hashLinkToken(token),id:id as Id<'files'>,unlocked:verifyLinkUnlock(request,token)});
  return await fileContentResponse(request,node);
}catch(error){return fileLinkError(error);}}
export async function PUT(request:Request,{params}:Context){try{
  assertFilesOrigin(request);const {token,id}=await params,expected=request.headers.get('if-match')?.replace(/^"|"$/g,'');
  if(!expected||!/^\d+$/.test(expected))return Response.json({error:'A file revision is required.'},{status:428});
  const client=fileLinkClient(),args={secret:filesSecret(),tokenHash:hashLinkToken(token),id:id as Id<'files'>,unlocked:verifyLinkUnlock(request,token)};
  const node=await client.query(api.fileLinks.content,args);if(!node.canEdit)throw new Error('Share is read only.');
  const bytes=await boundedBody(request),storageKey=await storeFile(bytes);
  return Response.json(await client.mutation(api.fileLinks.commitContent,{...args,storageKey,size:bytes.length,expectedRevision:Number(expected)}),{headers:{'cache-control':'no-store'}});
}catch(error){return fileLinkError(error);}}
