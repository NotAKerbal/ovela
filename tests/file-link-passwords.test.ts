import { describe,expect,it,vi } from 'vitest';
vi.mock('../lib/files-server',()=>({filesSecret:()=> 'test-files-secret'}));
import { hashLinkPassword,checkLinkPassword,linkUnlockCookie,verifyLinkUnlock,newLinkToken } from '../lib/file-links';
describe('Share passwords and unlock cookies',()=>{
  it('salts password hashes and checks them without storing plaintext',async()=>{
    const first=await hashLinkPassword('correct horse'),second=await hashLinkPassword('correct horse');
    expect(first).not.toBe(second);expect(first).not.toContain('correct horse');
    expect(await checkLinkPassword('correct horse',first)).toBe(true);expect(await checkLinkPassword('wrong password',first)).toBe(false);
  });
  it('requires an unexpired server-signed cookie for this exact share token',()=>{
    const token=newLinkToken(),other=newLinkToken(),request=new Request('http://localhost/api/share');
    const cookie=linkUnlockCookie(request,token,Date.now()+60000);
    expect(cookie).toContain('HttpOnly');expect(cookie).toContain(`Path=/api/file-links/public/${token};`);expect(cookie).toContain('SameSite=Lax');
    const unlocked=new Request(request,{headers:{cookie:cookie.split(';')[0]}});
    expect(verifyLinkUnlock(unlocked,token)).toBe(true);expect(verifyLinkUnlock(unlocked,other)).toBe(false);
    expect(verifyLinkUnlock(new Request(request,{headers:{cookie:cookie.split(';')[0]+'0'}}),token)).toBe(false);
    const expired=linkUnlockCookie(request,token,Date.now()-1);
    expect(verifyLinkUnlock(new Request(request,{headers:{cookie:expired.split(';')[0]}}),token)).toBe(false);
  });
});
