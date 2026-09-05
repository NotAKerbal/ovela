"use client";

import { useEffect, useId, useRef, useState } from "react";

type Session = { url: string; token: string; expiresAt: number };
export function OfficeEditor({
  fileId,
  name,
  showMenus = false,
  shareToken,
}: {
  fileId: string;
  name: string;
  showMenus?: boolean;
  shareToken?: string;
}) {
  const frameName = useId().replaceAll(":", "");
  const form = useRef<HTMLFormElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const dirty = useRef(false);
  const menus = useRef(showMenus);
  const [appearance, setAppearance] = useState({ theme: "light", css: "" });
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    menus.current = showMenus;
    if (!session) return;
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({
        MessageId: showMenus ? "Show_Menubar" : "Hide_Menubar",
        SendTime: Date.now(),
        Values: {},
      }),
      new URL(session.url).origin,
    );
  }, [showMenus, session]);
  useEffect(() => {
    const controller = new AbortController();
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const color = (token: string, fallback: string) =>
      style.getPropertyValue(token).trim() || fallback;
    const theme =
      root.dataset.theme === "dark" ||
      (root.dataset.theme !== "light" &&
        matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";
    const paper = color("--paper", "#f3f0e8"),
      surface = color("--surface", "#f3f0e8"),
      text = color("--text", "#30362e"),
      line = color("--line", "#c1c4b5"),
      muted = color("--muted", "#646e5b");
    const variables: Record<string, string> = {
      "--color-main-text": text,
      "--color-text-dark": text,
      "--color-text-darker": text,
      "--color-text-lighter": muted,
      "--color-main-background": paper,
      "--color-background-lighter": surface,
      "--color-background-dark": surface,
      "--color-background-darker": line,
      "--color-background-tabs-group": paper,
      "--color-canvas": paper,
      "--color-toolbar-border": line,
      "--color-border": line,
      "--color-border-dark": line,
      "--color-border-lighter": surface,
      "--color-btn-border": line,
      "--color-primary": color("--focus", "#78896c"),
      "--color-primary-dark": color("--button-base", "#78896c"),
      "--color-primary-text": color("--button-text", "#fff"),
      "--color-primary-lighter": surface,
      "--color-calc-header": surface,
      "--color-calc-header-hover": paper,
      "--color-calc-header-selected": line,
      "--border-radius": "3px",
      "--border-radius-element": "3px",
      "--border-radius-large": "6px",
    };
    setAppearance({
      theme,
      css: Object.entries(variables)
        .map(([key, value]) => `${key}=${value};`)
        .join(""),
    });
    setSession(null);
    setError("");
    fetch(shareToken ? `/api/file-links/public/${encodeURIComponent(shareToken)}/office` : "/api/files/office", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId, shareToken }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Office is unavailable.");
        return data as Session;
      })
      .then(setSession)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [fileId, shareToken, attempt]);
  useEffect(() => {
    if (!session) return;
    const origin = new URL(session.url).origin;
    const publish = (value: boolean) => {
      dirty.current = value;
      window.dispatchEvent(
        new CustomEvent("ovela:editor-dirty", {
          detail: { fileId, dirty: value },
        }),
      );
    };
    const send = (MessageId: string, Values: Record<string, unknown> = {}) =>
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({ MessageId, SendTime: Date.now(), Values }),
        origin,
      );
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      let message;
      try {
        message =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!message || typeof message !== "object") return;
      if (message.MessageId === "App_LoadingStatus") {
        if (message.Values?.Status === "Frame_Ready")
          send("Host_PostmessageReady");
        if (message.Values?.Status === "Document_Loaded") {
          send("Hide_Sidebar");
          send("Hide_Ruler");
          send("Hide_StatusBar");
          send(menus.current ? "Show_Menubar" : "Hide_Menubar");
        }
      }
      // Collabora emits false only once the document has been saved.
      if (
        message.MessageId === "Doc_ModifiedStatus" &&
        typeof message.Values?.Modified === "boolean"
      )
        publish(message.Values.Modified);
      if (
        message.MessageId === "Action_Save_Resp" &&
        message.Values?.success === false &&
        message.Values?.result !== "unmodified"
      )
        publish(true);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("beforeunload", beforeUnload);
    form.current?.submit();
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("beforeunload", beforeUnload);
      publish(false);
    };
  }, [fileId, session]);
  if (error)
    return (
      <div className="files-editor-message">
        <p>{error}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Try again
        </button>
      </div>
    );
  if (!session)
    return (
      <div
        className="files-office-loading"
        aria-label="Opening office editor"
        role="status"
        style={{ height: "100%", padding: 24 }}
      >
        <div style={{ height: 42, background: "var(--line)", opacity: 0.25 }} />
        <div
          style={{
            width: "75%",
            height: "80%",
            margin: "24px auto",
            background: "var(--line)",
            opacity: 0.15,
          }}
        />
      </div>
    );
  return (
    <div
      className="files-office-editor"
      style={{ height: "100%", minHeight: 450 }}
    >
      <form
        ref={form}
        action={session.url}
        method="post"
        target={frameName}
        hidden
      >
        <input
          name="ui_defaults"
          value={`UIMode=compact;UITheme=${appearance.theme};TextRuler=false;TextSidebar=false;TextStatusbar=false;PresentationSidebar=false;PresentationStatusbar=false;SpreadsheetSidebar=false;SpreadsheetStatusbar=false;`}
          readOnly
        />
        <input name="css_variables" value={appearance.css} readOnly />
        <input name="access_token" value={session.token} readOnly />
        <input name="access_token_ttl" value={session.expiresAt} readOnly />
      </form>
      <iframe
        ref={frame}
        name={frameName}
        title={`${name} office editor`}
        style={{ width: "100%", height: "100%", border: 0 }}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
