import { describe, expect, it } from "vitest";
import { yawPitch } from "./gyro";

// rotationRate per the W3C spec: alpha = about X, beta = about Y, gamma = about Z.
describe("yawPitch", () => {
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

  it("phone held at 45° like a remote: yaw combines Y and Z rates", () => {
    const up = [0, Math.SQRT1_2, Math.SQRT1_2] as const;
    // A pure turn about world vertical shows up equally on Y and Z.
    const { yaw, pitch } = yawPitch(0, 10 * Math.SQRT1_2, 10 * Math.SQRT1_2, up);
    expect(yaw).toBeCloseTo(10);
    expect(pitch).toBe(0);
  });
});
