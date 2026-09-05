'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import { SiteHeader } from './site-header';
export function SignIn({ joining = false }: { joining?: boolean }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const setup = useQuery(api.management.setupStatus);
  const [token, setToken] = useState(''), [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { const value = window.location.hash.slice(1); if (value) { setToken(decodeURIComponent(value)); history.replaceState(null, '', location.pathname); } }, []);
  useEffect(() => { if (isAuthenticated) router.replace('/'); }, [isAuthenticated, router]);
  const invitation = useQuery(api.management.invitationInfo, joining && token ? { token } : 'skip');
  useEffect(() => { if (invitation) { setEmail(invitation.email); setName(invitation.name); } }, [invitation]);
  const creating = setup?.needsSetup || joining;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = creating ? await authClient.signUp.email({ email: email.trim().toLowerCase(), name: name.trim(), password, fetchOptions: { headers: { 'x-ovela-invite': token } } }) : await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      if (result.error) setError(result.error.message ?? 'Could not sign in.'); else router.replace('/');
    } catch { setError('Could not reach Ovela. Please try again.'); } finally { setBusy(false); }
  }
  return <><SiteHeader /><main className="auth-main"><form className="auth-form" onSubmit={submit}><h1>{setup?.needsSetup ? 'Make yourself at home.' : joining ? 'Join Ovela' : 'Sign in'}</h1><p>{setup?.needsSetup ? 'Create the first administrator account.' : joining ? 'Your invitation opens the door.' : 'Your home, just a moment away.'}</p>
    {setup === undefined ? <div className="skeleton skeleton-row" aria-label="Loading" /> : <>{creating && <label>Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>}
    <label>Email<input type="email" required autoComplete="email" value={email} readOnly={joining && !!invitation} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" required minLength={creating ? 12 : undefined} autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />{creating && <small>At least 12 characters.</small>}</label>
    {setup.needsSetup && !joining && <label>Setup key<input type="password" required value={token} autoComplete="off" onChange={e => setToken(e.target.value)} /><small>Use the private setup link printed when Ovela starts.</small></label>}
    {joining && invitation === null && <p className="error-text" role="alert">This invitation is invalid or expired. Ask for a new link.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}<button disabled={busy || (joining && !invitation)} className="primary-button">{busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}</button></>}
  </form></main></>;
}
