# Run Ovela at home

Ovela runs Next.js, Better Auth, and Convex on your own machine. The backend uses a persistent Docker volume for its SQLite database and stored files. No Convex Cloud account or hosted authentication service is needed.

Install Docker with Compose v2.20 or newer and OpenSSL, clone the repository, and run:

```sh
./ovela up
./ovela setup
```

The first command starts Convex, generates secrets, deploys the backend functions, builds Next.js, and starts the app. The second prints your private first-administrator link. Open that link to create the initial administrator. Treat it as a password until setup is complete. It cannot provision another administrator after the first account exists.

By default, Ovela is available at http://127.0.0.1:3000. Convex listens on localhost ports 3210 and 3211. The first build downloads images and npm packages, so it needs internet access and takes longer than later starts. Runtime data and authentication stay on your host. Next.js telemetry and the Convex beacon are disabled.

## Configure your domain

Before the first start, copy `.env.example` to `.env.selfhost` and change the public origins. For example:

```dotenv
SITE_URL=https://home.example.com
NEXT_PUBLIC_CONVEX_URL=https://convex.example.com
NEXT_PUBLIC_CONVEX_SITE_URL=https://convex-http.example.com
IMMICH_URL=https://photos.example.com
```

Point your reverse proxy at host ports 3000, 3210, 3211, and 2283 respectively. Enable WebSocket forwarding for the Convex endpoint. Use HTTPS for all public origins. The browser must be able to reach the public Convex URL; container-only names such as `backend` will not work there. No managed reverse proxy is required.

The default host bindings only accept local connections. If your reverse proxy runs on a different machine or needs published Docker host ports, set `BIND_ADDRESS` and `IMMICH_BIND_ADDRESS` to your host's LAN address. Keep the admin key private; the Convex endpoint serves both authenticated application traffic and administrative requests protected by that key.

Port bindings are configurable using `APP_PORT`, `CONVEX_PORT`, `CONVEX_SITE_PORT`, and `IMMICH_PORT`. If you use direct LAN access, include the matching ports in all three public URLs. Rerun `./ovela up` after editing origins because Next.js compiles public variables into its browser bundle. Keep origins free of trailing slashes.

## Everyday commands

```sh
./ovela status  # Show running services
./ovela logs    # Follow service logs
./ovela down    # Stop containers and retain data
./ovela up      # Deploy current source and start again
```

The generated `.env.selfhost` holds your backend admin key, session secret, and setup token. It has owner-only permissions and is excluded from Git and Docker builds. Retain this file when upgrading. Deleting it generates replacement secrets and can invalidate sessions.

## Backups and upgrades

Back up `.env.selfhost`, the `convex_data` Docker volume, and [Immich's library and database](immich.md#storage). Stop the stack with `./ovela down` before taking a filesystem backup of the volume so the SQLite copy is consistent. Store backups outside this machine and verify that you can restore them. Never use `docker compose down -v` unless you intend to delete application data.

The backend image is pinned by digest. Before changing that digest or pulling application changes, take a backup and read upstream migration notes. Then run `./ovela up` to deploy functions and rebuild the frontend. Restoring an older application version may require restoring its matching database backup.

This first release manages Ovela accounts and application visibility. It provides shared sign-in for bundled Immich, but does not enforce permissions inside unrelated applications. Those applications still need their own access controls.

The deployment follows the [official Convex self-hosted Docker configuration](https://github.com/get-convex/convex-backend/tree/main/self-hosted).
