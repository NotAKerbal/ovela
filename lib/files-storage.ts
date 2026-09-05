import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export function storagePath(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid storage key.");
  return path.join(
    process.env.OVELA_FILES_PATH ?? path.join(process.cwd(), ".ovela-files"),
    key,
  );
}
export async function storeFile(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_FILE_SIZE)
    throw new Error("Files must be smaller than 100 MB.");
  const key = createHash("sha256").update(bytes).digest("hex"),
    target = storagePath(key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`,
    file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
    await file.close();
    await rename(temporary, target);
  } catch (error) {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return key;
}
export async function readStoredFile(key: string) {
  return readFile(storagePath(key));
}
export async function boundedBody(request: Request, limit = MAX_FILE_SIZE) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function parseRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= size
  )
    return null;
  return { start, end };
}
