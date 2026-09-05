import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),mutation:vi.fn(),store:vi.fn(),body:vi.fn()}));
vi.mock('../lib/files-server',()=>({filesSecret:()=> 'secret',assertFilesOrigin:()=>{}}));
vi.mock('@/lib/file-links',async ()=>({...await import('../lib/file-links'),fileLinkClient:()=>({query:mocks.query,mutation:mocks.mutation})}));
vi.mock('@/lib/files-server',()=>({filesSecret:()=> 'secret',assertFilesOrigin:()=>{}}));
vi.mock('@/convex/_generated/api',()=>({api:{fileLinks:{content:'content',commitContent:'commit'}}}));
vi.mock('@/lib/files-response',()=>({fileContentResponse:vi.fn()}));
vi.mock('@/lib/files-storage',()=>({boundedBody:mocks.body,storeFile:mocks.store,storagePath:()=>'',parseRange:()=>null}));
import { PUT } from '../app/api/file-links/public/[token]/content/[id]/route';
const token='a'.repeat(64);
function request(){return new Request(`http://localhost/api/file-links/public/${token}/content/file`,{method:'PUT',headers:{'if-match':'1'},body:'replacement'});}
const context={params:Promise.resolve({token,id:'file'})};
beforeEach(()=>{vi.resetAllMocks();mocks.body.mockResolvedValue(new Uint8Array([1]));mocks.store.mockResolvedValue('b'.repeat(64));});
describe('Public content writes',()=>{
  it('returns403 for viewer links before accepting any uploaded bytes',async()=>{
    mocks.query.mockResolvedValue({canEdit:false});const result=await PUT(request(),context);
    expect(result.status).toBe(403);expect(mocks.body).not.toHaveBeenCalled();expect(mocks.store).not.toHaveBeenCalled();expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it('returns404 for an out-of-scope or revoked file without storing content',async()=>{
    mocks.query.mockRejectedValue(new Error('Share not found.'));expect((await PUT(request(),context)).status).toBe(404);expect(mocks.store).not.toHaveBeenCalled();
  });
  it('returns409 when the final atomic save detects a conflicting revision',async()=>{
    mocks.query.mockResolvedValue({canEdit:true});mocks.mutation.mockRejectedValue(new Error('REVISION_CONFLICT'));
    expect((await PUT(request(),context)).status).toBe(409);
    expect(mocks.mutation.mock.calls[0][1]).toMatchObject({id:'file',unlocked:false,expectedRevision:1,size:1});
  });
});
