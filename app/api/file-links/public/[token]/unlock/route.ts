import { api } from '@/convex/_generated/api';
import { filesSecret,assertFilesOrigin } from '@/lib/files-server';
import { boundedBody } from '@/lib/files-storage';
import { fileLinkClient,hashLinkToken,checkLinkPassword,linkUnlockCookie,fileLinkError } from '@/lib/file-links';
type Context={params:Promise<{token:string}>};
export async function POST(request:Request,{params}:Context){try{
  assertFilesOrigin(request);const {token}=await params;
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,2048)));
  if(typeof body.password!=='string'||body.password.length>256)return Response.json({error:'Enter the password.'},{status:400});
  const attempt=await fileLinkClient().mutation(api.fileLinks.passwordAttempt,{secret:filesSecret(),tokenHash:hashLinkToken(token)});
  if(attempt.passwordHash&&!await checkLinkPassword(body.password,attempt.passwordHash))return Response.json({error:'That password is incorrect.'},{status:401,headers:{'cache-control':'no-store'}});
  return new Response(null,{status:204,headers:{'set-cookie':linkUnlockCookie(request,token,attempt.expiresAt),'cache-control':'no-store'}});
}catch(error){return fileLinkError(error);}}
