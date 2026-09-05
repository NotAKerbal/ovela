# Authentication boundaries

Ovela uses Better Auth for its sessions and a confidential OpenID Connect client for bundled Immich. Only administrators or members with the bundled Photos grant may authorize a new Immich sign-in. Suspension and app grants are checked again during token issuance and UserInfo requests. Immich maintains its own sessions; removing an Ovela grant does not revoke sessions already issued by Immich.

Client registration is disabled. The bundled client accepts only its configured web redirect URLs, requires PKCE, and stores a hash of its client secret. OIDC signing keys are stored separately from Convex authentication keys.

The compatible OAuth Provider 1.6 release is affected by [GHSA-p2fr-6hmx-4528](https://github.com/advisories/GHSA-p2fr-6hmx-4528). Ovela rejects resource indicators at the OAuth endpoints and restricts the allowed audience to its own issuer. Endpoint tests cover rejection on authorization and token requests. This workaround remains necessary until the Convex adapter supports the patched Better Auth release. `npm audit` still reports the upstream advisory.

The package starts Immich with an empty database, password login disabled, and unauthenticated administrator setup disabled. Immich links users by OIDC subject after first sign-in. Before any future migration, explicitly plan the mapping between existing Immich users and Ovela subjects; Immich also supports email matching, which must not be treated as proof of ownership for imported accounts.
