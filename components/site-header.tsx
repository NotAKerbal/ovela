'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
export function SiteHeader({ onManageNavigate }: { onManageNavigate?: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const person = useQuery(api.management.viewer, isAuthenticated ? {} : 'skip');
  const pathname = usePathname();
  const photo = useQuery(api.profile.photo, person && !person.suspended ? {} : 'skip');
  return <header className="site-header"><Link className="brand" href="/" aria-label="Ovela home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>Ovela</span></Link>
    <div className="header-actions">{person && !person.suspended && <>{person.role === 'admin' && <Link className={pathname.startsWith('/manage') ? 'header-active' : ''} href="/manage" onNavigate={event => { if (onManageNavigate) { event.preventDefault(); onManageNavigate(); } }}>Manage</Link>}<Link className="account-link" href="/account">{photo && <img className="header-avatar" src={photo} alt="" />}<span>{person.name}</span></Link></>}</div></header>;
}
