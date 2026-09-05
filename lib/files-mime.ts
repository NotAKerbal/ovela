// Recognize common previews independently of the browser's optional MIME label.
// Everything else stays downloadable; inline responses also enforce a strict allowlist.
export function uploadedMime(bytes: Uint8Array, reported: string): string {
  const prefix = Array.from(bytes.subarray(0, 16), (n) =>
    String.fromCharCode(n),
  ).join("");
  if (
    bytes[0] === 0x89 &&
    prefix.slice(1, 4) === "PNG" &&
    bytes[4] === 13 &&
    bytes[5] === 10
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a"))
    return "image/gif";
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP")
    return "image/webp";
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WAVE")
    return "audio/wav";
  if (prefix.startsWith("%PDF-")) return "application/pdf";
  const mime = reported.toLowerCase().trim().split(";")[0];
  if (prefix.slice(4, 8) === "ftyp") {
    if (prefix.slice(8, 12) === "avif" || prefix.slice(8, 12) === "avis")
      return "image/avif";
    return mime === "audio/mp4" ? "audio/mp4" : "video/mp4";
  }
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return mime === "audio/webm" ? "audio/webm" : "video/webm";
  if (prefix.startsWith("OggS"))
    return mime === "video/ogg" ? "video/ogg" : "audio/ogg";
  if (
    prefix.startsWith("ID3") ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  if (/^(image\/|video\/|application\/pdf$)/.test(mime))
    return "application/octet-stream";
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)
    ? mime
    : "application/octet-stream";
}
