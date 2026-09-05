'use client';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import { SignIn } from './sign-in';
import { SiteHeader } from './site-header';
export function PageSkeleton() { return <><SiteHeader /><main className="management" aria-label="Loading" aria-busy="true"><div className="skeleton skeleton-title" />{[0,1,2,3].map(i => <div className="skeleton skeleton-row" key={i} />)}</main></>; }
export function AuthGate({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const person = useQuery(api.management.viewer, isAuthenticated ? {} : 'skip');
  if (isLoading || (isAuthenticated && person === undefined)) return <PageSkeleton />;
  if (!isAuthenticated) return <SignIn />;
  if (!person || person.suspended || (admin && person.role !== 'admin')) return <><SiteHeader /><main className="management"><h1>{person?.suspended ? 'Your access is suspended' : 'Access unavailable'}</h1><p>{admin && person?.role === 'member' ? 'Only administrators can manage this home.' : 'Contact an administrator to restore your access.'}</p><button className="primary-button" onClick={() => authClient.signOut()}>Sign out</button></main></>;
  return children;
}
