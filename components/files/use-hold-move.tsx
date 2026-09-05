"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import "./hold-move.css";

export type Movable = { _id: string; name: string; kind: "file" | "folder"; ownerId: string; isOwner?: boolean; canEdit?: boolean };
type Session<T> = { node: T; pointer: number; x: number; y: number; active: boolean; source: HTMLElement; target?: T };

export function useHoldMove<T extends Movable>(nodes: T[], onMove?: (node: T, target: T) => void | Promise<void>, resolve?: (element: HTMLElement) => T | undefined) {
  const [visual, setVisual] = useState<{ phase: "holding" | "moving"; source: T; target?: T; x: number; y: number }>();
  const indicator = useRef<HTMLDivElement>(null);
  const session = useRef<Session<T> | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const suppressUntil = useRef(0);
  const current = useRef({ nodes, onMove, resolve });
  current.current = { nodes, onMove, resolve };
  useEffect(() => () => cleanup.current(), []);

  function begin(event: ReactPointerEvent<HTMLElement>, node: T) {
    if (!current.current.onMove || !node.isOwner || event.button !== 0 || !event.isPrimary || session.current || (event.target as HTMLElement).closest('.files-icon-button, .ovela-folder-disclosure')) return;
    const active: Session<T> = { node, pointer: event.pointerId, x: event.clientX, y: event.clientY, active: false, source: event.currentTarget };
    session.current = active;
    setVisual({ phase: "holding", source: node, x: event.clientX, y: event.clientY });
    const timer = window.setTimeout(() => {
      if (session.current !== active) return;
      active.active = true;
      try { active.source.setPointerCapture(active.pointer); } catch { /* A cancelled gesture must not move a file. */ finish(); return; }
      setVisual({ phase: "moving", source: node, x: active.x, y: active.y });
    }, 500);
    function finish() {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      if (active.active) suppressUntil.current = Date.now() + 450;
      if (active.source.hasPointerCapture(active.pointer)) active.source.releasePointerCapture(active.pointer);
      session.current = null;
      setVisual(undefined);
      cleanup.current = () => {};
    }
    function move(event: PointerEvent) {
      if (event.pointerId !== active.pointer) return;
      if (!active.active) {
        if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) { suppressUntil.current = Date.now() + 450; finish(); }
        return;
      }
      event.preventDefault();
      if (indicator.current) { indicator.current.style.left = `${event.clientX + 14}px`; indicator.current.style.top = `${event.clientY + 18}px`; }
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-move-id]");
      const candidate = row ? current.current.resolve?.(row) ?? current.current.nodes.find(item => item._id === row.dataset.moveId) : undefined;
      const target = candidate?.kind === "folder" && candidate._id !== node._id && candidate.canEdit && candidate.ownerId === node.ownerId ? candidate : undefined;
      if (active.target?._id !== target?._id) {
        active.target = target;
        setVisual({ phase: "moving", source: node, target, x: event.clientX, y: event.clientY });
      }
    }
    function up(event: PointerEvent) {
      if (event.pointerId !== active.pointer) return;
      const target = active.active ? active.target : undefined;
      if (active.active) event.preventDefault();
      finish();
      if (target) void current.current.onMove?.(node, target);
    }
    function cancel(event: Event) { if ("pointerId" in event && event.pointerId !== active.pointer) return; finish(); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); finish(); } }
    cleanup.current = finish;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
  }
  function suppressClick(event: ReactMouseEvent) {
    if (Date.now() < suppressUntil.current || session.current?.active) { event.preventDefault(); event.stopPropagation(); suppressUntil.current = 0; }
  }
  return {
    isGesturing: () => session.current !== null,
    rowProps: (node: T) => ({
      "data-move-id": node._id,
      "data-move-state": visual?.source._id === node._id ? visual.phase : visual?.target?._id === node._id ? "target" : undefined,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => begin(event, node),
      onClickCapture: suppressClick,
      onDragStart: (event: ReactMouseEvent) => { if (session.current) { event.preventDefault(); suppressUntil.current = Date.now() + 450; cleanup.current(); } },
    }),
    hint: visual ? <div ref={indicator} className="files-move-indicator" style={{ left: visual.x + 14, top: visual.y + 18 }} role="status">{visual.phase === "holding" ? "Hold to move…" : visual.target ? `Move to ${visual.target.name}` : "Drop onto a folder · Esc to cancel"}</div> : null,
  };
}


const FileMoveContext = createContext<ReturnType<typeof useHoldMove<Movable>> | null>(null);
export function FileMoveProvider({ children, onMove }: { children: ReactNode; onMove: (node: Movable, target: Movable) => void | Promise<void> }) {
  const registered = useRef(new Map<HTMLElement, Movable>());
  const drag = useHoldMove<Movable>([], onMove, element => registered.current.get(element));
  const value = { ...drag, rowProps: (node: Movable) => ({
    ...drag.rowProps(node),
    ref: (element: HTMLElement | null) => {
      if (!element) return;
      registered.current.set(element, node);
      return () => { registered.current.delete(element); };
    },
  }) };
  return <FileMoveContext.Provider value={value}>{children}{drag.hint}</FileMoveContext.Provider>;
}
export function useFileMove() {
  const value = useContext(FileMoveContext);
  if (!value) throw new Error("File moves require a workspace provider.");
  return value;
}
