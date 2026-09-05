"use client";

import { useState } from "react";
import "./editors.css";

export type MediaPreviewProps = {
  fileId: string;
  name: string;
  mime: string;
  contentUrl?: string;
};

export default function MediaPreview({
  fileId,
  name,
  mime,
  contentUrl,
}: MediaPreviewProps) {
  const [failed, setFailed] = useState(false);
  const url = contentUrl ?? `/api/files/content/${encodeURIComponent(fileId)}`;
  const download = `${url}${url.includes("?") ? "&" : "?"}download=1`;
  // HTML and SVG documents never execute inside the Ovela origin.
  const image = /^image\/(jpeg|png|webp|gif|avif)$/i.test(mime);
  const video = /^video\/(mp4|webm|ogg)$/i.test(mime);
  const audio = /^audio\//i.test(mime);
  return (
    <section className="ovela-media-preview" aria-label={`${name} preview`}>
      {!failed && image ? (
        <img src={url} alt={name} onError={() => setFailed(true)} />
      ) : !failed && video ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={url}
          onError={() => setFailed(true)}
          aria-label={name}
        />
      ) : !failed && audio ? (
        <audio
          controls
          preload="metadata"
          src={url}
          onError={() => setFailed(true)}
          aria-label={name}
        />
      ) : !failed && mime === "application/pdf" ? (
        <object data={url} type="application/pdf" aria-label={name}>
          <p>
            Your browser cannot display this PDF.{" "}
            <a href={download} download={name}>
              Download {name}
            </a>
          </p>
        </object>
      ) : (
        <div className="ovela-preview-empty">
          <h2>
            {failed
              ? "This preview could not be loaded"
              : "Preview unavailable"}
          </h2>
          <p>
            {failed
              ? "Your browser may not support this format. You can still download the original file."
              : "Download this file to open it with a compatible app."}
          </p>
        </div>
      )}
      <a className="ovela-preview-download" href={download} download={name}>
        Download original
      </a>
    </section>
  );
}
