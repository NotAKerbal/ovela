import { convexBetterAuthNextJs } from '@convex-dev/better-auth/nextjs';
import { headers as requestHeaders } from 'next/headers';
export const { handler } = convexBetterAuthNextJs({ convexUrl: process.env.CONVEX_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL!, convexSiteUrl: process.env.CONVEX_INTERNAL_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL! });
class AuthTokenError extends Error {
  constructor(message:string,public status:number,public retryAfter?:string){super(message);}
}
export async function getToken():Promise<string|undefined> {
  const incoming=await requestHeaders(),cookie=incoming.get('cookie');
  if(!cookie)return undefined;
  const headers=new Headers({cookie,accept:'application/json'});
  for(const name of ['x-forwarded-for','x-real-ip']){const value=incoming.get(name);if(value)headers.set(name,value);}
  let response:Response;
  try {
    const site=process.env.CONVEX_INTERNAL_SITE_URL??process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;
    response=await fetch(`${site.replace(/\/$/,'')}/api/auth/convex/token`,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
  } catch {throw new AuthTokenError('Authentication is temporarily unavailable. Please try again.',503);}
  if(response.status===401||response.status===403)return undefined;
  // The library helper discards non-2xx errors, making rate limits look like sign-outs.
  if(response.status===429){const retry=response.headers.get('retry-after')??'60';throw new AuthTokenError('Too many requests. Please try again shortly.',429,/^\d{1,5}$/.test(retry)?retry:'60');}
  if(!response.ok)throw new AuthTokenError('Authentication is temporarily unavailable. Please try again.',503);
  const result=await response.json().catch(()=>null);
  if(typeof result?.token!=='string')throw new AuthTokenError('Authentication is temporarily unavailable. Please try again.',503);
  return result.token;
}
