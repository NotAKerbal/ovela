"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Link2, Copy, Check, LockKeyhole, Trash2 } from "lucide-react";
import "./sharing.css";
type LinkRecord = {
  _id: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  hasPassword: boolean;
  role: "viewer" | "editor";
};
export function ShareLinks({ fileId }: { fileId: string }) {
  const [links, setLinks] = useState<LinkRecord[]>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [role, setRole] = useState<"viewer" | "editor">("viewer"),
    [password, setPassword] = useState(""),
    [days, setDays] = useState("7"),
    [url, setUrl] = useState(""),
    [copied, setCopied] = useState(false);
  async function refresh() {
    const response = await fetch(
      `/api/file-links?fileId=${encodeURIComponent(fileId)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load links.");
    setLinks(data.links);
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/file-links?fileId=${encodeURIComponent(fileId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load links.");
        if (active) setLinks(data.links);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [fileId]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCopied(false);
    setUrl("");
    try {
      const response = await fetch("/api/file-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileId,
          role,
          password: password || undefined,
          expiresInDays: Number(days),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create link.");
      setUrl(data.url);
      setPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create link.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/file-links", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Could not revoke link.");
      setUrl("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke link.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="file-share-links">
      <p className="muted">
        Anyone with the link can access this item. Add a password to require it
        before opening.
      </p>
      <form onSubmit={create}>
        <div className="segmented" role="group" aria-label="Link permission">
          <button
            type="button"
            aria-pressed={role === "viewer"}
            onClick={() => setRole("viewer")}
          >
            Can view
          </button>
          <button
            type="button"
            aria-pressed={role === "editor"}
            onClick={() => setRole("editor")}
          >
            Can edit
          </button>
        </div>
        <p className="share-permission-hint">
          {role === "viewer"
            ? "View and download files."
            : "View, download, and edit supported documents and text files."}
        </p>
        <div className="share-link-fields">
          <label>
            Password{" "}
            <span className="muted">optional, at least 8 characters</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={256}
            />
          </label>
          <label>
            Expires
            <select
              value={days}
              onChange={(event) => setDays(event.target.value)}
            >
              <option value="1">In 1 day</option>
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
              <option value="365">In 1 year</option>
            </select>
          </label>
        </div>
        <button className="primary-button" disabled={busy}>
          <Link2 size={17} />
          {busy ? "Working…" : "Create link"}
        </button>
      </form>
      {url && (
        <div className="share-created-link">
          <label>
            Your link
            <input
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            className="files-icon-button"
            aria-label={copied ? "Link copied" : "Copy link"}
            title="Copy link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                setError("Select the link and copy it manually.");
              }
            }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
          <small>Copy it now. The full link is shown only when created.</small>
        </div>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="share-existing-links">
        {links === undefined ? (
          <div className="skeleton skeleton-row" />
        ) : (
          links
            .filter((link) => !link.revoked)
            .map((link) => (
              <div key={link._id}>
                <Link2 size={18} />
                <span>
                  {link.role === "editor" ? "Editing link" : "Viewing link"}
                  {link.hasPassword && (
                    <LockKeyhole size={13} aria-label="Password protected" />
                  )}
                  <small>
                    {link.expiresAt < Date.now()
                      ? "Expired"
                      : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                  </small>
                </span>
                <button
                  className="files-icon-button"
                  aria-label="Revoke link"
                  title="Revoke link"
                  disabled={busy}
                  onClick={() => revoke(link._id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
