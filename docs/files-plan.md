# Ovela Files: design and implementation proposal

Status: proposal, September 5, 2026. Five Image Gen concepts are saved under
`design/files/`. No Files implementation or services have been installed yet.
The prompt set is `design/files/prompts.json`; built-in Image Gen generated each
screen using the existing Ovela Photos mockup as a material/brand reference.

## Product shape

One Files application inside the existing Next.js app, initially `/files`.
Better Auth owns sign-in, Ovela owns profile and sharing, and all editor routes
retain the same navigation and theme. Opening a file selects an editor by type.
Use stable file IDs for URLs so renaming or moving does not break links.

The concepts depict five complementary screens, not competing design options:

- `file-browser.png`: quick table navigation, folders, file types, sharing and
  upload controls. Grid view for visual folders; virtualized list for dense ones.
- `office-editor.png`: an Ovela document header surrounding an embedded office
  editor, illustrated with DOCX. XLSX and PPTX use their corresponding editor
  modes. The exact ribbon is provisional, and the generated 'Saved quietly'
  label should become simply 'Saved'.
- `media-preview.png`: large media stage with restrained playback controls,
  previous/next navigation and an optional filmstrip. Information is closed by
  default. Both light and dark surrounding themes should be supported.
- `code-editor.png`: syntax highlighting, file tree, find/replace and save. No
  terminal, runtime, language server or IDE features needed for the initial scope.
- `markdown-editor.png`: one live-preview writing pane. Syntax appears around
  the selection; inactive headings, links and lists render as formatted text.
  A Source mode always exposes the original Markdown.

## Proposed stack

| Area | Choice | Reason / boundary |
| --- | --- | --- |
| Application | Existing Next.js, React, Ovela components | Shared header, theme, account and routing; load editors only when opened. |
| File browser | Custom UI with TanStack Virtual; add TanStack Table if needed | Keep Ovela styling and keyboard navigation; virtualize long lists and paginate backend queries. |
| Identity and metadata | Existing Better Auth and self-hosted Convex | Owners, folders, grants, revisions, upload status and live list updates. |
| File transfer and storage | A small Node file service with `@tus/server`, `@tus/file-store`, Uppy Core + Tus | Resumable uploads to an explicitly mounted local volume. Separate streaming bytes from metadata queries. |
| Office | Collabora CODE first, behind a WOPI adapter | Real DOCX/XLSX/PPTX editing and collaboration. Evaluate ONLYOFFICE against the same fixture files before finalizing if compatibility is poor. |
| Images / PDFs | Native image viewer with zoom; Sharp thumbnails; PDF.js | Generate derivatives locally, lazy-load PDF rendering, preserve original files. |
| Video / audio | Native HTML media initially, HTTP Range support; FFmpeg worker for unsupported codecs | Seek without downloading whole files. Transcode on demand with bounded concurrency; add HLS.js if adaptive streaming is needed. |
| Code | CodeMirror 6 | Load JSON, TypeScript and other language support on demand, save plain text with revision checks. |
| Markdown | CodeMirror 6 + Markdown parser and custom decorations | Best match for exact text with syntax hidden outside the active selection. The live-preview behavior is custom work, not a turnkey CodeMirror feature. |

CodeMirror's decoration API can replace syntax with widgets and styled spans.
Use its syntax tree and selection ranges rather than regex-based HTML rewriting.
Test IME composition, cursor movement, multiline selections, undo, pasted text,
fenced code, lists, tables and links. Preserve Markdown text exactly instead of
round-tripping through a rich-text serializer. Milkdown is worth evaluating if
we later prefer conventional WYSIWYG editing over source-preserving live preview.
CodeMirror's old GitHub repositories were archived during its 2026 Forgejo move;
that does not mean the editor was abandoned. Track current upstream releases.

## Files and sharing

