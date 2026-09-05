'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
export function SiteHeader({ onManageNavigate, children, focused = false }: { onManageNavigate?: () => void; children?: ReactNode; focused?: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const person = useQuery(api.management.viewer, isAuthenticated ? {} : 'skip');
  const pathname = usePathname();
  const photo = useQuery(api.profile.photo, person && !person.suspended ? {} : 'skip');
  return <header className={`site-header${focused ? ' files-header' : ''}`}><Link className="brand" href="/" aria-label="Ovela home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>Ovela</span></Link>
    {children}<div className="header-actions">{person && !person.suspended && <>{!focused && person.role === 'admin' && <Link className={pathname.startsWith('/manage') ? 'header-active' : ''} href="/manage" onNavigate={event => { if (onManageNavigate) { event.preventDefault(); onManageNavigate(); } }}>Manage</Link>}<Link className="account-link" aria-label={person.name} href="/account"><span>{person.name}</span>{photo && <img className="header-avatar" src={photo} alt="" />}</Link></>}</div></header>;
}
