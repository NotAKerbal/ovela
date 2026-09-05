# Photos with Immich

Ovela includes the official [Immich v3.1.0 release](https://github.com/immich-app/immich/releases/tag/v3.1.0) as its photo provider. The Photos application opens Ovela's reskin of the Immich web interface. Ovela manages sign-in through OpenID Connect. Photo storage, processing, search, uploads, albums, sharing, and viewer actions remain Immich. The native Immich mobile app is unchanged; the reskin applies to desktop and mobile web.

Run `./ovela up` to start the package. The launcher creates private database and OAuth client secrets, writes Immich's configuration into a Docker volume, and starts the services. Open Photos from Ovela after creating your Ovela administrator account. The default Immich address is `http://127.0.0.1:2283`.

## Storage

This installation starts with an empty library. It does not connect to another Immich instance, scan your existing folders, or migrate photos.

Immich receives your Ovela email and a stable account ID. This fresh installation accepts only Ovela sign-ins. A future migration must explicitly map imported accounts to their Ovela OAuth IDs before enabling sign-in, because Immich can automatically link an existing account by matching its email.

The package uses Docker volumes scoped to the Ovela Compose project:

| Volume | Contents |
| --- | --- |
| `immich_library` | Originals, thumbnails, transcoded video, and Immich's database backups |
| `immich_postgres` | PostgreSQL database |
| `immich_model_cache` | Downloaded machine learning models |
| `immich_config` | Generated private OAuth configuration |

With the default project name, Docker prefixes these names with `ovela_`. `./ovela down` keeps them. Back up the library and database together before upgrades. Never use `docker compose down -v` on an installation whose data you want to keep. Follow [Immich's backup guidance](https://docs.immich.app/administration/backup-and-restore/) when preparing a backup or migration.

## Hosting

Immich currently requires at least 6 GB of RAM and two CPU cores; 8 GB and four cores are recommended. Allow additional memory for Ovela and Convex. Linux is the recommended host. Machine learning models download when needed and remain cached locally. See the [official requirements](https://docs.immich.app/install/requirements/).

`IMMICH_PORT` defaults to `2283`, and `IMMICH_BIND_ADDRESS` defaults to `127.0.0.1`. Use a dedicated HTTPS hostname behind your reverse proxy for remote access and configure `IMMICH_URL` to match. Keep Ovela's `SITE_URL` reachable from both browsers and the Immich container. Immich's PostgreSQL and Valkey ports are private to Docker.

For local setup, Immich shares the Ovela app's network namespace. This lets Immich reach the same `127.0.0.1:3000` OIDC issuer that the browser uses. Its published port belongs to the app service. Use the launcher to update the full stack together when rebuilding the app so Docker recreates dependent services correctly.

Immich's OAuth and password-login settings come from the generated config and cannot be changed in its administration UI. Password login and unauthenticated administrator setup are disabled. Ovela controls who may sign in. Removing Ovela access prevents subsequent OIDC sign-ins; it does not automatically revoke an existing Immich session or delete a user's photos.

## Upgrades and license

The server and machine learning containers use the same exact release tag. PostgreSQL and Valkey are pinned to the images from that release's official Compose file. Review Immich's release notes and back up data before changing these versions; do not update only one of the two Immich containers.

Immich is a separate project distributed under the [GNU AGPL v3 license](https://github.com/immich-app/immich/blob/v3.1.0/LICENSE). This package builds a modified web client over the official server image. The UI modifications retain AGPLv3 and each installation offers its corresponding source from the sidebar's source-code link. See [the overlay build instructions](../immich/README.md).
