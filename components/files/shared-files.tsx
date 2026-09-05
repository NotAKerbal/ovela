"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  Folder,
  FileText,
  Download,
  ChevronRight,
  LockKeyhole,
  SlidersHorizontal,
} from "lucide-react";
import "./files.css";
import "./sharing.css";
const loading = () => (
  <div
    className="files-editor-loading"
    aria-busy="true"
    aria-label="Loading shared file"
  >
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-row" />
  </div>
);
const TextEditor = dynamic(() => import("./text-editor"), {
  ssr: false,
  loading,
});
const MediaPreview = dynamic(() => import("./media-preview"), {
  ssr: false,
  loading,
});
const OfficeEditor = dynamic(
  () => import("./office-editor").then((module) => module.OfficeEditor),
  { ssr: false, loading },
);
type SharedNode = {
  _id: string;
  name: string;
  kind: "file" | "folder";
  mime: string;
  size: number;
  revision: number;
};
type SharedData =
  | {
      locked: false;
      node: SharedNode;
      items: SharedNode[];
      breadcrumbs: { _id: string; name: string }[];
      rootId: string;
      expiresAt: number;
      role: "viewer" | "editor";
    }
  | { locked: true };
export function SharedFiles({ token }: { token: string }) {
  const [id, setId] = useState<string>(),
    [data, setData] = useState<SharedData>(),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [menus, setMenus] = useState(false);
  const dirty = useRef(false);
  const base = `/api/file-links/public/${encodeURIComponent(token)}`;
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError("");
    setMenus(false);
    dirty.current = false;
    fetch(`${base}${id ? "?id=" + encodeURIComponent(id) : ""}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "This link is unavailable or has expired.",
          );
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [base, id, attempt]);
  const node = data && !data.locked ? data.node : undefined;
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.fileId === node?._id) dirty.current = detail.dirty;
    };
    window.addEventListener("ovela:editor-dirty", handler);
    return () => window.removeEventListener("ovela:editor-dirty", handler);
  }, [node?._id]);
  function navigate(next?: string) {
    if (
      dirty.current &&
      !window.confirm("You have unsaved changes. Leave this file?")
    )
      return;
    setId(next);
  }
  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Unable to open this link.");
      }
      setPassword("");
      setAttempt((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to open this link.",
      );
    } finally {
      setBusy(false);
    }
  }
  const office = node && /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(node.name);
  const text =
    node &&
    (node.mime.startsWith("text/") ||
      /\.(md|markdown|txt|json|jsonc|ts|tsx|js|jsx|css|html|xml|yml|yaml|csv|log|sh|py|rs|go|toml|ini|sql|java|c|cpp|h)$/i.test(
        node.name,
      ));
  const content = node ? `${base}/content/${encodeURIComponent(node._id)}` : "";
  return (
    <div className="shared-workspace">
      <header className="shared-header">
        <div className="brand" aria-label="Ovela">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>Ovela</span>
        </div>
        <nav className="shared-breadcrumb" aria-label="Shared folder path">
          {data && !data.locked ? (
            data.breadcrumbs.map((crumb, index) => (
              <span key={crumb._id}>
                {index > 0 && <ChevronRight size={13} />}
                <button
                  onClick={() => navigate(crumb._id)}
                  aria-current={crumb._id === node?._id ? "page" : undefined}
                >
                  {crumb.name}
                </button>
              </span>
            ))
          ) : (
            <span>Shared files</span>
          )}
        </nav>
        <div className="shared-header-actions">
          {node?.kind === "file" && (
            <a
              className="files-text-button"
              href={`${content}?download=1`}
              download={node.name}
              aria-label="Download"
            >
              <Download size={18} />
              <span className="download-label">Download</span>
            </a>
          )}
          {office && (
            <button
              className="files-tools-button"
              aria-label="Office menus"
              aria-pressed={menus}
              onClick={() => setMenus((value) => !value)}
            >
              <SlidersHorizontal size={17} />
            </button>
          )}
        </div>
      </header>
      <main className="shared-content">
        {data?.locked ? (
          <section className="shared-message">
            <LockKeyhole size={30} />
            <h1>This link has a password</h1>
            <p>Enter the password from the person who shared it.</p>
            <form onSubmit={unlock}>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <button className="primary-button" disabled={busy || !password}>
                {busy ? "Opening…" : "Open shared files"}
              </button>
            </form>
            {error && <p role="alert">{error}</p>}
          </section>
        ) : error ? (
          <section className="shared-message">
            <h1>Link unavailable</h1>
            <p role="alert">{error}</p>
            <button
              className="primary-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          </section>
        ) : !data ? (
          loading()
        ) : node?.kind === "folder" ? (
          <>
            <ul className="shared-list">
              {data.items
                .slice()
                .sort((a, b) =>
                  a.kind === b.kind
                    ? a.name.localeCompare(b.name)
                    : a.kind === "folder"
                      ? -1
                      : 1,
                )
                .map((item) => (
                  <li key={item._id}>
                    <button onClick={() => navigate(item._id)}>
                      {item.kind === "folder" ? (
                        <Folder size={24} />
                      ) : (
                        <FileText size={24} />
                      )}
                      <span>{item.name}</span>
                      <small>
                        {item.kind === "folder"
                          ? ""
                          : item.size < 1024
                            ? `${item.size} B`
                            : `${(item.size / 1024).toFixed(1)} KB`}
                      </small>
                      <ChevronRight size={16} />
                    </button>
                  </li>
                ))}
            </ul>
            {data.items.length === 0 && (
              <div className="files-empty">
                <Folder size={36} />
                <p>This folder is empty.</p>
              </div>
            )}
          </>
        ) : node ? (
          office ? (
            <OfficeEditor
              key={node._id}
              fileId={node._id}
              name={node.name}
              shareToken={token}
              showMenus={menus}
            />
          ) : text ? (
            <TextEditor
              key={node._id}
              fileId={node._id}
              name={node.name}
              mime={node.mime}
              revision={node.revision}
              canEdit={data.role === "editor"}
              contentUrl={content}
            />
          ) : (
            <MediaPreview
              key={node._id}
              fileId={node._id}
              name={node.name}
              mime={node.mime}
              contentUrl={content}
            />
          )
        ) : null}
      </main>
    </div>
  );
}
