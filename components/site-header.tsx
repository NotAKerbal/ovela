'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
export function SiteHeader({ action }: { action?: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const person = useQuery(api.management.viewer, isAuthenticated ? {} : 'skip');
  const pathname = usePathname();
  return <header className="site-header"><Link className="brand" href="/" aria-label="Ovela home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>Ovela</span></Link>
    <div className="header-actions">{action}{person && !person.suspended && <><Link className={pathname === '/' ? 'header-active' : ''} href="/">Home</Link>{person.role === 'admin' && <Link className={pathname.startsWith('/manage') ? 'header-active' : ''} href="/manage">Manage</Link>}<Link className="account-link" href="/account">{person.name}</Link></>}</div></header>;
}
