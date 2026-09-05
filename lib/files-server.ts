import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getToken } from "@/lib/auth-server";
import { storeFile } from "@/lib/files-storage";
export function filesSecret() {
  const value = process.env.OVELA_FILES_SECRET;
  if (!value) throw new Error("Files storage is not configured.");
  return value;
}
export async function filesClient(token?: string) {
  token ??= (await getToken()) ?? undefined;
  if (!token) throw new Error("UNAUTHORIZED");
  const client = new ConvexHttpClient(
    process.env.CONVEX_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL!,
  );
  client.setAuth(token);
  return client;
}
function serverClient() {
  return new ConvexHttpClient(
    process.env.CONVEX_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL!,
  );
}
export async function getFile(id: string, token?: string) {
  return (await filesClient(token)).query(api.files.serverGet, {
    id: id as Id<"files">,
    secret: filesSecret(),
  });
}
export async function getFileForPerson(id: string, personId: string) {
  return serverClient().query(api.files.serverGet, {
    id: id as Id<"files">,
    personId: personId as Id<"people">,
    secret: filesSecret(),
  });
}
export async function writeFile(
  id: string,
  bytes: Uint8Array,
  expectedRevision: number,
  token?: string,
) {
  const client = await filesClient(token),
    node = await client.query(api.files.serverGet, { id: id as Id<"files">, secret: filesSecret() });
  if (!node.canEdit) throw new Error("File is read only.");
  const storageKey = await storeFile(bytes);
  return client.mutation(api.files.commitContent, {
    id: id as Id<"files">,
    storageKey,
    size: bytes.length,
    mime: node.mime,
    expectedRevision,
    secret: filesSecret(),
  });
}
export async function writeFileForPerson(
  id: string,
  bytes: Uint8Array,
  expectedRevision: number,
  personId: string,
  officeLock?: string,
) {
  const node = await getFileForPerson(id, personId);
  if (!node.canEdit) throw new Error("File is read only.");
  const storageKey = await storeFile(bytes);
  return serverClient().mutation(api.files.commitContent, {
    id: id as Id<"files">,
    storageKey,
    size: bytes.length,
    mime: node.mime,
    expectedRevision,
    personId: personId as Id<"people">,
    secret: filesSecret(),
    officeLock,
  });
}
export function assertFilesOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(process.env.SITE_URL ?? request.url).origin)
    throw new Error("Files access denied.");
}
export function filesError(error: unknown) {
  const message = error instanceof Error ? error.message : "Files unavailable.";
  if (error && typeof error === 'object' && 'status' in error && (error.status === 429 || error.status === 503)) {
    const headers = new Headers({'cache-control':'no-store'});
    if (error.status === 429 && 'retryAfter' in error && typeof error.retryAfter === 'string') headers.set('retry-after', error.retryAfter);
    return Response.json({error:message}, {status:error.status, headers});
  }
  if (error && typeof error === "object" && "code" in error)
    return Response.json(
      { error: "File contents are unavailable." },
      {
        status: error.code === "ENOENT" ? 404 : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  const status = message.includes("UNAUTHORIZED")
    ? 401
    : message.includes("REVISION_CONFLICT")
      ? 409
      : message.includes("PAYLOAD_TOO_LARGE")
        ? 413
        : message.includes("not found")
          ? 404
          : message.includes("access") ||
              message.includes("read only") ||
              message.includes("authorization")
            ? 403
            : 400;
  return Response.json(
    {
      error:
        status === 409
          ? "This file changed in another window. Reload before saving."
          : status === 413
            ? "Files must be smaller than 100 MB."
            : status === 401
              ? "Sign in to Ovela."
              : message
                  .replace(/^.*?Uncaught ConvexError: /, "")
                  .split("\n")[0],
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}
