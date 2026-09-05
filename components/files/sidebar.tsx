"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Users,
  FileText,
  FileCode,
  FileImage,
  Film,
  Music,
  File,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import "./tree.css";
import { useFileMove } from "./use-hold-move";
import type { Id } from "@/convex/_generated/dataModel";

export function useFilesSidebar() {
  const [open, setOpen] = useState(true),
    [width, setWidth] = useState(264);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("ovela-files-sidebar") || "null",
      );
      setOpen(window.innerWidth > 760 && (saved?.open ?? true));
      if (typeof saved?.width === "number")
        setWidth(Math.max(200, Math.min(420, saved.width)));
    } catch {
      setOpen(window.innerWidth > 760);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          "ovela-files-sidebar",
          JSON.stringify({ open, width }),
        );
      } catch {}
  }, [open, width, ready]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "b"
      )
        return;
      if (
        target instanceof Element &&
        target.closest(
          'input,textarea,select,[contenteditable="true"],.cm-editor',
        )
      )
        return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return { open, setOpen, width, setWidth };
}

export function FilesSidebar({
  state,
  shared,
  parentId,
  fileId,
  breadcrumbs,
  navigate,
  children,
}: {
  state: ReturnType<typeof useFilesSidebar>;
  shared: boolean;
  parentId?: Id<"files">;
  fileId?: Id<"files">;
  breadcrumbs: Array<{ _id: Id<"files">; name: string }>;
  navigate: (
    folder?: Id<"files">,
    shared?: boolean,
    fileId?: Id<"files">,
  ) => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { open, width, setOpen, setWidth } = state;
  return (
    <div
      className={`files-body ${open ? "sidebar-open" : ""} ${dragging ? "sidebar-dragging" : ""}`}
      style={{ "--files-sidebar-width": `${width}px` } as CSSProperties}
    >
      {open && (
        <button
          className="files-drawer-backdrop"
          aria-label="Close file navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="files-sidebar"
        className="files-sidebar"
        inert={!open}
        aria-label="File navigation"
        onTouchStart={(event) => {
          const point = event.touches[0];
          start.current = { x: point.clientX, y: point.clientY };
        }}
        onTouchEnd={(event) => {
          const point = event.changedTouches[0];
          if (
            start.current &&
            point.clientX - start.current.x < -70 &&
            Math.abs(point.clientY - start.current.y) < 60
          )
            setOpen(false);
          start.current = null;
        }}
      >
        <div className="files-sidebar-content">
          <nav className="files-main-nav" aria-label="File spaces">
            <button
              className={!shared ? "active" : ""}
              onClick={() => navigate(undefined, false)}
            >
              <FolderOpen size={20} />
              Files
            </button>
            <button
              className={shared ? "active" : ""}
              onClick={() => navigate(undefined, true)}
            >
              <Users size={20} />
              Shared with me
            </button>
          </nav>
          <FolderTree
            key={shared ? "shared" : "files"}
            shared={shared}
            selected={fileId ?? parentId}
            breadcrumbs={breadcrumbs}
            navigate={navigate}
          />
          <p className="files-sidebar-help">
            Drag the edge to resize or hide.
            <br />
            ⌘B / Ctrl+B to toggle.
          </p>
        </div>
        <div
          role="separator"
          aria-label="Resize file sidebar"
          aria-orientation="vertical"
          aria-valuemin={200}
          aria-valuemax={420}
          aria-valuenow={width}
          tabIndex={open ? 0 : -1}
          className="files-sidebar-resizer"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              width <= 200 ? setOpen(false) : setWidth(width - 20);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setWidth(Math.min(420, width + 20));
            }
            if (event.key === "Home") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            start.current = { x: event.clientX - width, y: event.clientY };
          }}
          onPointerMove={(event) => {
            if (!dragging || !start.current) return;
            const next = event.clientX - start.current.x;
            setWidth(Math.max(0, Math.min(420, next)));
          }}
          onPointerUp={(event) => {
            if (!dragging) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            setDragging(false);
            if (width < 140) {
              setOpen(false);
              setWidth(264);
            } else setWidth(Math.max(200, width));
            start.current = null;
          }}
          onPointerCancel={() => {
            setDragging(false);
            setWidth(Math.max(200, width));
            start.current = null;
          }}
        />
      </aside>
      <main className="files-content" id="files-main">
        {children}
      </main>
    </div>
  );
}

