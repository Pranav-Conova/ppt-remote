import { describe, expect, it } from "vitest";
import { fingersUp, type Point } from "./fingers";
import { GestureEngine, type HandAction } from "./gestureEngine";
import { DEFAULT_SETTINGS } from "../lib/settings";

// Builds a synthetic upright hand (wrist at the bottom) in camera coordinates.
// Pinky is on the left of the image and thumb on the right. Each finger is up
// or folded according to pattern.
function hand(pattern: number[], opts: { mirror?: boolean; wristY?: number } = {}): Point[] {
  const wy = opts.wristY ?? 0.6;
  const lm: Point[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: wy }));
  lm[0] = { x: 0.5, y: wy };
  // Thumb: CMC/MCP/IP/TIP go to the right; extended puts the tip further right.
  lm[1] = { x: 0.55, y: wy - 0.05 };
  lm[2] = { x: 0.58, y: wy - 0.08 };
  lm[3] = { x: 0.6, y: wy - 0.1 };
  lm[4] = { x: pattern[0] ? 0.66 : 0.56, y: wy - 0.12 };
  const xs = [0.55, 0.5, 0.45, 0.4]; // index..pinky
  xs.forEach((x, i) => {
    const base = 5 + i * 4;
    lm[base] = { x, y: wy - 0.15 }; // MCP
    lm[base + 1] = { x, y: wy - 0.2 }; // PIP
    lm[base + 2] = { x, y: wy - 0.23 }; // DIP
    lm[base + 3] = { x, y: pattern[i + 1] ? wy - 0.28 : wy - 0.14 }; // TIP
  });
  if (opts.mirror) for (const p of lm) p.x = 1 - p.x;
  return lm;
}

describe("fingersUp", () => {
  for (const [name, pattern] of Object.entries(DEFAULT_SETTINGS.gestures)) {
    it(`detects ${name} ${pattern.join("")}`, () => {
      expect(fingersUp(hand(pattern))).toEqual(pattern);
      expect(fingersUp(hand(pattern, { mirror: true }))).toEqual(pattern);
    });
  }
});

describe("GestureEngine", () => {
  function setup() {
    const actions: HandAction[] = [];
    const modes: string[] = [];
    let lost = 0;
    const engine = new GestureEngine(DEFAULT_SETTINGS.gestures, {
      action: (a) => actions.push(a),
      pointer: (_x, _y, m) => modes.push(m),
      lost: () => lost++,
    });
    return { engine, actions, modes, lost: () => lost };
  }

  it("fires an action once the pose is stable, then honours the cooldown", () => {
    const { engine, actions } = setup();
    const next = hand(DEFAULT_SETTINGS.gestures.next);
    const open = hand([1, 1, 1, 1, 1]);
    engine.update(next, 0);
    engine.update(next, 33);
    expect(actions).toEqual([]);
    engine.update(next, 66);
    expect(actions).toEqual(["next"]);
    for (let t = 100; t < 400; t += 33) engine.update(next, t);
    expect(actions).toEqual(["next"]);
    for (let t = 400; t < 600; t += 33) engine.update(open, t);
    for (let t = 600; t < 800; t += 33) engine.update(next, t);
    expect(actions).toEqual(["next"]); // still within 1s cooldown
    for (let t = 800; t < 1000; t += 33) engine.update(open, t);
    for (let t = 1100; t < 1300; t += 33) engine.update(next, t);
    expect(actions).toEqual(["next", "next"]);
  });

  it("switches into point and draw modes", () => {
    const { engine, modes } = setup();
    for (let t = 0; t < 100; t += 33) engine.update(hand(DEFAULT_SETTINGS.gestures.point), t);
    expect(modes.at(-1)).toBe("point");
    for (let t = 100; t < 200; t += 33) engine.update(hand(DEFAULT_SETTINGS.gestures.draw), t);
    expect(modes.at(-1)).toBe("draw");
  });

  it("ignores hands below the active line and reports loss", () => {
    const { engine, actions, lost } = setup();
    for (let t = 0; t < 100; t += 33) engine.update(hand(DEFAULT_SETTINGS.gestures.point), t);
    for (let t = 100; t < 600; t += 33) engine.update(hand(DEFAULT_SETTINGS.gestures.next, { wristY: 0.9 }), t);
    expect(actions).toEqual([]);
    expect(lost()).toBe(1);
  });
});
