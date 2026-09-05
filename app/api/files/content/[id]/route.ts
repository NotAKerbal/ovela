import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  getFile,
  writeFile,
  assertFilesOrigin,
  filesError,
} from "@/lib/files-server";
import { boundedBody, storagePath, parseRange } from "@/lib/files-storage";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const node = await getFile((await params).id);
    if (node.kind !== "file" || !node.storageKey)
      return new Response(null, { status: 404 });
    const file = storagePath(node.storageKey),
      info = await stat(file);
    const safeInline =
      /^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm|ogg)|audio\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/.test(
        node.mime,
      );
    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-type": safeInline ? node.mime : "application/octet-stream",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "accept-ranges": "bytes",
      etag: `"${node.revision}"`,
      "content-disposition": `${safeInline && !new URL(request.url).searchParams.has("download") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(node.name).replace(/'/g, "%27")}`,
    });
    const range = request.headers.get("range");
    const parsed = range ? parseRange(range, info.size) : undefined;
    if (parsed === null) {
      headers.set("content-range", `bytes */${info.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (parsed) {
      headers.set(
        "content-range",
        `bytes ${parsed.start}-${parsed.end}/${info.size}`,
      );
      headers.set("content-length", String(parsed.end - parsed.start + 1));
    } else headers.set("content-length", String(info.size));
    return new Response(
      Readable.toWeb(
        createReadStream(file, parsed ?? undefined),
      ) as ReadableStream,
      { status: parsed ? 206 : 200, headers },
    );
  } catch (error) {
    return filesError(error);
  }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    assertFilesOrigin(request);
    const expected = request.headers.get("if-match")?.replace(/^"|"$/g, "");
    if (!expected || !/^\d+$/.test(expected))
      return Response.json(
        { error: "A file revision is required." },
        { status: 428 },
      );
    const id = (await params).id;
    await getFile(id);
    const bytes = await boundedBody(request);
    return Response.json(await writeFile(id, bytes, Number(expected)), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return filesError(error);
  }
}