Each user receives a private root namespace, not a raw server filesystem mount.
Use a nodes table with ownerId, parentId, name, kind and currentRevisionId. Store
immutable revision blobs under generated IDs in the mounted data volume, never
under user-supplied paths. A shared file stays one file and appears in the
recipient's Shared with me view. Original formats remain exportable.

Start with owner, viewer and editor. Only the owner manages grants initially.
Folder access is inherited; direct child grants can add access. Moving content
must clearly show any resulting permission change. Do not silently move another
person's owned files into a different ownership tree. Application access and
file access are separate checks.

Every listing, thumbnail, download, upload, save and office callback is checked
against current permissions. Private file content must not inherit the public
capability-URL policy used for profile pictures. Upload authorization reserves
quota and binds the upload to user, target folder, maximum size and expiry.
Validate authorization on resumptions and completion as well as creation.

Phase one shares with existing Ovela users. Add revocable, expiring public view
links after the internal model works. Public edit links and anonymous upload
folders are separate future features. Shared downloads cannot prevent recipients
from retaining copies they have already received.

## Save integrity and previews

A save uploads a new immutable revision, then atomically advances metadata from
an expected prior revision. Reject stale saves with a visible conflict rather
than overwriting another editor. File bytes and Convex metadata are not one
transaction: use staged uploads, idempotent finalization and orphan cleanup.
'Saved' appears only after durable bytes and the revision pointer are committed.
Keep a recoverable local draft during a failed text save and purge it on sign-out.

Office editing uses per-file locks and short-lived user/file-scoped WOPI tokens.
Implement CheckFileInfo, GetFile, PutFile, Lock/RefreshLock/Unlock and the required
save-as operations. Recheck grants on save. Collabora gets scoped access, not the
user's full Ovela session. Validate iframe message origins and configured WOPI
hosts. Office and text editors must respect the same revision/locking model.

Use a durable preview job record with retry/lease state in Convex and a bounded
worker process. Thumbnail jobs must not block upload completion or web requests.
Treat uploaded HTML, SVG and Markdown HTML as untrusted content; do not execute
it in Ovela's authenticated origin. Render safe previews or offer a download.
Do not promise native playback for every video format; fall back to a generated
compatible proxy or a clear download option. Originals remain untouched.

## Office tradeoffs

Collabora CODE suits the homelab prototype and supports Microsoft Office and
OpenDocument formats. Collabora explicitly positions CODE for home/testing/small
teams and does not recommend it for production environments; supported Collabora
Online is the production offering. Source and executable distribution terms must
be checked separately. Ovela's MIT license does not replace engine licenses.

Ovela controls the shell and supported theme integration. The office ribbon and
editing canvas belong to the embedded engine; matching a mockup exactly may need
more than supported theming. Test representative DOCX, XLSX and PPTX round trips,
fonts, formulas, charts, presentation layouts, collaboration, failed saves,
revocation and mobile behavior before promising Office compatibility.

ONLYOFFICE remains a credible alternative. Its 9.4 release removed the old hard
Community connection limit and simplified deployment. Current Community licensing
FAQs still describe mobile-web and rebranding restrictions; verify the selected
edition and version before choosing it. Do not reuse the obsolete hard
20-connection-limit claim.

## Self-hosting and delivery order

Extend `./ovela up` with a Files profile. Reuse the existing app/backend and add
one file-service container with a host-mount option such as OVELA_FILES_PATH.
Run preview workers from the same image as a separate service so crashes and
heavy conversion do not block requests. Make the office container optional so
basic file storage starts without loading an office suite. Pin dependencies and
images. No external editor, storage, thumbnail or font CDN is required at runtime.
An S3-compatible storage adapter can be added later without changing file IDs.

Back up both the file volume and Convex metadata using a consistent checkpoint;
include a restore command and verify it. A blob directory without the ownership,
folder and revision metadata is not a complete backup.

1. **First usable slice:** open Files from the hub; private roots; create folder;
   upload/resume; browse; rename/move; download; trash/restore; user sharing;
   quota checks; file history foundation. Verify isolation with two users.
