'use client';
import { useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { ConvexReactClient, ConvexProviderWithAuth } from 'convex/react';
import { authClient } from '@/lib/auth-client';
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? 'http://127.0.0.1:3210'));
  return <ConvexProviderWithAuth client={client} useAuth={useOvelaAuth}>{children}</ConvexProviderWithAuth>;
}

// Same-origin auth needs only this bridge; avoid the integration's stale AuthClient type.
function useOvelaAuth() {
  const { data, isPending } = authClient.useSession();
  const sessionId = data?.session.id;
  const activeSession = useRef(sessionId);
  activeSession.current = sessionId;
  const fetchAccessToken = useCallback(async () => {
    if (!sessionId) return null;
    try { const result = await authClient.convex.token({ fetchOptions: { throw: false } }); return activeSession.current === sessionId ? result.data?.token ?? null : null; }
    catch { return null; }
  }, [sessionId]);
  return useMemo(() => ({ isLoading: isPending, isAuthenticated: !!sessionId, fetchAccessToken }), [isPending, sessionId, fetchAccessToken]);
}
