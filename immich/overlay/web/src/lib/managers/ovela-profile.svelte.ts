import { authManager } from './auth-manager.svelte';
export const ovelaHome = (import.meta.env.VITE_OVELA_HOME_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
type Profile = { subject: string; name: string; picture: string | null };
let profile = $state<Profile | null>(null);
let pending: Promise<void> | undefined;
export const ovelaProfile = {
  get current() { return profile?.subject === authManager.user?.oauthId ? profile : null; },
  refresh() {
    return pending ??= (async () => {
      try {
        const response = await fetch(`${ovelaHome}/api/profile`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        profile = response.ok ? await response.json() : null;
      } catch { profile = null; }
      finally { pending = undefined; }
    })();
  },
};
