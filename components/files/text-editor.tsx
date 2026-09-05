"use client";

import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Undo2, Redo2, Save } from "lucide-react";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { undo, redo } from "@codemirror/commands";
import "./editors.css";

export type TextEditorProps = {
  fileId: string;
  name: string;
  mime: string;
  revision: number;
  canEdit: boolean;
  onSave?: () => void;
  contentUrl?: string;
};

// CSS variables follow Ovela's selected theme without rebuilding the editor.
const ovelaHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--editor-keyword)" },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: "var(--editor-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "var(--editor-number)",
  },
  {
    tag: [tags.typeName, tags.className, tags.function(tags.variableName)],
    color: "var(--editor-function)",
  },
  { tag: [tags.comment, tags.meta], color: "var(--muted)" },
  {
    tag: [tags.punctuation, tags.processingInstruction],
    color: "var(--muted)",
  },
  { tag: tags.heading, color: "var(--text)", fontWeight: "600" },
  { tag: tags.strong, color: "var(--text)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--text)", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: [tags.link, tags.url],
    color: "var(--focus)",
    textDecoration: "underline",
  },
  { tag: tags.monospace, color: "var(--editor-string)" },
  { tag: tags.invalid, color: "var(--danger)" },
]);

// Keep the source intact. Only punctuation on inactive lines is concealed.
function markdownDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] =
    [];
  const active = state.selection.ranges.map((range) => ({
    from: state.doc.lineAt(range.from).from,
    to: state.doc.lineAt(range.to).to,
  }));
  syntaxTree(state).iterate({
    enter(node) {
      const name = node.name;
      const selected = active.some(
        (range) => node.from <= range.to && node.to >= range.from,
      );
      const linkSyntax =
        node.node.parent?.name === "Link" &&
        /^(LinkMark|URL|LinkTitle)$/.test(name);
      if (
        !selected &&
        (/^(HeaderMark|EmphasisMark|CodeMark|StrikethroughMark)$/.test(name) ||
          linkSyntax)
      ) {
        decorations.push({
          from: node.from,
          to: node.to,
          decoration: Decoration.replace({}),
        });
      }
      if (
        selected &&
        (/^(HeaderMark|EmphasisMark|CodeMark|StrikethroughMark|QuoteMark|ListMark)$/.test(
          name,
        ) ||
          linkSyntax)
      ) {
        decorations.push({
          from: node.from,
          to: node.to,
          decoration: Decoration.mark({ class: "ovela-md-marker" }),
        });
      }
      let className = "";
      if (/^ATXHeading[1-6]$/.test(name))
        className = `ovela-md-heading ovela-md-h${name.slice(-1)}`;
      else if (name === "StrongEmphasis") className = "ovela-md-strong";
      else if (name === "Emphasis") className = "ovela-md-emphasis";
      else if (name === "InlineCode") className = "ovela-md-code";
      else if (name === "Link") className = "ovela-md-link";
      if (className && node.to > node.from)
        decorations.push({
          from: node.from,
          to: node.to,
          decoration: Decoration.mark({ class: className }),
        });
    },
  });
  return Decoration.set(
    decorations.map((item) => item.decoration.range(item.from, item.to)),
    true,
  );
}
const livePreview = StateField.define<DecorationSet>({
  create: markdownDecorations,
  update: (_value, transaction) => markdownDecorations(transaction.state),
  provide: (field) => EditorView.decorations.from(field),
});

