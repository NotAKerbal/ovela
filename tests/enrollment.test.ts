import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from 'better-auth/react';
import { enrollmentToken } from '../lib/enrollment';

describe('setup key entry', () => {
  it.each(['a'.repeat(64), `  ${'a'.repeat(64)}\n`, `http://localhost:3000/sign-in#${'a'.repeat(64)}`])('sends only the key to signup', async value => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const valid = new Headers(init?.headers).get('x-ovela-invite') === 'a'.repeat(64);
      return new Response(JSON.stringify(valid ? { user: null, token: null } : { message: 'This invitation is invalid or expired.' }), { status: valid ? 200 : 403, headers: { 'content-type': 'application/json' } });
    });
    const client = createAuthClient({ baseURL: 'http://localhost:3000', fetchOptions: { customFetchImpl: fetcher } });
    const result = await client.signUp.email({ email: 'test@example.com', name: 'Test', password: 'test-password-only', fetchOptions: { headers: { 'x-ovela-invite': enrollmentToken(value) } } });
    expect(result.error).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects links without a key or with invalid encoding', () => {
    expect(enrollmentToken('http://localhost:3000/sign-in')).toBe('');
    expect(enrollmentToken('http://localhost:3000/sign-in#%zz')).toBe('');
  });
});
