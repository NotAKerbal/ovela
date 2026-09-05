import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), verify: vi.fn(), hash: vi.fn(), filesClient: vi.fn(), getFile: vi.fn() }));
vi.mock('@/convex/_generated/api', () => ({ api: { fileLinks: { content: 'content' }, filesOffice: { createShared: 'createShared', create: 'create' } } }));
vi.mock('@/lib/files-server', () => ({ filesSecret: () => 'test-secret', filesClient: mocks.filesClient, getFile: mocks.getFile }));
vi.mock('@/lib/files-office', () => ({ officeClient: () => ({ query: mocks.query, mutation: mocks.mutation }) }));
vi.mock('@/lib/file-links', () => ({ verifyLinkUnlock: mocks.verify, hashLinkToken: mocks.hash }));
vi.mock('@/lib/files-storage', () => import('../lib/files-storage'));
vi.mock('@/lib/office-discovery', () => import('../lib/office-discovery'));
import { launchOffice } from '../lib/office-launch';
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('COLLABORA_URL', 'http://office.test:9980'); vi.stubEnv('SITE_URL', 'http://ovela.test');
  mocks.verify.mockReturnValue(false); mocks.hash.mockReturnValue('hash-of-route-token');
});
afterEach(() => vi.unstubAllEnvs());
describe('public office launch', () => {
  it('does not accept a client supplied unlock or substitute another token for the URL token', async () => {
    mocks.query.mockRejectedValue(new Error('SHARE_LOCKED'));
    const request = new Request('http://ovela.test/api/file-links/public/route-token/office', { method: 'POST', headers: { origin: 'http://ovela.test' }, body: JSON.stringify({ fileId: 'document-id', shareToken: 'different-token', unlocked: true }) });
    expect((await launchOffice(request, 'route-token')).status).toBe(401);
    expect(mocks.hash).toHaveBeenCalledWith('route-token');
    expect(mocks.verify).toHaveBeenCalledWith(request, 'route-token');
    expect(mocks.query).toHaveBeenCalledWith('content', expect.objectContaining({ unlocked: false }));
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.filesClient).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests and oversized input before authorizing access', async () => {
    const cross = new Request('http://ovela.test/api/files/office', { method: 'POST', headers: { origin: 'http://other.test' }, body: '{}' });
    expect((await launchOffice(cross, 'route-token')).status).toBe(403);
    const large = new Request('http://ovela.test/api/files/office', { method: 'POST', body: 'x'.repeat(4097) });
    expect((await launchOffice(large, 'route-token')).status).toBe(413);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
