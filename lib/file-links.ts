import { createHash,createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { filesSecret } from './files-server';
const scrypt=promisify(scryptCallback);
export function fileLinkClient(){return new ConvexHttpClient(process.env.CONVEX_INTERNAL_URL??process.env.NEXT_PUBLIC_CONVEX_URL!);}
export function hashLinkToken(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Share not found.');return createHash('sha256').update(token).digest('hex');}
export function newLinkToken(){return randomBytes(32).toString('hex');}
export async function hashLinkPassword(password:string){
  if(password.length<8||password.length>256)throw new Error('Use a password between 8 and 256 characters.');
  const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function checkLinkPassword(password:string,hash:string){
  if(password.length>256||!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash))return false;
  const [,salt,digest]=hash.split(':'),key=await scrypt(password,salt,64) as Buffer;
  return timingSafeEqual(key,Buffer.from(digest,'hex'));
}
function cookieName(token:string){return `ovela_share_${hashLinkToken(token).slice(0,24)}`;}
function signature(value:string){return createHmac('sha256',filesSecret()).update(`ovela-share-unlock:${value}`).digest('hex');}
export function verifyLinkUnlock(request:Request,token:string){
  const name=cookieName(token),raw=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
  if(!raw)return false;
  const [hash,expires,proof]=raw.split('.');
  if(hash!==hashLinkToken(token)||!/^\d+$/.test(expires??'')||Number(expires)<=Date.now()||!/^[a-f0-9]{64}$/.test(proof??''))return false;
  return timingSafeEqual(Buffer.from(signature(`${hash}.${expires}`),'hex'),Buffer.from(proof,'hex'));
}
export function linkUnlockCookie(request:Request,token:string,linkExpiry:number){
  const expires=Math.min(linkExpiry,Date.now()+6*3600000),value=`${hashLinkToken(token)}.${expires}`;
  const secure=new URL(process.env.SITE_URL??request.url).protocol==='https:';
  return `${cookieName(token)}=${value}.${signature(value)}; Path=/api/file-links/public/${token}; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor((expires-Date.now())/1000))}${secure?'; Secure':''}`;
}
export function fileLinkError(error:unknown){
  const message=error instanceof Error?error.message:'';
  if(message.includes('SHARE_LOCKED'))return Response.json({locked:true},{status:401,headers:{'cache-control':'no-store'}});
  if(message.includes('SHARE_RATE_LIMIT'))return Response.json({error:'Too many password attempts. Try again in 10 minutes.'},{status:429,headers:{'retry-after':'600','cache-control':'no-store'}});
  if(message.includes('REVISION_CONFLICT'))return Response.json({error:'This file changed or is open in another editor. Reload before saving.'},{status:409,headers:{'cache-control':'no-store'}});
  if(message.includes('read only'))return Response.json({error:'This link does not allow editing.'},{status:403});
  if(message.includes('PAYLOAD_TOO_LARGE'))return Response.json({error:'File is too large.'},{status:413});
  return Response.json({error:'This share link is unavailable or has expired.'},{status:404,headers:{'cache-control':'no-store'}});
}
