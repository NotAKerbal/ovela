'use client';
import { useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useQuery, useAction, useMutation } from 'convex/react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Camera, KeyRound, LogOut } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import { prepareProfileImage } from '@/lib/profile-image';
import { ThemePicker } from './theme';
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
  return <><SiteHeader /><main className="management account-page page-wash-in"><h1>Your account</h1><div className="account-layout"><section className="account-details" aria-label="Profile and security">
    <div className="profile-identity"><button type="button" className="profile-avatar" aria-label={photo ? 'Change profile photo' : 'Upload profile photo'} aria-describedby="photo-help" aria-busy={photoBusy} disabled={photoBusy} onClick={() => fileInput.current?.click()}>{photo ? <img src={photo} alt="" /> : <span>{person?.name.slice(0, 1)}</span>}<span className="avatar-upload-hint"><Camera size={17} aria-hidden="true" /><span>{photoBusy ? 'Saving…' : photo ? 'Change' : 'Upload'}</span></span></button><div><h2>{person?.name}</h2><p className="muted">{person?.email}</p></div></div>
    <div className="profile-photo-actions"><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={changePhoto} disabled={photoBusy} />{photo && <button className="text-button" disabled={photoBusy} onClick={removePhoto}>Remove photo</button>}</div>
    <p id="photo-help" className="muted photo-help">JPG, PNG, or WebP. Up to 5 MB.</p>{photoMessage && <p role="status">{photoMessage}</p>}
    <div className="account-actions"><Dialog.Root open={passwordOpen} onOpenChange={closePassword}><Dialog.Trigger asChild><button className="mosaic-button"><KeyRound size={20} aria-hidden="true" />Change password</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="management-dialog" aria-describedby={undefined}><Dialog.Title>Change password</Dialog.Title><Dialog.Close className="close-preview" aria-label="Close" disabled={busy}><X size={20} /></Dialog.Close><form onSubmit={submit}><label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} /><small>At least 12 characters.</small></label><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>{message && <p role="status">{message}</p>}</form></Dialog.Content></Dialog.Portal></Dialog.Root>
    <button className="mosaic-button mosaic-button-clay" onClick={() => authClient.signOut()}><LogOut size={20} aria-hidden="true" />Sign out</button></div></section><ThemePicker /></div></main></>;
}
