import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { storagePath, parseRange } from './files-storage';
export async function fileContentResponse(request:Request,node:{kind:string;storageKey?:string;mime:string;revision:number;name:string}) {
  if(node.kind!=='file'||!node.storageKey)return new Response(null,{status:404});
  const file=storagePath(node.storageKey),info=await stat(file);
  const safeInline=/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm|ogg)|audio\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/.test(node.mime);
  const headers=new Headers({'cache-control':'private, no-store','content-type':safeInline?node.mime:'application/octet-stream','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'referrer-policy':'no-referrer','accept-ranges':'bytes','etag':`"${node.revision}"`,'content-disposition':`${safeInline&&!new URL(request.url).searchParams.has('download')?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(node.name.toWellFormed()).replace(/'/g,'%27')}`});
  const value=request.headers.get('range'),range=value?parseRange(value,info.size):undefined;
  if(range===null){headers.set('content-range',`bytes */${info.size}`);return new Response(null,{status:416,headers});}
  if(range){headers.set('content-range',`bytes ${range.start}-${range.end}/${info.size}`);headers.set('content-length',String(range.end-range.start+1));}
  else headers.set('content-length',String(info.size));
  return new Response(Readable.toWeb(createReadStream(file,range??undefined)) as ReadableStream,{status:range?206:200,headers});
}
