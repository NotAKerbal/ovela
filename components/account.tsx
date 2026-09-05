'use client';
import { useState, type FormEvent } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import { SiteHeader } from './site-header';
export function Account() {
  const person = useQuery(api.management.viewer);
  const [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(''); try { const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }); setMessage(result.error?.message ?? 'Password updated. Other sessions have been signed out.'); if (!result.error) { setCurrentPassword(''); setNewPassword(''); } } catch { setMessage('Could not update your password.'); } finally { setBusy(false); } }
  return <><SiteHeader /><main className="management account-page"><h1>Your account</h1><p>{person?.name}</p><p className="muted">{person?.email}</p><form onSubmit={submit}><h2>Change password</h2><label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} /><small>At least 12 characters.</small></label><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>{message && <p role="status">{message}</p>}</form><hr /><button className="text-button" onClick={() => authClient.signOut()}>Sign out</button></main></>;
}
