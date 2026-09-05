import { uploadedMime } from "@/lib/files-mime";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  filesClient,
  filesSecret,
  assertFilesOrigin,
  filesError,
} from "@/lib/files-server";
import { boundedBody, MAX_FILE_SIZE, storeFile } from "@/lib/files-storage";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertFilesOrigin(request);
    const client = await filesClient();
    await client.query(api.files.uploadTarget, {});
    // Bound the multipart envelope before parsing; no unbounded request.formData allocation.
    const body = await boundedBody(request, MAX_FILE_SIZE + 1024 * 1024);
    const form = await new Response(body.buffer as ArrayBuffer, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file"),
      parent = form.get("parentId");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    if (file.size > MAX_FILE_SIZE) throw new Error("PAYLOAD_TOO_LARGE");
    const parentId =
      typeof parent === "string" && parent
        ? (parent as Id<"files">)
        : undefined;
    await client.query(api.files.uploadTarget, { parentId });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storageKey = await storeFile(bytes);
    return Response.json(
      await client.mutation(api.files.commitUpload, {
        name: file.name,
        parentId,
        storageKey,
        size: file.size,
        mime: uploadedMime(bytes, file.type),
        secret: filesSecret(),
      }),
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return filesError(error);
  }
}
