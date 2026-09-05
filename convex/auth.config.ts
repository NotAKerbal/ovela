import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config';
import type { AuthConfig } from 'convex/server';
const provider = getAuthConfigProvider();
// Docker verifies signatures over its internal network while keeping the public issuer.
if (process.env.OVELA_INTERNAL_CONVEX_SITE_URL) {
  provider.jwks = `${process.env.OVELA_INTERNAL_CONVEX_SITE_URL}/api/auth/convex/jwks`;
}
export default { providers: [provider] } satisfies AuthConfig;