2. **Preview and text:** images/PDF/video direct play; thumbnails; CodeMirror
   code editing; Markdown source then live preview; save conflicts and recovery.
3. **Office proof:** boot Collabora and complete one DOCX/XLSX/PPTX edit-save-reopen
   cycle through Ovela storage before polishing toolbar colors. Then verify
   two-person collaboration and failed-save recovery.
4. **Polish and deployment:** mobile editor interactions, public view links,
   conversion fallbacks, keyboard navigation, large folders, restart/restore QA.

For mobile, use a single-column file list, metadata hidden until requested, and
an optional file drawer in editors. Office mobile editing needs its own engine
verification. Desktop visual concepts are not evidence that mobile editing works.

## Primary references

- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction)
- [Uppy Tus](https://uppy.io/docs/tus/)
- [Node tus server and storage adapters](https://github.com/tus/tus-node-server)
- [Tus resumable protocol](https://tus.io/protocols/resumable-upload)
- [Collabora CODE](https://www.collaboraonline.com/code/)
- [Collabora theme integration](https://www.collaboraonline.com/blog/theming-of-collabora-online/)
- [Collabora distribution terms](https://www.collaboraonline.com/terms/collabora-online-mplv2/)
- [WOPI concepts](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/concepts)
- [WOPI PutFile and lock conflicts](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/files/putfile)
- [ONLYOFFICE 9.4 release](https://community.onlyoffice.com/t/onlyoffice-docs-9-4-released-license-update-dark-document-for-sheets-horizontal-lines-new-slide-themes-transitions-and-more/19810)
- [ONLYOFFICE Community FAQ](https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx)
- [CodeMirror decorations](https://codemirror.net/examples/decoration/)
- [CodeMirror upstream migration](https://discuss.codemirror.net/t/codemirrors-migration-to-forgejo/9706)
- [Milkdown](https://milkdown.dev/docs/api/components)
- [Sharp](https://sharp.pixelplumbing.com/)
- [PDF.js](https://mozilla.github.io/pdf.js/getting_started/)
- [FFmpeg](https://ffmpeg.org/ffmpeg.html)
- [HLS.js](https://github.com/video-dev/hls.js)

## Unified workspace revision

The initial five concepts differed too much in navigation, theme and typography.
Follow-up concepts in `design/files/unified/` align the office, code and Markdown
views around the same light-theme header, breadcrumbs, share action, avatar,
folder-drawer toggle and save status. Editors default to a closed folder drawer;
code does not get a separate IDE sidebar. Media can darken its content stage while
retaining the shared Ovela shell and theme. Returning to the browser should
preserve the folder, selection and scroll position.

The user accepts the existing office tool density if supported integration APIs
cannot simplify it further. Prefer a supported, functional Collabora toolbar over
a fork solely to hide controls. The mockups illustrate the shared shell; exact
office toolbar behavior and autosave acknowledgements need integration validation.

## First implementation

The shared Next.js workspace, private Convex metadata, volume-backed bytes,
viewer/editor folder sharing, uploads, folder operations, native previews,
CodeMirror code/Markdown editors, and Collabora WOPI integration are implemented.
Sidebar navigation has Files and Shared with me, folder paths/tree, resize and
hide gestures, a toggle button, and Cmd/Ctrl+B outside editors.

The broader roadmap above is not a claim that every item shipped: resumable
uploads, thumbnail/transcode workers, global search, restore-history UI,
trash browsing, and Immich library browsing remain follow-up work. Current
uploads are bounded multipart requests (100 MiB), and text buffers are limited
to 2 MiB. Retained versions do not have garbage collection yet.

## Share links

Shareable links can grant viewing/downloading or editing of supported text and
Office files. The owner chooses the permission, optional password, and expiration.
Links are revocable and scoped to the selected file or folder. Password-protected
links prompt before revealing file metadata. Public editing does not grant file
management or sharing permissions.
