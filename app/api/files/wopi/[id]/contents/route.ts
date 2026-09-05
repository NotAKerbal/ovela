import { api } from "@/convex/_generated/api";
import { officeAccess } from "@/lib/files-office";
import { filesSecret, writeFileForPerson } from "@/lib/files-server";
import { boundedBody, readStoredFile, storeFile } from "@/lib/files-storage";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const session = await officeAccess(request, id);
    const file = await session.client.query(api.filesOffice.serverGet, { fileId: session.fileId, token: session.token, secret: filesSecret() });
    if (!file.storageKey) return new Response(null, { status: 404 });
    const bytes = await readStoredFile(file.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.length),
        "cache-control": "no-store",
        "X-WOPI-ItemVersion": String(file.revision),
      },
    });
  } catch {
    return new Response(null, { status: 401 });
  }
}
export async function POST(request: Request, context: Context) {
  let session: Awaited<ReturnType<typeof officeAccess>>;
  const { id } = await context.params;
  try {
    session = await officeAccess(request, id);
  } catch {
    return new Response(null, { status: 401 });
  }
  if (!session.canEdit) return new Response(null, { status: 403 });
  if (request.headers.get("x-wopi-override") !== "PUT")
    return new Response(null, { status: 501 });
  const officeLock = request.headers.get("x-wopi-lock") ?? "";
  try {
    const lock = await session.client.mutation(api.filesOffice.lock, {
      fileId: session.fileId,
      token: session.token,
      operation: "GET_LOCK",
      value: "",
    });
    if (!officeLock || lock.value !== officeLock)
      return new Response(null, {
        status: 409,
        headers: { "X-WOPI-Lock": lock.value },
      });
    const bytes = await boundedBody(request);
    const file = session.shareLinkId
      ? await session.client.mutation(api.filesOffice.commitShared, { token: session.token, fileId: session.fileId, storageKey: await storeFile(bytes), size: bytes.length, expectedRevision: session.file.revision, officeLock, secret: filesSecret() })
      : await writeFileForPerson(id, bytes, session.file.revision, session.personId!, officeLock);
    return new Response(null, {
      status: 200,
      headers: { "X-WOPI-ItemVersion": String(file.revision) },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("PAYLOAD_TOO_LARGE"))
      return new Response(null, { status: 413 });
    if (error instanceof Error && error.message.includes("REVISION_CONFLICT")) {
      const lock = await session.client
        .mutation(api.filesOffice.lock, {
          fileId: session.fileId,
          token: session.token,
          operation: "GET_LOCK",
          value: "",
        })
        .catch(() => ({ value: "" }));
      return new Response(null, {
        status: 409,
        headers: { "X-WOPI-Lock": lock.value },
      });
    }
    return new Response(null, { status: 500 });
  }
}
