import { describe, expect, it } from "vitest";
import { tighten, yawPitch } from "./gyro";

// rotationRate as browsers report it: alpha = about X, beta = about Y, gamma = about Z.
describe("yawPitch (player space)", () => {
  it("phone flat, top pointing at the screen: turning sideways is yaw, not pitch", () => {
    const up = [0, 0, 1] as const; // screen facing the ceiling
    // Turning left/right rotates about Z (gamma).
    expect(yawPitch(0, 0, 30, up)).toEqual({ yaw: 30, pitch: 0 });
    // Tilting the top up rotates about X (alpha).
    expect(yawPitch(20, 0, 0, up)).toEqual({ yaw: 0, pitch: 20 });
  });

  it("phone upright, screen facing you: turning sideways rotates about Y", () => {
    const up = [0, 1, 0] as const;
    expect(yawPitch(0, -25, 0, up)).toEqual({ yaw: -25, pitch: 0 });
    expect(yawPitch(15, 0, 0, up)).toEqual({ yaw: 0, pitch: 15 });
  });

  it("phone held at 45° like a remote: a turn about vertical keeps its full speed", () => {
    const up = [0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const { yaw, pitch } = yawPitch(0, 10 * Math.SQRT1_2, 10 * Math.SQRT1_2, up);
    expect(yaw).toBeCloseTo(10);
    expect(pitch).toBe(0);
  });

  it("is not skewed by a wrong gravity estimate (unlike world space)", () => {
    // Phone flat and turning at 30°/s, but gravity is estimated 20° off
    // (e.g. the hand was accelerating). World space would give 30·cos20° ≈ 28.2.
    const off = (20 * Math.PI) / 180;
    const { yaw } = yawPitch(0, 0, 30, [0, Math.sin(off), Math.cos(off)]);
    expect(yaw).toBeCloseTo(30);
  });

  it("uses the axis the user actually turns with, flat or upright", () => {
    // Held flat but the user twists about Y (a common wrist motion):
    // within the 60° buffer it still counts as turning.
    const tilted = [0, 0.5, Math.sqrt(0.75)] as const; // phone tilted up 30°
    expect(Math.abs(yawPitch(0, 20, 0, tilted).yaw)).toBeCloseTo(20);
  });

  it("fades out rotations far from the turning axis instead of flipping", () => {
    // Flat phone rolled about its long (Y) axis: not a turn, so it's reduced.
    const { yaw } = yawPitch(0, 30, 0, [0, 0.05, 1]);
    expect(Math.abs(yaw)).toBeLessThan(4);
  });
});

describe("tighten", () => {
  it("leaves movement at or above the threshold untouched", () => {
    expect(tighten(10, 0, 4)).toEqual([10, 0]);
    expect(tighten(3, 4, 4)).toEqual([3, 4]); // speed 5
  });

  it("scales slow movement down proportionally instead of dropping it", () => {
    const [y, p] = tighten(2, 0, 4); // half the threshold → half the speed again
    expect(y).toBeCloseTo(1);
    expect(p).toBe(0);
    // Slow but deliberate motion still moves (a hard 0.4 cut-off would also
    // pass this, but one at 4 would not).
    expect(tighten(3, 0, 4)[0]).toBeGreaterThan(2);
  });

  it("shrinks tremor-sized noise to near zero and keeps direction", () => {
    const [y, p] = tighten(0.3, -0.4, 4); // speed 0.5
    expect(Math.hypot(y, p)).toBeCloseTo(0.0625);
    expect(Math.sign(y)).toBe(1);
    expect(Math.sign(p)).toBe(-1);
  });
});
