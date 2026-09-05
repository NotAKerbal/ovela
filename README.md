# Ovela

A self-hosted home for independent applications, built with Next.js, Convex, and Better Auth. Warm stone surfaces, glass app tiles, and short watercolor transitions give the home and its management tools a shared identity.

## Start

Requires Docker with Compose v2.20+ and OpenSSL. Allow at least 8 GB RAM for the combined Ovela and Immich stack. No hosted service accounts are required.

```sh
git clone https://github.com/NotAKerbal/ovela.git
cd ovela
./ovela up
./ovela setup
```

Open the private setup link printed by the second command and create your first administrator account. The default app address is `http://127.0.0.1:3000`. The first build downloads dependencies and container images. Subsequent starts reuse them.

The stack runs Next.js, the Convex backend, and Immich in Docker. Photos opens the bundled Immich library with Ovela sign-in; see [Immich setup and storage](docs/immich.md). Better Auth runs inside Convex. Database and file data persist in a Docker volume; secrets remain in the ignored, owner-readable `.env.selfhost` file. See [self-hosting](docs/self-hosting.md) for domain configuration, backups, upgrades, and alternate ports.

## What works

- First-administrator setup with a private setup key.
- Email/password sign-in, password changes, and local profile photos.
- Shared Ovela sign-in for the bundled Immich photo library.
- People and application management using the approved visual designs.
- Copyable, email-bound invitations that expire after seven days. Reissuing or revoking a link invalidates it.
- Member/Admin roles, per-person app visibility, suspension, and last-active-admin protection.
- A live application catalog; changes appear in the home without a rebuild.
- Keyboard access, responsive layouts, loading skeletons, and reduced-motion support.

Invitations are copied and shared manually; Ovela does not send email. Photos connects to bundled Immich with shared Ovela sign-in. Files, Media, and Notes have no destination until configured. Photos grants are checked when signing into Immich; existing Immich sessions remain valid until they expire or are revoked in Immich. For unrelated applications, grants control launcher visibility only.

## Develop

Use Node.js 24 and npm. With the self-hosted stack running, configure the local CLI to target it using `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` in an ignored `.env.local`, alongside the public Convex URLs. Never commit that key.

```sh
npm ci
npm run dev:backend
# In another terminal; stop the Docker app first if both use port 3000.
npm run dev:web
```

For development without Docker, `CONVEX_AGENT_MODE=anonymous npx convex init` creates a local development backend without a Convex account. Keep `npx convex dev` running, and configure its `SITE_URL`, `BETTER_AUTH_SECRET`, `OVELA_SETUP_TOKEN`, and `OVELA_INTERNAL_CONVEX_SITE_URL` before creating accounts. For the usual native local backend, set the internal site URL to `http://127.0.0.1:3211`. This is a development alternative; `./ovela up` is the packaged self-hosting path.

```sh
npm test
npm run typecheck
npm run build
```

The focused backend tests exercise real Convex component data, session validation, role boundaries, invitation revocation and replacement races, and last-admin protection. The production Next.js build uses standalone output.

## Source map

- `components/haven.tsx`: app tiles and bounded pigment transitions.
- `components/management.tsx`: people, invitations, app access, and application editing.
- `convex/management.ts`: permission-checked queries and mutations.
- `convex/auth.ts` and `convex/betterAuth/`: Better Auth integration and atomic enrollment.
- `design/`: original image studies, prompts, and naming exploration. Historical images use the working name Mosaic Haven; the selected name is Ovela.

The prototype originally had a standalone hosted visual demo. Ovela's current implementation and startup flow are fully self-hosted and do not depend on that demo or its hosting provider.

## License

Ovela is [MIT licensed](LICENSE). Bundled services retain their own licenses; Immich is AGPLv3 and runs as an unmodified, separate service.
