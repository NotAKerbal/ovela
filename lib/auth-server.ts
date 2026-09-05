import { convexBetterAuthNextJs } from '@convex-dev/better-auth/nextjs';
export const { handler } = convexBetterAuthNextJs({ convexUrl: process.env.CONVEX_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL!, convexSiteUrl: process.env.CONVEX_INTERNAL_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL! });
