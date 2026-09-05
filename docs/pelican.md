# Pelican sign-in with Ovela

Ovela can provide OpenID Connect sign-in to an existing Pelican panel. It does not install Pelican, move servers, or change Pelican administrator roles.

Install Pelican's official [Generic OIDC Providers plugin](https://github.com/pelican-dev/plugins/tree/main/generic-oidc-providers) through the Hub or the [supported manual plugin installation flow](https://pelican.dev/docs/panel/advanced/plugins/). Enable it and create a provider with ID `ovela` in Pelican's authentication settings. The initial integration targets plugin 1.1.0 (commit `84e9d65252b937ad8f686c4ef75edd9e4518e59c`) and `kovah/laravel-socialite-oidc` 0.8.0.

In `.env.selfhost`, set `PELICAN_URL` to the panel's public HTTPS origin, such as `https://games.example.com`. `./ovela up` generates `OVELA_PELICAN_CLIENT_SECRET` when this optional integration is enabled. Keep that secret private and enter the same value in the panel's OIDC configuration.

Deployment registers a Games application in Ovela and an OAuth client with these settings:

- Client ID: `pelican`.
- Provider ID in Pelican: `ovela`.
- Issuer/discovery base: `https://YOUR_OVELA_DOMAIN/api/auth`.
- Callback: `https://YOUR_PELICAN_DOMAIN/auth/oauth/callback/ovela`.
- Scopes: `openid email profile`.
- Confidential client with `client_secret_post` authentication.
- JWT signature verification enabled in Pelican.

The supported Pelican generic OIDC provider currently does not send PKCE. Accordingly, only the Pelican client has `requirePKCE: false`; Photos continues to require PKCE. Keep HTTPS, provider state/nonce verification, client authentication, and JWT verification enabled.

Assign Games access in Ovela to permit sign-in. Authorization, token issuance, and userinfo check the specific application's grant and account suspension independently. A Photos grant does not grant Games access. Ovela administrators may access either app, but Ovela never sends a Pelican administrator role. Existing game-server roles and ownership stay in Pelican. Already established Pelican sessions must be expired/revoked through Pelican separately.

Ovela does not claim that an invitation proves email ownership: `email_verified` is the real Better Auth value. Disable automatic linking of an unknown OIDC identity to an existing Pelican account solely by matching email. An administrator can explicitly link the known Ovela subject to the intended existing account after verifying its identity; new-account creation, if enabled, must keep ordinary non-administrator defaults and grant no servers automatically.

Clearing `PELICAN_URL` or its secret and redeploying disables the registered OAuth client. No Pelican accounts or servers are removed. The existing Games application entry is preserved for administrators to manage.
