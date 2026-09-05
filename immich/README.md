# Ovela Photos

Ovela Photos is the Immich web application with Ovela's visual design. The server,
photo processing, storage, OAuth integration, and mobile API remain Immich.

## Build and run

Run `./ovela up` from the Ovela repository. Docker builds the modified web client
and layers it onto the official `ghcr.io/immich-app/immich-server:v3.1.0` image.
The first build downloads source and dependencies; later builds reuse cached
layers. `SITE_URL` in `.env.selfhost` supplies the Ovela logo's home destination.
Changing it requires rebuilding the Immich image (also done by `./ovela up`).

The source baseline is Immich **v3.1.0**, commit
`8aa95c67470a02a8ddedf03c2e52963af33065ff`. `Dockerfile.immich` verifies the
downloaded source archive's SHA-256. The build uses the upstream dependency
lockfile and its pinned pnpm version. Files in `immich/overlay/` mirror paths in
the Immich repository and replace those files before compilation. Review these
overrides against upstream before changing the pinned version.

## License and corresponding source

The Immich application, including modifications under `immich/overlay/`, is
licensed under **GNU AGPL version 3**, provided in [LICENSE](LICENSE). These
modifications do not relicense Immich under the root Ovela project's MIT license.
Immich copyright and attribution notices are retained.

Each built installation serves its complete modified Immich source at
`/ovela-source.tgz`, linked from the web interface. The archive includes the
upstream source, dependency lockfiles, modified UI, upstream license, and build
instructions. Dependency installations and generated build output are excluded.
No deployment secrets, photos, or local configuration are copied into it.

To rebuild from that archive, extract it, use Node.js 24 and pnpm 11.13.1, and run:

```sh
pnpm --filter @immich/sdk --filter immich-web install --frozen-lockfile --force
VITE_OVELA_HOME_URL=http://127.0.0.1:3000 pnpm --filter @immich/sdk --filter immich-web build
```

The output is `web/build/`. Copy it over `/build/www` in the official Immich
v3.1.0 server image. Ovela's public repository also provides the tracked
overrides and deployment files: <https://github.com/NotAKerbal/ovela>.

## Account and profile

The header opens Ovela's `/account`, and legacy `/user-settings` links redirect
there. Photo preferences, devices, API keys, and locked-folder PIN controls live
at `/preferences` under More. Photos has one header; Ovela management remains
available from the hub.

The web client refreshes the signed-in Ovela name and picture on entry and when
Photos regains focus. It applies them only when the Ovela subject matches the
Immich OAuth identity. Configure `SITE_URL` and `IMMICH_URL` with the actual public
origins. Live sync requires the browser to send Ovela's session cookie, so use
same-site hostnames (or localhost ports). Across unrelated domains, browser
cookie restrictions can prevent live sync; the Immich profile remains the fallback.
OIDC also supplies the picture for Immich's initial avatar import. Native Immich
clients retain their own interface and upstream avatar synchronization behavior.