export default function TextEditor({
  fileId,
  name,
  mime,
  revision,
  canEdit,
  onSave,
  contentUrl,
}: TextEditorProps) {
  const endpoint =
    contentUrl ?? `/api/files/content/${encodeURIComponent(fileId)}`;
  const mount = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const saved = useRef("");
  const version = useRef(revision);
  const saveAction = useRef<() => void>(() => {});
  const pending = useRef(false);
  const editable = useRef(canEdit);
  editable.current = canEdit;
  const access = useRef(new Compartment());
  const preview = useRef(new Compartment());
  const [status, setStatus] = useState<
    "loading" | "ready" | "saving" | "error"
  >("loading");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [source, setSource] = useState(false);
  const [reload, setReload] = useState(0);
  const isMarkdown = /\.(md|markdown)$/i.test(name) || mime === "text/markdown";

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ovela:editor-dirty", { detail: { fileId, dirty } }),
    );
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.dispatchEvent(
        new CustomEvent("ovela:editor-dirty", {
          detail: { fileId, dirty: false },
        }),
      );
    };
  }, [dirty, fileId]);

  useEffect(() => {
    const controller = new AbortController();
    let view: EditorView | null = null;
    setStatus("loading");
    setMessage("");
    setDirty(false);
    async function load() {
      try {
        const response = await fetch(endpoint, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            "This file could not be opened. Check your access and try again.",
          );
        if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024)
          throw new Error(
            "This file is too large for the text editor. Download it to edit locally.",
          );
        const blob = await response.blob();
        if (blob.size > 2 * 1024 * 1024)
          throw new Error(
            "This file is too large for the text editor. Download it to edit locally.",
          );
        const contents = await blob.text();
        if (controller.signal.aborted || !mount.current) return;
        saved.current = contents;
        const etag = response.headers
          .get("etag")
          ?.replace(/^W\//, "")
          .replaceAll('"', "");
        version.current = etag && /^\d+$/.test(etag) ? Number(etag) : revision;
        const language = isMarkdown
          ? markdown()
          : /\.json[c]?$/i.test(name) || mime.includes("json")
            ? json()
            : /\.[cm]?[jt]sx?$/i.test(name)
              ? javascript({
                  typescript: /\.tsx?$/i.test(name),
                  jsx: /\.[jt]sx$/i.test(name),
                })
              : [];
        view = new EditorView({
          parent: mount.current,
          state: EditorState.create({
            doc: contents,
            extensions: [
              basicSetup,
              syntaxHighlighting(ovelaHighlighting),
              language,
              EditorView.lineWrapping,
              access.current.of([
                EditorState.readOnly.of(!canEdit),
                EditorView.editable.of(canEdit),
              ]),
              preview.current.of(isMarkdown && !source ? livePreview : []),
              keymap.of([
                {
                  key: "Mod-s",
                  run: () => {
                    saveAction.current();
                    return true;
                  },
                  preventDefault: true,
                },
                {
                  key: "Mod-b",
                  run: (current) => {
                    if (!isMarkdown || !editable.current) return false;
                    const selection = current.state.selection.main;
                    const text = current.state.sliceDoc(
                      selection.from,
                      selection.to,
                    );
                    current.dispatch({
                      changes: {
                        from: selection.from,
                        to: selection.to,
                        insert: `**${text}**`,
                      },
                      selection: {
                        anchor: selection.from + 2,
                        head: selection.to + 2,
                      },
                    });
                    return true;
                  },
                },
              ]),
              EditorView.updateListener.of((update) => {
                if (update.docChanged)
                  setDirty(update.state.doc.toString() !== saved.current);
              }),
              EditorView.contentAttributes.of({
                "aria-label": `${name} editor`,
                spellcheck: isMarkdown ? "true" : "false",
              }),
            ],
          }),
        });
        editor.current = view;
        setStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus("error");
          setMessage(
            error instanceof Error ? error.message : "Unable to open file.",
          );
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      view?.destroy();
      editor.current = null;
    };
    // Changes to revision must not replace an unsaved buffer when metadata updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, endpoint, reload]);

  useEffect(() => {
    editor.current?.dispatch({
      effects: preview.current.reconfigure(
        isMarkdown && !source ? livePreview : [],
      ),
    });
  }, [source, isMarkdown, status]);
  useEffect(() => {
    editor.current?.dispatch({
      effects: access.current.reconfigure([
        EditorState.readOnly.of(!canEdit),
        EditorView.editable.of(canEdit),
      ]),
    });
  }, [canEdit, status]);

  async function save() {
    const current = editor.current;
    if (
      !current ||
      !canEdit ||
      pending.current ||
      current.state.doc.toString() === saved.current
    )
      return;
    const contents = current.state.doc.toString();
    pending.current = true;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": mime || "text/plain",
          "If-Match": String(version.current),
        },
        body: contents,
      });
      if (response.status === 409 || response.status === 412)
        throw new Error(
          "Someone else saved a newer version. Your edits are kept here. Download your copy before reloading the latest version.",
        );
      if (!response.ok)
        throw new Error(
          "Your changes could not be saved. Your edits are still here; try saving again.",
        );
      const result = (await response.json()) as { revision: number };
      if (editor.current === current) {
        version.current = result.revision;
        saved.current = contents;
        setDirty(current.state.doc.toString() !== contents);
        setStatus("ready");
        onSave?.();
      }
    } catch (error) {
      if (editor.current === current) {
        setMessage(error instanceof Error ? error.message : "Save failed.");
        setStatus("ready");
      }
    } finally {
      pending.current = false;
    }
  }
  saveAction.current = () => {
    void save();
  };

  function downloadCopy() {
    if (!editor.current) return;
    const url = URL.createObjectURL(
      new Blob([editor.current.state.doc.toString()], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reloadFile() {
    if (
      !dirty ||
      window.confirm(
        "Discard your unsaved edits and load the latest saved version?",
      )
    )
      setReload((value) => value + 1);
  }

  return (
    <section
      className={`ovela-text-editor ${isMarkdown && !source ? "ovela-live-markdown" : ""}`}
      aria-label={isMarkdown ? "Markdown editor" : "Text editor"}
    >
      <div className="ovela-editor-toolbar">
        <div className="ovela-editor-tools">
          {isMarkdown && (
            <div
              className="ovela-editor-segments"
              aria-label="Markdown display"
            >
              <button
                aria-label="Live preview"
                title="Live preview"
                aria-pressed={!source}
                onClick={() => setSource(false)}
              >
                Preview
              </button>
              <button aria-pressed={source} onClick={() => setSource(true)}>
                Source
              </button>
            </div>
          )}
          <button
            className="ovela-editor-icon"
            aria-label="Undo"
            title="Undo (⌘/Ctrl+Z)"
            disabled={!canEdit || status === "loading"}
            onClick={() => {
              if (editor.current) undo(editor.current);
            }}
          >
            <Undo2 size={17} aria-hidden="true" />
          </button>
          <button
            className="ovela-editor-icon"
            aria-label="Redo"
            title="Redo (⌘/Ctrl+Shift+Z)"
            disabled={!canEdit || status === "loading"}
            onClick={() => {
              if (editor.current) redo(editor.current);
            }}
          >
            <Redo2 size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="ovela-editor-tools">
          <span className="ovela-editor-status" role="status">
            {status === "loading"
              ? "Opening…"
              : status === "saving"
                ? "Saving…"
                : status === "error"
                  ? "Unable to open"
                  : !canEdit
                    ? "Read only"
                    : dirty
                      ? "Unsaved"
                      : "Saved"}
          </span>
          <button
            className="ovela-editor-save ovela-editor-icon"
            aria-label="Save file"
            title="Save (⌘/Ctrl+S)"
            disabled={!canEdit || !dirty || status === "saving"}
            onClick={() => void save()}
          >
            <Save size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {message && (
        <div className="ovela-editor-message" role="alert">
          <p>{message}</p>
          <div className="ovela-editor-tools">
            {editor.current && (
              <button onClick={downloadCopy}>Download my copy</button>
            )}
            <button onClick={reloadFile}>Reload file</button>
          </div>
        </div>
      )}
      {status === "loading" && (
        <div className="ovela-editor-skeleton" aria-label="Loading editor">
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      <div ref={mount} className="ovela-editor-mount" />
    </section>
  );
}