function FolderTree({
  shared,
  selected,
  breadcrumbs,
  navigate,
}: {
  shared: boolean;
  selected?: Id<"files">;
  breadcrumbs: Array<{ _id: Id<"files">; name: string }>;
  navigate: (id?: Id<"files">, shared?: boolean, fileId?: Id<"files">) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string>();
  const path = breadcrumbs.map((crumb) => crumb._id).join(",");
  useEffect(() => {
    // Reveal the current location when navigating from the main browser or a deep link.
    setExpanded(
      (previous) => new Set([...previous, ...path.split(",").filter(Boolean)]),
    );
  }, [path]);
  useEffect(() => {
    setFocused(selected);
  }, [selected]);
  function toggle(id: string, open?: boolean) {
    setExpanded((previous) => {
      const next = new Set(previous);
      (open ?? !next.has(id)) ? next.add(id) : next.delete(id);
      return next;
    });
  }
  return (
    <div
      className="ovela-folder-navigation"
      role="tree"
      aria-label={shared ? "Shared files and folders" : "Files and folders"}
      onKeyDown={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-tree-row]",
        );
        if (!row) return;
        const rows = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>("[data-tree-row]"),
        );
        const index = rows.indexOf(row),
          id = row.dataset.treeRow!;
        let next: HTMLElement | undefined;
        switch (event.key) {
          case "ArrowDown":
            next = rows[index + 1];
            break;
          case "ArrowUp":
            next = rows[index - 1];
            break;
          case "Home":
            next = rows[0];
            break;
          case "End":
            next = rows.at(-1);
            break;
          case "ArrowRight":
            if (row.dataset.treeKind !== "folder") break;
            if (!expanded.has(id)) toggle(id, true);
            else if (rows[index + 1]?.dataset.treeParent === id)
              next = rows[index + 1];
            break;
          case "ArrowLeft":
            if (row.dataset.treeKind === "folder" && expanded.has(id))
              toggle(id, false);
            else
              next = rows.find(
                (item) => item.dataset.treeRow === row.dataset.treeParent,
              );
            break;
          case "Enter":
          case " ":
            if (row.dataset.treeKind === "file")
              navigate(
                row.dataset.treeParent
                  ? (row.dataset.treeParent as Id<"files">)
                  : undefined,
                shared,
                id as Id<"files">,
              );
            else navigate(id as Id<"files">, shared);
            break;
          default:
            return;
        }
        event.preventDefault();
        next?.focus();
      }}
    >
      <FolderBranches
        shared={shared}
        selected={selected}
        navigate={navigate}
        expanded={expanded}
        toggle={toggle}
        focused={focused}
        setFocused={setFocused}
      />
    </div>
  );
}

type BranchProps = {
  parentId?: Id<"files">;
  shared: boolean;
  selected?: Id<"files">;
  navigate: (id?: Id<"files">, shared?: boolean, fileId?: Id<"files">) => void;
  expanded: Set<string>;
  toggle: (id: string, open?: boolean) => void;
  focused?: string;
  setFocused: (id: string) => void;
  depth?: number;
};
function FolderBranches({
  parentId,
  shared,
  selected,
  navigate,
  expanded,
  toggle,
  focused,
  setFocused,
  depth = 0,
}: BranchProps) {
  const drag = useFileMove();
  // Fetch children only for open branches; expanding the tree never loads entire subtrees.
  const data = useQuery(api.files.list, {
    ...(parentId ? { parentId } : {}),
    shared,
  });
  if (!data)
    return (
      <div
        id={parentId ? `folder-children-${parentId}` : undefined}
        role={depth ? "group" : undefined}
        className="files-tree-loading skeleton"
        aria-label="Loading files and folders"
      />
    );
  const folders = [...data.items].sort(
    (a, b) =>
      Number(b.kind === "folder") - Number(a.kind === "folder") ||
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
  );
  if (!folders.length)
    return depth === 0 ? (
      <p className="files-tree-empty">
        {shared ? "Shared files appear here." : "Your files appear here."}
      </p>
    ) : (
      <ul
        id={`folder-children-${parentId}`}
        role="group"
        className="ovela-folder-branches"
      />
    );
  return (
    <ul
      className="ovela-folder-branches"
      id={parentId ? `folder-children-${parentId}` : undefined}
      role={depth ? "group" : "none"}
    >
      {folders.map((folder, index) => {
        const isFolder = folder.kind === "folder";
        const isOpen = isFolder && expanded.has(folder._id),
          isSelected = selected === folder._id;
        const tabStop = focused
          ? focused === folder._id
          : selected
            ? isSelected
            : depth === 0 && index === 0;
        return (
          <li key={folder._id} role="none">
            <div
              {...drag.rowProps(folder)}
              onContextMenu={(event) => { if (drag.isGesturing()) event.preventDefault(); }}
              role="treeitem"
              aria-expanded={isFolder ? isOpen : undefined}
              aria-selected={isSelected}
              aria-level={depth + 1}
              aria-owns={isOpen ? `folder-children-${folder._id}` : undefined}
              className={`ovela-folder-row${isSelected ? " is-selected" : ""}`}
              style={{ "--folder-depth": depth } as CSSProperties}
              data-tree-row={folder._id}
              data-tree-kind={folder.kind}
              data-tree-parent={parentId ?? ""}
              tabIndex={tabStop ? 0 : -1}
              onFocus={() => setFocused(folder._id)}
              onClick={(event) => {
                event.currentTarget.focus();
                isFolder
                  ? navigate(folder._id, shared)
                  : navigate(parentId, shared, folder._id);
              }}
            >
              {isFolder ? (
                <button
                  className="ovela-folder-disclosure"
                  tabIndex={-1}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${folder.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.currentTarget.parentElement?.focus();
                    toggle(folder._id);
                  }}
                >
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ) : (
                <span className="ovela-tree-leaf-spacer" aria-hidden="true" />
              )}
              {!isFolder ? (
                <TreeFileIcon name={folder.name} mime={folder.mime} />
              ) : isOpen ? (
                <FolderOpen size={17} aria-hidden="true" />
              ) : (
                <Folder size={17} aria-hidden="true" />
              )}
              <span>{folder.name}</span>
            </div>
            {isOpen && (
              <FolderBranches
                parentId={folder._id}
                shared={shared}
                selected={selected}
                navigate={navigate}
                expanded={expanded}
                toggle={toggle}
                focused={focused}
                setFocused={setFocused}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TreeFileIcon({ name, mime }: { name: string; mime?: string }) {
  const Icon = mime?.startsWith("image/")
    ? FileImage
    : mime?.startsWith("video/")
      ? Film
      : mime?.startsWith("audio/")
        ? Music
        : /\.([cm]?[jt]sx?|json|css|html|yaml|yml|sh)$/i.test(name)
          ? FileCode
          : /\.(md|markdown|txt|docx?|odt|pdf)$/i.test(name)
            ? FileText
            : File;
  return <Icon size={17} aria-hidden="true" />;
}
