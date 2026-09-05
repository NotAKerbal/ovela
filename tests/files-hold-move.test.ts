import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Exercise the pointer/timer controller without mounting the visual overlay.
vi.mock("react", () => ({ createContext: () => ({}), useContext: () => null, useRef: (current: unknown) => ({ current }), useState: () => [undefined, () => {}], useEffect: () => {} }));
import { useHoldMove } from "../components/files/use-hold-move";

describe("hold to move files", () => {
  const source = { _id: "source", name: "Note.md", kind: "file" as const, ownerId: "me", isOwner: true, canEdit: true };
  const folder = { ...source, _id: "folder", name: "Notes", kind: "folder" as const };
  let browser: EventTarget;
  let capture: ReturnType<typeof vi.fn>;
  let targetId: string | undefined;
  function pointer(type: string, x = 20) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, clientX: x, clientY: 20 });
    browser.dispatchEvent(event);
    return event;
  }
  function gesture(crossPane = false) {
    const onMove = vi.fn();
    const hook = useHoldMove(crossPane ? [] : [source, folder], onMove, crossPane ? element => element.dataset.moveId === folder._id ? folder : undefined : undefined);
    hook.rowProps(source).onPointerDown({ button: 0, isPrimary: true, pointerId: 1, clientX: 20, clientY: 20, target: { closest: () => null }, currentTarget: { setPointerCapture: capture, hasPointerCapture: () => true, releasePointerCapture: vi.fn() } } as never);
    return { hook, onMove };
  }
  beforeEach(() => {
    vi.useFakeTimers();
    capture = vi.fn();
    targetId = undefined;
    browser = Object.assign(new EventTarget(), { setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args) });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", { elementFromPoint: () => ({ closest: () => ({ dataset: { moveId: targetId } }) }) });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("arms after half a second and moves only when released over a writable folder", () => {
    const { hook, onMove } = gesture();
    vi.advanceTimersByTime(499);
    expect(capture).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(capture).toHaveBeenCalledWith(1);
    targetId = folder._id;
    pointer("pointermove", 80);
    pointer("pointerup", 80);
    expect(onMove).toHaveBeenCalledExactlyOnceWith(source, folder);
    const click = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    hook.rowProps(source).onClickCapture(click as never);
    expect(click.preventDefault).toHaveBeenCalledOnce();
  });
  it("resolves destinations registered by another pane even outside the current list", () => {
    const { onMove } = gesture(true);
    vi.advanceTimersByTime(500);
    targetId = folder._id;
    pointer("pointermove", 80);
    pointer("pointerup", 80);
    expect(onMove).toHaveBeenCalledExactlyOnceWith(source, folder);
  });
  it("cancels pre-hold movement so scrolling never moves a file", () => {
    const { onMove, hook } = gesture();
    pointer("pointermove", 40);
    vi.advanceTimersByTime(1200);
    targetId = folder._id;
    pointer("pointerup", 40);
    expect(capture).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(hook.isGesturing()).toBe(false);
  });
  it.each(["Escape", "pointercancel", "lostpointercapture"])("cancels an armed drag with %s", (method) => {
    const { onMove, hook } = gesture();
    vi.advanceTimersByTime(500);
    targetId = folder._id;
    pointer("pointermove", 80);
    if (method === "Escape") { const event = new Event("keydown"); Object.assign(event, { key: "Escape" }); browser.dispatchEvent(event); }
    else pointer(method);
    pointer("pointerup", 80);
    expect(onMove).not.toHaveBeenCalled();
    expect(hook.isGesturing()).toBe(false);
  });
  it("does not drop onto itself or another file", () => {
    const { onMove } = gesture();
    vi.advanceTimersByTime(500);
    targetId = source._id;
    pointer("pointermove", 80);
    pointer("pointerup", 80);
    expect(onMove).not.toHaveBeenCalled();
  });
});
