// Turns per-frame hand landmarks into presenter actions. Ported from the
// original consumers.py receive(), with two changes:
//   - A pattern must hold for a few frames before it counts, which cuts
//     false triggers while the hand moves between poses.
//   - The 1s cooldown applies only to one-shot actions (next/prev/undo/text).
//     Pointer and draw modes switch as soon as the pose is stable.
import { fingersUp, samePattern, type Point } from "./fingers";
import type { GestureName, PresenterSettings } from "../lib/settings";

export type HandMode = "none" | "point" | "draw";
export type HandAction = "next" | "previous" | "undo" | "toggle_text";

export interface GestureEvents {
  action(a: HandAction): void;
  /** Called every processed frame while a hand is visible. */
  pointer(x: number, y: number, mode: HandMode): void;
  /** The hand left the frame or the active zone. */
  lost(): void;
}

/** The hand only counts when the wrist is above this line, as a fraction of frame height (the old green line). */
export const ACTIVE_LINE = 0.75;
/** Area of the mirrored camera frame that maps onto the whole slide. */
const REACH = { x0: 0.15, x1: 0.85, y0: 0.1, y1: 0.65 };
const STABLE_FRAMES = 3;
const ACTION_COOLDOWN_MS = 1000;
const LOST_AFTER_MS = 300;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class GestureEngine {
  private candidate: GestureName | "none" = "none";
  private candidateFrames = 0;
  private stable: GestureName | "none" = "none";
  private mode: HandMode = "none";
  private lastAction = -Infinity;
  private lastSeen = -Infinity;
  private reportedLost = true;

  constructor(
    private gestures: PresenterSettings["gestures"],
    private events: GestureEvents,
  ) {}

  setGestures(g: PresenterSettings["gestures"]) {
    this.gestures = g;
  }

  /**
   * @param lm Landmarks in camera coordinates (not mirrored), or null when no hand.
   * @param now Timestamp in ms.
   */
  update(lm: readonly Point[] | null, now: number) {
    if (!lm || lm[0].y > ACTIVE_LINE) {
      if (!this.reportedLost && now - this.lastSeen > LOST_AFTER_MS) {
        this.reportedLost = true;
        this.mode = "none";
        this.stable = this.candidate = "none";
        this.candidateFrames = 0;
        this.events.lost();
      }
      return;
    }
    this.lastSeen = now;
    this.reportedLost = false;

    const fingers = fingersUp(lm);
    const match =
      (Object.keys(this.gestures) as GestureName[]).find((name) => samePattern(this.gestures[name], fingers)) ?? "none";

    if (match === this.candidate) {
      this.candidateFrames++;
    } else {
      this.candidate = match;
      this.candidateFrames = 1;
    }

    if (this.candidateFrames === STABLE_FRAMES && match !== this.stable) {
      this.stable = match;
      this.onStablePose(match, now);
    }

    // The index fingertip drives the pointer. Mirror x so moving the hand
    // right moves the pointer right, as if looking in a mirror.
    const tip = lm[8];
    const mx = 1 - tip.x;
    const x = clamp01((mx - REACH.x0) / (REACH.x1 - REACH.x0));
    const y = clamp01((tip.y - REACH.y0) / (REACH.y1 - REACH.y0));
    this.events.pointer(x, y, this.mode);
  }

  private onStablePose(pose: GestureName | "none", now: number) {
    switch (pose) {
      case "point":
        this.mode = "point";
        return;
      case "draw":
        this.mode = "draw";
        return;
      case "none":
        this.mode = "none";
        return;
    }
    this.mode = "none";
    if (now - this.lastAction < ACTION_COOLDOWN_MS) return;
    this.lastAction = now;
    this.events.action(pose);
  }
}
