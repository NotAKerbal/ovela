# Office editing in Ovela Files

Ovela embeds the self-hosted Collabora CODE editor for DOCX, XLSX, PPTX and its other supported office formats. Files keeps the Ovela header and folder navigation outside the editor. Collabora uses its compact formatting toolbar inside the shared Ovela header. The duplicate document title/menu row, ruler, and status bar start hidden. Use Tools in the Ovela header to reveal the complete Office menus. The properties sidebar starts closed and can be reopened from the editor. Home mode suppresses welcome and feedback dialogs. Set `COLLABORA_HOME_MODE=false` to remove its 20-connection and 10-document limits; CODE then displays those dialogs.

`./ovela up` includes `compose.files.yaml` and starts the office service alongside Ovela and Photos. Custom Compose installations can omit this overlay to run Files without Office editing.

| Setting | Default | Purpose |
| --- | --- | --- |
| `COLLABORA_URL` | `http://127.0.0.1:9980` | Browser-facing office origin |
| `COLLABORA_INTERNAL_URL` | `http://collabora:9980` | Discovery endpoint reachable from the app container |
| `OVELA_WOPI_URL` | `http://app:3000` | File callback origin reachable from Collabora |
| `COLLABORA_PORT` | `9980` | Published local office port |
| `COLLABORA_HOME_MODE` | `true` | Suppress welcome/feedback dialogs; limits 20 concurrent connections and 10 open documents |
| `COLLABORA_TLS_TERMINATION` | `false` | Set `true` when an HTTPS reverse proxy fronts Collabora |

The default binds to loopback. For a remote installation, set `COLLABORA_URL` to the HTTPS office domain and `SITE_URL` to the HTTPS Ovela domain. Proxy Collabora's HTTP and WebSocket routes, including `/browser`, `/hosting` and `/cool`. Preserve WebSocket upgrade headers. The office frame's allowed parent follows `SITE_URL`; the WOPI allowed host follows the internal app address. Do not expose the internal WOPI callback origin as a separate public site.

The app must have the same `OVELA_FILES_SECRET` configured as the Convex backend for disk-backed file operations. The main Files setup handles that secret and mounts persistent file storage.

## Saving and permissions

Opening a document creates a random, file-scoped eight-hour session. Only its hash is stored in Convex. The token is posted to the office frame, and Collabora presents it on WOPI callbacks. Ovela rechecks the user's account, Files access, and current sharing permission on every callback. Reopen the document after a session expires.

Ovela implements CheckFileInfo, GetFile, PutFile, Lock, RefreshLock, Unlock, and GetLock. Shared viewers open read-only. Editors can save. Writes require an active matching lock and the current file revision; conflicts return an error to Collabora instead of silently overwriting another edit. Saved versions use the same storage and revision history as other Ovela files. Ovela follows Collabora's `Doc_ModifiedStatus` events to guard navigation and browser closing while changes are unsaved. Messages must come from the configured office origin and the active frame. The office editor reports its own saving state.

Rename, Save As and relative-file creation are not advertised through WOPI. Use the Files workspace to rename or create documents. Blank DOCX, XLSX and PPTX templates are bundled locally under `public/file-templates`.

Collabora CODE is the development edition. Its practical deployment limits and support policy differ from the supported Collabora Online offering. The office engine keeps its own license; Ovela's integration code is MIT.

References: [Collabora CODE](https://www.collaboraonline.com/code/), [Collabora security](https://www.collaboraonline.com/security/), [WOPI CheckFileInfo](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/files/checkfileinfo), [WOPI locking](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/files/lock).

## Appearance

Office receives the current Ovela light/dark theme and palette through supported
Collabora `ui_defaults` and `css_variables` form parameters. Menus, ruler, status
bar, and properties sidebar start hidden; formatting remains directly available.
The header Tools button toggles the full menus through postMessage without
reloading the document. Theme is selected when the document opens; changing the
app theme does not reload an open document or discard unsaved edits.

## Shared links

Public links open office documents with the same viewer or editor permission selected by the owner. Password-protected links must be unlocked first. Guest office sessions stay scoped to the shared file or folder; each read and save rechecks the link, its expiry, revocation, and current access. Revoking a link also blocks existing guest office sessions from further reads and saves.
