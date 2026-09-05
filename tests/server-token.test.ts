import { afterEach,describe,expect,it,vi } from 'vitest';
vi.hoisted(()=>{process.env.CONVEX_INTERNAL_SITE_URL='http://localhost:3211';});
vi.mock('@convex-dev/better-auth/nextjs',()=>({convexBetterAuthNextJs:()=>({handler:{},getToken:async()=>undefined})}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({cookie:'test-session-cookie','content-type':'multipart/form-data; boundary=demo','content-length':'999'})}));
import { getToken } from '../lib/auth-server';
afterEach(()=>vi.unstubAllGlobals());
describe('Server authentication token errors',()=>{
  it('preserves rate limiting instead of incorrectly treating the signed-in user as anonymous',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('Too many requests',{status:429,headers:{'retry-after':'60'}})));
    await expect(getToken()).rejects.toMatchObject({status:429,retryAfter:'60'});
  });
  it('forwards session cookies without request body headers and distinguishes backend outages',async()=>{
    const fetch=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response('Unavailable',{status:503}));vi.stubGlobal('fetch',fetch);
    await expect(getToken()).rejects.toMatchObject({status:503});
    const headers=new Headers(fetch.mock.calls[0][1]?.headers);expect(headers.get('cookie')).toBe('test-session-cookie');expect(headers.has('content-type')).toBe(false);expect(headers.has('content-length')).toBe(false);
  });
  it('returns no token only for an unauthorized session',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:401})));expect(await getToken()).toBeUndefined();
  });
});
