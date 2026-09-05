import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { filesSecret } from '@/lib/files-server';
import { fileLinkClient,hashLinkToken,verifyLinkUnlock,fileLinkError } from '@/lib/file-links';
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,{params}:Context){try{
  const {token}=await params,id=new URL(request.url).searchParams.get('id')??undefined;
  const result=await fileLinkClient().query(api.fileLinks.resolve,{secret:filesSecret(),tokenHash:hashLinkToken(token),id:id as Id<'files'>|undefined,unlocked:verifyLinkUnlock(request,token)});
  return Response.json(result,{headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
}catch(error){if(error instanceof Error&&error.message.includes('SHARE_LOCKED'))return Response.json({locked:true},{headers:{'cache-control':'no-store'}});return fileLinkError(error);}}
