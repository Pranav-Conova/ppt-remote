import { beforeAll, describe, expect, it } from "vitest";
import { DrawLayer } from "./DrawLayer";
import { matchGesture } from "../ui/GestureTest";
import { DEFAULT_SETTINGS } from "../lib/settings";

// Just enough of a canvas for DrawLayer: it only draws, never reads back.
function fakeCanvas() {
  const noop = () => {};
  const ctx = new Proxy({}, { get: () => noop, set: () => true });
  return { width: 100, height: 100, clientWidth: 100, clientHeight: 100, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

/** Number of strokes on the current slide. */
const count = (d: DrawLayer) => (d as unknown as { list(): unknown[] }).list().length;

function stroke(d: DrawLayer) {
  d.beginStroke(0.1, 0.1);
  d.addPoint(0.2, 0.2);
  d.endStroke();
}

describe("DrawLayer undo", () => {
  it("removes strokes one at a time", () => {
    const d = new DrawLayer(fakeCanvas());
    stroke(d);
    stroke(d);
    d.undo();
    expect(count(d)).toBe(1);
    d.undo();
    d.undo(); // nothing left: no-op
    expect(count(d)).toBe(0);
  });

  it("brings back everything a Clear removed, then keeps undoing strokes", () => {
    const d = new DrawLayer(fakeCanvas());
    stroke(d);
    stroke(d);
    expect(d.clear()).toBe(true);
    expect(count(d)).toBe(0);
    d.undo();
    expect(count(d)).toBe(2);
    d.undo();
    expect(count(d)).toBe(1);
  });

  it("undoes a stroke drawn after a Clear before the Clear itself", () => {
    const d = new DrawLayer(fakeCanvas());
    stroke(d);
    d.clear();
    stroke(d);
    d.undo();
    expect(count(d)).toBe(0);
    d.undo();
    expect(count(d)).toBe(1);
  });

  it("does not record a Clear of an empty slide", () => {
    const d = new DrawLayer(fakeCanvas());
    stroke(d);
    d.clear();
    expect(d.clear()).toBe(false);
    d.undo();
    expect(count(d)).toBe(1);
  });

  it("keeps history per slide", () => {
    const d = new DrawLayer(fakeCanvas());
    stroke(d);
    d.clear();
    d.setSlide(1);
    stroke(d);
    d.undo();
    expect(count(d)).toBe(0);
    d.setSlide(0);
    d.undo();
    expect(count(d)).toBe(1);
  });
});

describe("matchGesture", () => {
  it("names the gesture with the same finger pattern", () => {
    expect(matchGesture(DEFAULT_SETTINGS.gestures, [0, 0, 0, 0, 1])).toBe("next");
    expect(matchGesture(DEFAULT_SETTINGS.gestures, [1, 1, 0, 0, 0])).toBe("draw");
  });

  it("returns null for a pattern no gesture uses", () => {
    expect(matchGesture(DEFAULT_SETTINGS.gestures, [1, 1, 1, 1, 1])).toBeNull();
  });
});
