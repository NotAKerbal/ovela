'use client';
import { useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useQuery, useAction, useMutation } from 'convex/react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import { prepareProfileImage } from '@/lib/profile-image';
import { SiteHeader } from './site-header';
export function Account() {
  const person = useQuery(api.management.viewer);
  const photo = useQuery(api.profile.photo);
  const upload = useAction(api.profile.upload), remove = useMutation(api.profile.remove);
  const fileInput = useRef<HTMLInputElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false), [photoMessage, setPhotoMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  function closePassword(open: boolean) {
    if (busy) return;
    setPasswordOpen(open); setCurrentPassword(''); setNewPassword(''); setMessage('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      setMessage(result.error?.message ?? 'Password updated. Other sessions have been signed out.');
      if (!result.error) { setCurrentPassword(''); setNewPassword(''); }
    } catch { setMessage('Could not update your password.'); } finally { setBusy(false); }
  }
  async function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setPhotoBusy(true); setPhotoMessage('');
    try { await upload({ image: await prepareProfileImage(file) }); setPhotoMessage('Profile photo updated.'); }
    catch (error) { setPhotoMessage(error instanceof Error && !('data' in error) ? error.message : 'Could not upload your photo. Please try again.'); }
    finally { setPhotoBusy(false); }
  }
  async function removePhoto() {
    setPhotoBusy(true); setPhotoMessage('');
    try { await remove({}); setPhotoMessage('Profile photo removed.'); }
    catch { setPhotoMessage('Could not remove your photo. Please try again.'); }
    finally { setPhotoBusy(false); }
  }
  return <><SiteHeader /><main className="management account-page page-wash-in"><h1>Your account</h1>
    <div className="profile-identity"><div className="profile-avatar" aria-label="Profile picture">{photo ? <img src={photo} alt="" /> : <span>{person?.name.slice(0, 1)}</span>}</div><div><h2>{person?.name}</h2><p className="muted">{person?.email}</p></div></div>
    <div className="profile-photo-actions"><input ref={fileInput} type="file" className="sr-only" tabIndex={-1} accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={changePhoto} disabled={photoBusy} /><button className="text-button" disabled={photoBusy} onClick={() => fileInput.current?.click()}>{photoBusy ? 'Saving photo…' : photo ? 'Change photo' : 'Upload photo'}</button>{photo && <button className="text-button" disabled={photoBusy} onClick={removePhoto}>Remove photo</button>}</div>
    <p className="muted photo-help">JPG, PNG, or WebP. Up to 5 MB.</p>{photoMessage && <p role="status">{photoMessage}</p>}
    <hr /><Dialog.Root open={passwordOpen} onOpenChange={closePassword}><Dialog.Trigger asChild><button className="text-button">Change password</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="management-dialog" aria-describedby={undefined}><Dialog.Title>Change password</Dialog.Title><Dialog.Close className="close-preview" aria-label="Close" disabled={busy}><X size={20} /></Dialog.Close><form onSubmit={submit}><label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} /><small>At least 12 characters.</small></label><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>{message && <p role="status">{message}</p>}</form></Dialog.Content></Dialog.Portal></Dialog.Root>
    <hr /><button className="text-button" onClick={() => authClient.signOut()}>Sign out</button></main></>;
}
