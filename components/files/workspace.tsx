"use client";
import { FileMoveProvider, useFileMove } from "./use-hold-move";
import { useEffect, useRef, useState, useMemo, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  Image as ImageIcon,
  Film,
  Music,
  Sheet,
  Presentation,
  PanelLeft,
  ChevronRight,
  Plus,
  Upload,
  Search,
  LayoutGrid,
  List,
  MoreHorizontal,
  Share2,
  Pencil,
  Trash2,
  Download,
  SlidersHorizontal,
  X,
  ArrowUpRight,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteHeader } from "@/components/site-header";
import { FilesSidebar, useFilesSidebar } from "./sidebar";
import "./files.css";
import { ShareLinks } from "./share-links";
const loading = () => (
  <div
    className="files-editor-loading"
    aria-label="Loading editor"
    aria-busy="true"
  >
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-row" />
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
type Node = {
  _id: Id<"files">;
  name: string;
  kind: "file" | "folder";
  mime: string;
  size: number;
  revision: number;
  ownerId: Id<"people">;
  updatedAt: number;
  canEdit?: boolean;
  isOwner?: boolean;
};
type NewKind =
  "folder" | "text" | "markdown" | "document" | "spreadsheet" | "presentation";
type Modal =
  | { kind: "new"; type: NewKind }
  | { kind: "rename" | "actions" | "share" | "move"; node: Node }
  | null;
const officePattern = /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i;
const textPattern =
  /\.(md|markdown|txt|json|jsonc|ts|tsx|js|jsx|css|html|xml|yml|yaml|csv|log|sh|py|rs|go|toml|ini|sql|java|c|cpp|h)$/i;
const extension: Record<Exclude<NewKind, "folder">, string> = {
  text: ".txt",
  markdown: ".md",
  document: ".docx",
  spreadsheet: ".xlsx",
  presentation: ".pptx",
};

export function FilesAccess() {
  const apps = useQuery(api.management.home);
  if (apps === undefined) return loading();
  if (!apps.some((app) => app.icon === "files"))
    return (
      <>
        <SiteHeader />
        <main className="management">
          <h1>Files access unavailable</h1>
          <p>Ask an administrator to give you access to Files.</p>
        </main>
      </>
    );
  return <FilesWorkspace />;
}
function FilesWorkspace() {
  const router = useRouter(),
    params = useSearchParams();
  const parentId = (params.get("folder") || undefined) as
    Id<"files"> | undefined;
  const fileId = (params.get("file") || undefined) as Id<"files"> | undefined;
  const shared = params.get("view") === "shared";
  const data = useQuery(api.files.list, {
    ...(parentId ? { parentId } : {}),
    shared,
  });
  const file = useQuery(api.files.get, fileId ? { id: fileId } : "skip");
  const viewer = useQuery(api.management.viewer);
  const createFolder = useMutation(api.files.createFolder),
    rename = useMutation(api.files.rename),
    trash = useMutation(api.files.trash),
    restore = useMutation(api.files.restore),
    move = useMutation(api.files.move);
  const sidebar = useFilesSidebar();
  const [officeTools, setOfficeTools] = useState(false);
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const newMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (newMenu.current && !newMenu.current.contains(event.target as globalThis.Node))
        newMenu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && newMenu.current) newMenu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const [selected, setSelected] = useState<Node | null>(null),
    [modal, setModal] = useState<Modal>(null);
  const [search, setSearch] = useState(""),
    [layout, setLayout] = useState<"list" | "grid">("list");
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [undo, setUndo] = useState<Id<"files"> | null>(null);
  const input = useRef<HTMLInputElement>(null),
    dirty = useRef(false);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.fileId === fileId) dirty.current = detail.dirty;
    };
    dirty.current = false;
    window.addEventListener("ovela:editor-dirty", handler);
    return () => window.removeEventListener("ovela:editor-dirty", handler);
  }, [fileId]);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !dirty.current ||
        !link ||
        link.hasAttribute("download") ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      if (!window.confirm("You have unsaved changes. Leave this file?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, []);
  useEffect(() => {
    setSelected(null);
    setSearch("");
  }, [parentId, shared]);
  const crumbs = (file?.breadcrumbs ?? data?.breadcrumbs ?? []).filter(
    (crumb) => crumb._id !== fileId,
  );
  function navigate(
    folder?: Id<"files">,
    isShared = shared,
    openFile?: Id<"files">,
  ) {
    if (
      dirty.current &&
      !window.confirm("You have unsaved changes. Leave this file?")
    )
      return;
    const query = new URLSearchParams();
    if (folder) query.set("folder", folder);
    if (isShared) query.set("view", "shared");
    if (openFile) query.set("file", openFile);
    router.push(`/files${query.size ? "?" + query.toString() : ""}`, {
      scroll: false,
    });
    if (window.innerWidth <= 760) sidebar.setOpen(false);
  }
  function open(node: Node) {
    node.kind === "folder"
      ? navigate(node._id)
      : navigate(parentId, shared, node._id);
  }
  function show(value: Modal) {
    setMenuPoint(null);
    setError("");
    setName(value?.kind === "rename" ? value.node.name : "");
    setModal(value);
  }
  async function uploadOne(blob: globalThis.File) {
    const body = new FormData();
    body.set("file", blob);
    if (parentId) body.set("parentId", parentId);
    const response = await fetch("/api/files/upload", { method: "POST", body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed.");
    return result;
  }
  async function upload(files: FileList | globalThis.File[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    setUndo(null);
    try {
      const all = Array.from(files);
      for (let i = 0; i < all.length; i++) {
        setMessage(`Uploading ${i + 1} of ${all.length}: ${all[i].name}`);
        await uploadOne(all[i]);
      }
      setMessage(`${all.length === 1 ? "File" : "Files"} uploaded.`);
    } catch (err) {
      setError(errorMessage(err));
      setMessage("");
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "new") return;
    setBusy(true);
    setError("");
    try {
      if (modal.type === "folder") await createFolder({ name, parentId });
      else {
        const suffix = extension[modal.type],
          filename = name.toLowerCase().endsWith(suffix) ? name : name + suffix;
        let blob: Blob;
        if (["document", "spreadsheet", "presentation"].includes(modal.type)) {
          const response = await fetch(
            `/file-templates/${modal.type}${suffix}`,
          );
          if (!response.ok)
            throw new Error("Could not load the document template.");
          blob = await response.blob();
        } else
          blob = new Blob(
            [
              modal.type === "markdown"
                ? `# ${name.replace(/\.md$/i, "")}\n\n`
                : "",
            ],
            {
              type: modal.type === "markdown" ? "text/markdown" : "text/plain",
            },
          );
        const result = await uploadOne(
          new globalThis.File([blob], filename, { type: blob.type }),
        );
        const id = result._id ?? result.id ?? result.file?._id;
        if (id) navigate(parentId, shared, id);
      }
      setModal(null);
      setMessage("Created.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function doRename(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "rename") return;
    setBusy(true);
    setError("");
    try {
      await rename({ id: modal.node._id, name });
      setModal(null);
      setMessage("Renamed.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function doTrash(node: Node) {
    setBusy(true);
    setError("");
    try {
      await trash({ id: node._id });
      setUndo(node._id);
      setMessage(`${node.name} moved to trash.`);
      setModal(null);
      setSelected(null);
      if (fileId === node._id) navigate(parentId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const items = useMemo(
    () =>
      (data?.items ?? [])
        .filter((item) =>
          item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          a.kind === b.kind
            ? a.name.localeCompare(b.name)
            : a.kind === "folder"
              ? -1
              : 1,
        ),
    [data, search],
  );
  useEffect(() => {
    if (!message || busy || undo) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message, busy, undo]);
  useEffect(() => setOfficeTools(false), [fileId]);
  const canEdit = data?.canEdit ?? false;
  return (
    <FileMoveProvider onMove={async (node, target) => {
      try {
        setError("");
        await move({ id: node._id as Id<"files">, parentId: target._id as Id<"files"> });
        setSelected(null);
        setMessage(`Moved ${node.name} to ${target.name}.`);
      } catch (err) { setError(errorMessage(err)); }
    }}>
    <div className="files-workspace">
      <SiteHeader focused>
        <div className="files-header-middle">
          <button
            className="files-icon-button sidebar-toggle"
            aria-label={
              sidebar.open ? "Hide file navigation" : "Show file navigation"
            }
            aria-expanded={sidebar.open}
            aria-controls="files-sidebar"
            title="Toggle sidebar (⌘B / Ctrl+B)"
            onClick={() => sidebar.setOpen((value) => !value)}
          >
            <PanelLeft size={22} />
          </button>
          <nav className="files-breadcrumb" aria-label="Breadcrumb">
            <button onClick={() => navigate(undefined, shared)}>
              {shared ? "Shared with me" : "Files"}
            </button>
            {crumbs.map((crumb) => (
              <span key={crumb._id}>
                <ChevronRight size={14} />
                <button onClick={() => navigate(crumb._id, shared)}>
                  {crumb.name}
                </button>
              </span>
            ))}
            {file && (
              <span className="files-current-name">
                <ChevronRight size={14} />
                <button
                  title={file.canEdit ? "Double-click to rename" : file.name}
                  onDoubleClick={() => file.canEdit && show({ kind: "rename", node: file as Node })}
                  onKeyDown={(event) => {
                    if (event.key === "F2" && file.canEdit) {
                      event.preventDefault();
                      show({ kind: "rename", node: file as Node });
                    }
                  }}
                >{file.name}</button>
              </span>
            )}
          </nav>
          <div className="files-header-controls">
            {file && (
              <button
                className="files-icon-button"
                aria-label="File actions"
                title="File actions"
                onClick={() => show({ kind: "actions", node: file as Node })}
              >
                <MoreHorizontal size={20} />
              </button>
            )}
            {(file || selected) && (
              <button
                className="files-share-button"
                aria-label="Share"
                onClick={() =>
                  show({ kind: "share", node: (file || selected)! as Node })
                }
              >
                <Share2 size={17} />
                <span>Share</span>
              </button>
            )}
            {file && officePattern.test(file.name) && (
              <button
                className="files-tools-button"
                aria-label="Office menus"
                aria-pressed={officeTools}
                title="Show more Office tools"
                onClick={() => setOfficeTools((value) => !value)}
              >
                <SlidersHorizontal size={17} />
                <span>Tools</span>
              </button>
            )}
          </div>
        </div>
      </SiteHeader>
      <FilesSidebar
        state={sidebar}
        shared={shared}
        parentId={parentId}
        fileId={fileId}
        breadcrumbs={crumbs}
        navigate={navigate}
      >
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = "";
          }}
        />
        {(message || error) && (
          <div
            className={`files-notice ${error ? "error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{error || message}</span>
            {undo && !error && (
              <button
                onClick={async () => {
                  try {
                    await restore({ id: undo });
                    setUndo(null);
                    setMessage("Restored.");
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Undo
              </button>
            )}
            <button
              className="files-icon-button"
              aria-label="Dismiss message"
              onClick={() => {
                setMessage("");
                setError("");
                setUndo(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {fileId ? (
          file === undefined ? (
            loading()
          ) : file ? (
            <div className="files-editor-area">
              {officePattern.test(file.name) ? (
                <OfficeEditor
                  key={file._id}
                  fileId={file._id}
                  name={file.name}
                  showMenus={officeTools}
                />
              ) : textPattern.test(file.name) ||
                file.mime.startsWith("text/") ? (
                <TextEditor
                  key={file._id}
                  fileId={file._id}
                  name={file.name}
                  mime={file.mime}
                  revision={file.revision}
                  canEdit={file.canEdit}
                />
              ) : (
                <MediaPreview
                  key={file._id}
                  fileId={file._id}
                  name={file.name}
                  mime={file.mime}
                />
              )}
            </div>
          ) : (
            <div className="files-empty">
              <File size={42} />
              <h1>File unavailable</h1>
              <p>It may have moved or your access may have changed.</p>
              <button className="files-text-button" onClick={() => navigate()}>
                Back to files
              </button>
            </div>
          )
        ) : (
          <div
            className="files-browser"
            onDragOver={(event) => {
              if (canEdit) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (canEdit && event.dataTransfer.files.length)
                void upload(event.dataTransfer.files);
            }}
          >
            <div className="files-toolbar">
              <h1>
                {parentId
                  ? (crumbs.at(-1)?.name ?? "Folder")
                  : shared
                    ? "Shared with me"
                    : "My files"}
              </h1>
              <div className="files-toolbar-actions">
                {canEdit && (
                  <>
                    <details ref={newMenu} className="files-new-menu">
                      <summary className="primary-button">
                        <Plus size={18} />
                        New
                      </summary>
                      <div className="files-new-options">
                        {(
                          [
                            "folder",
                            "document",
                            "spreadsheet",
                            "presentation",
                            "markdown",
                            "text",
                          ] as const
                        ).map((type) => (
                          <button
                            key={type}
                            onClick={(event) => {
                              event.currentTarget
                                .closest("details")
                                ?.removeAttribute("open");
                              show({ kind: "new", type });
                            }}
                          >
                            {type === "folder" ? (
                              <Folder size={18} />
                            ) : (
                              <FileText size={18} />
                            )}
                            {
                              {
                                folder: "Folder",
                                document: "Document",
                                spreadsheet: "Spreadsheet",
                                presentation: "Presentation",
                                markdown: "Markdown",
                                text: "Text file",
                              }[type]
                            }
                          </button>
                        ))}
                      </div>
                    </details>
                    <button
                      className="files-upload-button"
                      aria-label="Upload"
                      disabled={busy}
                      onClick={() => input.current?.click()}
                    >
                      <Upload size={18} />
                      <span>Upload</span>
                    </button>
                  </>
                )}
                <div
                  className="files-view-toggle"
                  role="group"
                  aria-label="File view"
                >
                  <button
                    aria-label="Grid view"
                    aria-pressed={layout === "grid"}
                    onClick={() => setLayout("grid")}
                  >
                    <LayoutGrid size={18} />
                  </button>
                  <button
                    aria-label="List view"
                    aria-pressed={layout === "list"}
                    onClick={() => setLayout("list")}
                  >
                    <List size={19} />
                  </button>
                </div>
              </div>
            </div>
            <div className="files-search-row">
              <label className="files-search">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search this folder"
                  aria-label="Search this folder"
                />
              </label>
              <span>
                {data
                  ? `${items.length} ${items.length === 1 ? "item" : "items"}`
                  : ""}
              </span>
            </div>
            {data === undefined ? (
              <div aria-busy="true" aria-label="Loading files">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={index} className="skeleton files-row-skeleton" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="files-empty">
                <FolderOpen size={46} strokeWidth={1.2} />
                <h2>
                  {search
                    ? "No matching files"
                    : shared
                      ? "Nothing shared yet"
                      : "A place for your files"}
                </h2>
                <p>
                  {search
                    ? "Try another file name."
                    : shared
                      ? "Files and folders people share with you will appear here."
                      : "Drop files here, or create something new."}
                </p>
                {canEdit && !search && (
                  <button
                    className="primary-button"
                    onClick={() => input.current?.click()}
                  >
                    <Upload size={17} />
                    Upload files
                  </button>
                )}
              </div>
            ) : (
              <FileList
                nodes={items as Node[]}
                layout={layout}
                selected={selected?._id}
                select={setSelected}
                open={open}
                actions={(node, point) => {
                  setSelected(node);
                  show({ kind: "actions", node });
                  if (point) setMenuPoint(point);
                }}
                ownId={viewer?._id}
              />
            )}
          </div>
        )}
      </FilesSidebar>
      <Dialog.Root
        open={!!modal}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setModal(null);
            setError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={`dialog-overlay ${menuPoint && modal?.kind === "actions" ? "files-context-overlay" : ""}`} />
          <Dialog.Content
            className={`management-dialog files-dialog ${menuPoint && modal?.kind === "actions" ? "files-context-menu" : ""}`}
            style={menuPoint && modal?.kind === "actions" ? {
              left: Math.max(8, Math.min(menuPoint.x, window.innerWidth - 288)),
              top: Math.max(8, Math.min(menuPoint.y, window.innerHeight - 370)),
            } : undefined}
            aria-describedby={undefined}
          >
            <Dialog.Title>
              {modal?.kind === "new"
                ? `New ${{ folder: "folder", document: "document", spreadsheet: "spreadsheet", presentation: "presentation", markdown: "Markdown file", text: "text file" }[modal.type]}`
                : modal?.kind === "rename"
                  ? "Rename"
                  : modal?.kind === "share"
                    ? `Share ${modal.node.name}`
                    : modal?.kind === "move"
                      ? `Move ${modal.node.name}`
                      : modal?.node.name}
            </Dialog.Title>
            <Dialog.Close
              className="close-preview"
              aria-label="Close"
              disabled={busy}
            >
              <X size={20} />
            </Dialog.Close>
            {modal?.kind === "new" && (
              <form onSubmit={create}>
                <label>
                  Name
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={
                      modal.type === "folder" ? "New folder" : "Untitled"
                    }
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={busy || !name.trim()}
                >
                  {busy ? "Creating…" : "Create"}
                </button>
              </form>
            )}
            {modal?.kind === "rename" && (
              <form onSubmit={doRename}>
                <label>
                  Name
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={busy || !name.trim()}
                >
                  Save name
                </button>
              </form>
            )}
            {modal?.kind === "actions" && (
              <div className="files-action-list">
                <button
                  onClick={() => {
                    open(modal.node);
                    setModal(null);
                  }}
                >
                  <ArrowUpRight size={18} />
                  Open
                </button>
                {modal.node.kind === "file" && (
                  <a
                    href={`/api/files/content/${modal.node._id}?download=1`}
                    download={modal.node.name}
                  >
                    <Download size={18} />
                    Download
                  </a>
                )}
                <button
                  onClick={() => show({ kind: "share", node: modal.node })}
                >
                  <Share2 size={18} />
                  Share
                </button>
                {modal.node.canEdit && (
                  <button
                    onClick={() => show({ kind: "rename", node: modal.node })}
                  >
                    <Pencil size={18} />
                    Rename
                  </button>
                )}
                {modal.node.isOwner && (
                  <>
                    <button
                      onClick={() => show({ kind: "move", node: modal.node })}
                    >
                      <Folder size={18} />
                      Move
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => doTrash(modal.node)}
                    >
                      <Trash2 size={18} />
                      Move to trash
                    </button>
                  </>
                )}
              </div>
            )}
            {modal?.kind === "share" && (
              <ShareDialog node={modal.node} onError={setError} />
            )}
            {modal?.kind === "move" && (
              <MoveDialog
                node={modal.node}
                onMove={async (target) => {
                  setBusy(true);
                  try {
                    await move({ id: modal.node._id, parentId: target });
                    setModal(null);
                    setMessage("Moved.");
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
                busy={busy}
              />
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
    </FileMoveProvider>
  );
}
function FileList({
  nodes,
  layout,
  selected,
  select,
  open,
  actions,
  ownId,
}: {
  nodes: Node[];
  layout: "list" | "grid";
  selected?: string;
  select: (node: Node) => void;
  open: (node: Node) => void;
  actions: (node: Node, point?: { x: number; y: number }) => void;
  ownId?: Id<"people">;
}) {
  const drag = useFileMove();
  const context = (event: React.MouseEvent, node: Node) => { event.preventDefault(); if (drag.isGesturing()) return; select(node); actions(node, { x: event.clientX, y: event.clientY }); };
  const scroll = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 74,
    overscan: 8,
  });
  if (layout === "grid")
    return (
      <div className="files-card-grid">
        {nodes.map((node) => (
          <div
            key={node._id}
            {...drag.rowProps(node)}
            onContextMenu={(event) => context(event, node)}
            className={`files-grid-item ${selected === node._id ? "selected" : ""}`}
            onClick={() => select(node)}
          >
            <button className="files-grid-open" onClick={() => open(node)}>
              <FileIcon node={node} />
              <span>{node.name}</span>
            </button>
            <button
              className="files-icon-button"
              aria-label={`Actions for ${node.name}`}
              onClick={() => actions(node)}
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
        ))}
      </div>
    );
  return (
    <div className="files-table" role="table" aria-label="Files">
      <div className="files-table-header" role="row">
        <span role="columnheader">Name</span>
        <span role="columnheader">Owner</span>
        <span role="columnheader">Modified</span>
        <span role="columnheader">Size</span>
        <span />
      </div>
      <div ref={scroll} className="files-table-scroll">
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((row) => {
            const node = nodes[row.index];
            return (
              <div
                key={node._id}
                {...drag.rowProps(node)}
                onContextMenu={(event) => context(event, node)}
                role="row"
                aria-selected={selected === node._id}
                className={`files-table-row ${selected === node._id ? "selected" : ""}`}
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
                onClick={() => select(node)}
              >
                <div role="cell">
                  <button
                    className="files-name-button"
                    onClick={() => open(node)}
                  >
                    <FileIcon node={node} />
                    <span>{node.name}</span>
                  </button>
                </div>
                <span role="cell" className="files-owner">
                  {node.ownerId === ownId ? "Me" : "Shared"}
                </span>
                <span role="cell" className="files-modified">
                  {new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    day: "numeric",
                  }).format(node.updatedAt)}
                </span>
                <span role="cell" className="files-size">
                  {node.kind === "folder" ? "—" : sizeLabel(node.size)}
                </span>
                <button
                  className="files-icon-button"
                  aria-label={`Actions for ${node.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    actions(node);
                  }}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function FileIcon({ node }: { node: Pick<Node, "kind" | "name" | "mime"> }) {
  const isFolder = node.kind === "folder";
  const Icon = isFolder
    ? Folder
    : node.mime.startsWith("image/")
      ? ImageIcon
      : node.mime.startsWith("video/")
        ? Film
        : node.mime.startsWith("audio/")
          ? Music
          : /\.xlsx?$/i.test(node.name)
            ? Sheet
            : /\.pptx?$/i.test(node.name)
              ? Presentation
              : /\.(ts|js|json|tsx|jsx|py|css)$/i.test(node.name)
                ? FileCode
                : /\.(md|txt|docx?|pdf)$/i.test(node.name)
                  ? FileText
                  : File;
  return (
    <span
      className={`files-type-icon ${isFolder ? "folder" : Icon === ImageIcon ? "image" : Icon === Sheet ? "sheet" : Icon === Presentation ? "slides" : "document"}`}
    >
      <Icon size={27} strokeWidth={1.45} />
    </span>
  );
}
function ShareDialog({
  node,
  onError,
}: {
  node: Node;
  onError: (error: string) => void;
}) {
  const [mode, setMode] = useState<"people" | "links">("people");
  if (!node.isOwner)
    return (
      <p>
        Only the owner can change sharing. Your access is{" "}
        {node.canEdit ? "editor" : "viewer"}.
      </p>
    );
  return (
    <>
      <div
        className="segmented share-mode"
        role="group"
        aria-label="Sharing method"
      >
        <button
          type="button"
          aria-pressed={mode === "people"}
          onClick={() => setMode("people")}
        >
          People
        </button>
        <button
          type="button"
          aria-pressed={mode === "links"}
          onClick={() => setMode("links")}
        >
          Shareable links
        </button>
      </div>
      {mode === "people" ? (
        <PeopleSharing node={node} onError={onError} />
      ) : (
        <ShareLinks fileId={node._id} />
      )}
    </>
  );
}
function PeopleSharing({
  node,
  onError,
}: {
  node: Node;
  onError: (error: string) => void;
}) {
  const recipients = useQuery(api.files.recipients, node.isOwner ? {} : "skip"),
    grants = useQuery(
      api.files.grants,
      node.isOwner ? { id: node._id } : "skip",
    ),
    share = useMutation(api.files.share);
  const [person, setPerson] = useState(""),
    [role, setRole] = useState<"viewer" | "editor">("viewer"),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      await share({ id: node._id, personId: person as Id<"people">, role });
      setPerson("");
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (!node.isOwner)
    return (
      <p>
        Only the owner can change sharing. Your access is{" "}
        {node.canEdit ? "editor" : "viewer"}.
      </p>
    );
  return (
    <>
      <p className="muted">
        Share with people in your Ovela home.{" "}
        {node.kind === "folder"
          ? "Access also applies to files inside this folder."
          : ""}
      </p>
      <form onSubmit={submit}>
        <label>
          Person
          <select
            required
            value={person}
            onChange={(event) => setPerson(event.target.value)}
          >
            <option value="">Choose a person</option>
            {recipients
              ?.filter((p) => p._id !== node.ownerId)
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} · {p.email}
                </option>
              ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Access level">
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
        <button
          className="primary-button"
          disabled={!person || busy}
          style={{ marginTop: 20 }}
        >
          <Share2 size={17} />
          Share
        </button>
      </form>
      <div className="files-grants">
        {grants?.map((grant) => (
          <div key={grant.personId}>
            <span>
              {recipients?.find((person) => person._id === grant.personId)
                ?.name ?? "Person"}
              <small>{grant.role === "editor" ? "Can edit" : "Can view"}</small>
            </span>
            <button
              className="files-text-button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await share({
                    id: node._id,
                    personId: grant.personId,
                    role: null,
                  });
                } catch (err) {
                  onError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
function MoveDialog({
  node,
  onMove,
  busy,
}: {
  node: Node;
  onMove: (target?: Id<"files">) => void;
  busy: boolean;
}) {
  const [target, setTarget] = useState<Id<"files"> | undefined>();
  const data = useQuery(api.files.list, { parentId: target });
  return (
    <>
      <p className="muted">
        Choose a destination. Moving a file may change who can access it through
        its folder.
      </p>
      <button
        className="files-text-button"
        onClick={() => setTarget(undefined)}
      >
        My files
      </button>
      {data?.breadcrumbs.map((crumb) => (
        <button
          className="files-text-button"
          key={crumb._id}
          onClick={() => setTarget(crumb._id)}
        >
          <ChevronRight size={14} />
          {crumb.name}
        </button>
      ))}
      <div className="files-move-folders">
        {data?.items
          .filter(
            (folder) =>
              folder.kind === "folder" &&
              folder._id !== node._id &&
              folder.ownerId === node.ownerId,
          )
          .map((folder) => (
            <button key={folder._id} onClick={() => setTarget(folder._id)}>
              <Folder size={18} />
              {folder.name}
              <ChevronRight size={16} />
            </button>
          ))}
      </div>
      <button
        className="primary-button"
        disabled={busy || !data?.canEdit}
        onClick={() => onMove(target)}
      >
        Move here
      </button>
    </>
  );
}
function sizeLabel(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
        .replace(/\[CONVEX[^\]]*\]\s*/g, "")
        .split("Called by client")[0]
    : "Something went wrong. Please try again.";
}
