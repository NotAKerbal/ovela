# Ovela Photos verification

## Scope and references

Implemented the approved desktop and mobile concepts in the bundled Immich web
client. References: `design/immich/desktop-reference.png` and
`design/immich/mobile-reference.png`. The user's later direction supersedes the
mockup's two headers: search, upload, and the shared Ovela account now occupy one
header, without a Manage link.

The app retains real Immich upload, timeline, search, albums, sharing, and viewer
behavior. Ovela remains Next.js; the modified upstream photo client remains
Svelte. Native Immich apps are unchanged.

## Browser checks

Verified the running self-hosted services on localhost, using the signed-in
account. Desktop 1536×1024 and mobile 390×844 both have one app header, no
horizontal overflow, and a successfully loaded Ovela profile image. Mobile uses
bottom navigation and a compact search/upload/avatar header. Viewport overrides
were reset afterward.

Local screenshots: `design/immich/desktop-built.png` and
`design/immich/mobile-built.png`. They contain an actual account avatar and are
ignored by Git. Latest captures use the active dark theme. Earlier light-theme
comparison checked the paper palette, texture, spacing, and square photo cells.
The reference's sample gallery is not real library content; final captures show
the actual empty library, so this is not a pixel-for-pixel gallery comparison.

Clicked the account link and verified Ovela `/account`. Opening the legacy
Immich `/user-settings` URL also redirects there. Opened More → Photo preferences
and verified that devices, API keys, downloads, notifications, features, sharing,
and locked-folder PIN remain available while profile/password/OAuth editing is
removed. The avatar is matched by stable OAuth subject and refreshes on entry
and focus; unrelated users retain their own Immich avatars.

Earlier in this implementation, uploaded two generated reference images through
the real file chooser, verified filename search, viewer navigation, favorite,
and trash actions. Those test uploads were moved to Trash, leaving the library
empty. No existing photos were migrated or deleted. Large-library performance
has not been benchmarked. Browser logs showed upstream Svelte/deprecation and
embedded-browser wake-lock warnings; no blocking application error was observed.

## Fixes and automated checks

Fixed zero-width mobile content, mobile timeline geometry, excessive grain,
clipped storage information, and duplicated layouts during route transitions.
Restricted motion to short opacity/transform transitions with reduced-motion
support. Changed the source archive extension to `.tgz` to avoid transparent
browser decompression under an incorrect download extension.

Fixed the profile bridge to use a token-authenticated client against the internal
Docker backend address. Verified the actual profile picture in both viewports.
CORS admits only configured Ovela/Photos origins; anonymous and suspended
identities cannot receive a profile. Image proxy accepts opaque storage IDs and
raster image content only.

31 automated tests pass, including profile authorization, CORS, image proxy,
photo geometry, and existing auth flows. Ovela TypeScript and production build
pass. Immich TypeScript and Svelte validation pass with zero errors/warnings;
production image builds successfully. All six self-hosted services report
healthy after deployment.

## Limits

Live cross-app avatar refresh requires Ovela session cookies, so deploy under
same-site hostnames. Native Immich clients retain upstream synchronization
behavior. OAuth supplies a picture for the initial Immich avatar import; native
continuous avatar synchronization was not added. Immich modifications remain
AGPL, with complete corresponding source downloadable from the sidebar.

## Main-app dark mode and settings follow-up

Added System/Light/Dark appearance controls with browser persistence and a
pre-paint theme initializer. The default follows the device. Checked explicit
Light/Dark switching, persistence after navigation/reload, the dark home and
management pages, and the settled password dialog. The account page now uses
profile/security and appearance columns above 850px and stacks below that width.
Verified the desktop two-column layout. An earlier mobile home check at 390px
had no horizontal overflow; the final account mobile viewport override did not
target the intended tab, so its breakpoint was reviewed in CSS instead.

Immich has a visible Settings sidebar link and an administrator-only
Administration link in photo preferences. Clicked both through to System
Settings successfully. Ovela type checking and production builds pass; Immich
TypeScript/Svelte checks pass with zero errors/warnings. All services are healthy.
