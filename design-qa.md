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

## Files workspace

Implemented against `design/files/unified/` with the later sidebar revision:
Files and Shared with me, folder breadcrumbs/tree, one Ovela header, and shared
light/dark theme tokens. The actual Collabora compact toolbar remains upstream;
its properties sidebar starts closed. Slide thumbnails remain part of the slide
editor. No Immich-library sidebar item is shown in this release.

Verified on the local Docker stack:

- Real folder creation, multipart JSON/image upload, JSON editing/save, and
  Markdown live-preview editing/save/reopen.
- Authenticated PNG preview decoded at its original 1487 by 1058 dimensions.
- DOCX browser text edits, XLSX cell edits, and PPTX slide insertion persisted
  through Collabora/WOPI. Inspected the saved OOXML blobs independently: the
  expected document/cell text and two-slide presentation were present.
- Sidebar toggle, Cmd+B outside editors, pointer resizing from 264 to 345 pixels,
  dragging closed, and mobile drawer opening/closing.
- Phone viewport 390 by 844: list visible, no horizontal page overflow. Found and
  fixed the fixed-sidebar grid-placement bug during this check.
- File trash and Undo restored the sample file. Sharing dialog opens with
  viewer/editor controls; cross-user isolation, inherited sharing/revocation,
  disabled accounts, revisions, and locks have functional Convex test coverage.
- Next production build and typecheck pass; 44 tests pass. Live cross-user
  browser sharing and video codec playback were not exercised.

Current limits: 100 MiB non-resumable uploads, 2 MiB text buffers, native browser
media support, no thumbnails/transcoding, no version restore or trash browser.
Collabora home mode defaults to 20 connections/10 documents. Office is embedded, not a fork of its rendering UI. Screenshots
with the signed-in user's avatar were inspected locally and are not committed.

## Files chrome and readability follow-up

Removed the persistent success banner and Back/Download row. Notifications float
briefly without moving the editor; errors and Undo remain actionable. Breadcrumbs
handle folder navigation and File actions contains Download. Collabora now receives
Ovela's theme/palette through its supported form API; menubar, ruler, status bar,
and properties panel start hidden. Verified in the browser that Tools reveals the
full menus and hides them again without reloading the document. Default dark Office
now shows the Ovela header directly above one formatting toolbar.

Sidebar now uses an indented ARIA folder tree, with no duplicate sidebar path or
Folders heading. Verified an expanded parent and nested Reference folder. Existing
resize/hide behavior is retained. Markdown uses explicit theme-aware syntax colors;
verified selected heading source is readable in dark mode. Preview/Source, icon
Undo/Redo, save status, and icon Save share one compact row. Typecheck, production
build, and all 44 tests pass. Theme changes apply to Office when reopening the file,
so changing theme never silently reloads an unsaved document.


## Files sharing and navigation refinement

- Full suite: 61 tests pass, with typecheck and self-hosted production build passing.
- Verified password rejection/unlock, shared text editing and persisted saves, read-only text controls, folder browsing, and link revocation in the browser.
- Opened a password-protected folder link, edited its DOCX through Collabora, saved, then reopened and confirmed the text persisted.
- Test links were revoked after verification. Public-link authorization tests cover expiry, descendant scope, viewer/editor permissions, password throttling, and Office callback revocation.
- Expanded sidebar folders include files as selectable leaves. Markdown markers use a muted color while selected-line text stays legible. Office menu toggle follows Share in the main header.
- Fixed token endpoint rate limits being misreported as sign-outs. Token refresh now has a separate request budget; server errors preserve 429 and Retry-After.

## File gestures and menus

- Right-click in either file layout opens Ovela actions at the pointer. Browser verified menu contents and dismissal.
- Double-clicking an editable file's breadcrumb title opens Rename, with F2 available when focused. The current editor stays mounted.
- New closes on outside pointer press or Escape. Browser verified outside dismissal.
- File rows have no inter-row dividers; the column heading separator remains.
- Holding an owned file/folder for one second arms a move into a visible writable folder. Pointer movement before the hold cancels, as do Escape, cancellation, lost capture, or window blur. Drops use the existing permission-checked move mutation.
- 67 tests pass, including six gesture-controller tests. Typecheck and local production build pass. The held pointer gesture was exercised by controller tests rather than automated native browser dragging.

## Cross-pane file moves

- File list/grid and expanded sidebar branches share one drag controller and a registry of mounted rows, so either pane can supply a source or folder target.
- Hold delay reduced to 500 ms. Folder disclosure arrows retain their expand/collapse behavior.
- 68 tests pass, including resolving a destination outside the source list through the shared registry. Typecheck passes.
