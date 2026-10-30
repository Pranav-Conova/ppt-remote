import { describe, expect, it } from "vitest";
import { OneEuroFilter } from "./oneEuro";

describe("OneEuroFilter", () => {
  it("passes the first sample through", () => {
    expect(new OneEuroFilter().filter(0.4, 1 / 60)).toBe(0.4);
  });

  it("damps small jitter around a still position", () => {
    const f = new OneEuroFilter(1, 5);
    f.filter(0.5, 1 / 60);
    let maxDev = 0;
    for (let i = 0; i < 120; i++) {
      const noisy = 0.5 + (i % 2 ? 0.004 : -0.004);
      maxDev = Math.max(maxDev, Math.abs(f.filter(noisy, 1 / 60) - 0.5));
    }
    expect(maxDev).toBeLessThan(0.002);
  });

  it("tracks a fast move with little lag", () => {
    const f = new OneEuroFilter(1, 5);
    f.filter(0, 1 / 60);
    let out = 0;
    // Sweep across the slide in ~250ms.
    for (let i = 1; i <= 15; i++) out = f.filter(i / 15, 1 / 60);
    expect(out).toBeGreaterThan(0.85);
  });
});
