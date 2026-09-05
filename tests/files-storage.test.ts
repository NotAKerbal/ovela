import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadedMime } from "../lib/files-mime";
import {
  storeFile,
  readStoredFile,
  storagePath,
  boundedBody,
  parseRange,
} from "../lib/files-storage";
let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  delete process.env.OVELA_FILES_PATH;
});
describe("Files disk storage and streaming", () => {
  it("stores immutable bytes and rejects path traversal", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "ovela-files-test-"));
    process.env.OVELA_FILES_PATH = directory;
    const first = await storeFile(new TextEncoder().encode("first")),
      second = await storeFile(new TextEncoder().encode("second"));
    expect(first).not.toBe(second);
    expect((await readStoredFile(first)).toString()).toBe("first");
    expect(await storeFile(new TextEncoder().encode("first"))).toBe(first);
    expect(() => storagePath("../secret")).toThrow("Invalid storage key");
  });
  it("bounds chunked requests even without content-length", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(6));
        c.enqueue(new Uint8Array(6));
        c.close();
      },
    });
    const request = new Request("http://localhost", {
      method: "PUT",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(boundedBody(request, 10)).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });
  it("recognizes unlabeled previews and does not trust forged image MIME labels", () => {
    expect(uploadedMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "")).toBe(
      "image/jpeg",
    );
    expect(uploadedMime(new TextEncoder().encode("%PDF-1.7"), "")).toBe(
      "application/pdf",
    );
    expect(
      uploadedMime(new TextEncoder().encode("<html>bad</html>"), "image/png"),
    ).toBe("application/octet-stream");
    expect(
      uploadedMime(new TextEncoder().encode("<svg/>"), "image/svg+xml"),
    ).toBe("application/octet-stream");
    expect(uploadedMime(new Uint8Array(), "TEXT/PLAIN; charset=UTF-8")).toBe(
      "text/plain",
    );
  });
  it("handles media seeking ranges and rejects invalid or multipart ranges", () => {
    expect(parseRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=5-", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=0-999", 10)).toEqual({ start: 0, end: 9 });
    for (const value of [
      "bytes=10-",
      "bytes=5-2",
      "bytes=-0",
      "bytes=0-1,3-4",
      "nonsense",
    ])
      expect(parseRange(value, 10)).toBeNull();
    expect(parseRange("bytes=0-", 0)).toBeNull();
  });
});
