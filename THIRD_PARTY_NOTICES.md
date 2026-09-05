# Bundled services

Ovela's application code is licensed under MIT. Its Docker package runs separate upstream services under their respective licenses:

- [Immich v3.1.0](https://github.com/immich-app/immich/tree/v3.1.0), GNU AGPL v3. Official server and machine-learning images are used without modification. The Immich Compose integration is adapted from that release's deployment configuration.
- [Convex backend](https://github.com/get-convex/convex-backend), upstream license terms apply to the official backend image.
- [PostgreSQL](https://www.postgresql.org/about/licence/) and the extensions included in [Immich's PostgreSQL image](https://github.com/immich-app/base-images).
- [Valkey](https://github.com/valkey-io/valkey/blob/unstable/COPYING), BSD 3-Clause.

These projects are independently maintained. Ovela is not an official Immich distribution or affiliated with the Immich team.
