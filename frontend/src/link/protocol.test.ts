import { describe, expect, it } from "vitest";
import { FLAG_DRAW, FLAG_VISIBLE, SeqFilter, decodePointer, encodePointer, seqNewer } from "./protocol";

describe("pointer codec", () => {
  it("round-trips within uint16 precision", () => {
    const buf = encodePointer({ seq: 513, x: 0.25, y: 0.9, flags: FLAG_VISIBLE | FLAG_DRAW });
    expect(buf.byteLength).toBe(8);
    const f = decodePointer(buf)!;
    expect(f.seq).toBe(513);
    expect(f.flags).toBe(FLAG_VISIBLE | FLAG_DRAW);
    expect(f.x).toBeCloseTo(0.25, 4);
    expect(f.y).toBeCloseTo(0.9, 4);
  });

  it("clamps out-of-range coordinates and wraps seq", () => {
    const f = decodePointer(encodePointer({ seq: 70000, x: -1, y: 2, flags: 0 }))!;
    expect(f.seq).toBe(70000 & 0xffff);
    expect(f.x).toBe(0);
    expect(f.y).toBe(1);
  });

  it("rejects malformed frames", () => {
    expect(decodePointer(new ArrayBuffer(4))).toBeNull();
    const bad = encodePointer({ seq: 1, x: 0, y: 0, flags: 0 });
    new DataView(bad).setUint8(0, 99);
    expect(decodePointer(bad)).toBeNull();
  });
});

describe("sequence ordering", () => {
  it("handles wrap-around", () => {
    expect(seqNewer(1, 0)).toBe(true);
    expect(seqNewer(0, 1)).toBe(false);
    expect(seqNewer(0, 0xffff)).toBe(true);
    expect(seqNewer(0xffff, 0)).toBe(false);
    expect(seqNewer(5, 5)).toBe(false);
  });

  it("filters duplicates and late frames", () => {
    const f = new SeqFilter();
    expect(f.accept(10)).toBe(true);
    expect(f.accept(12)).toBe(true);
    expect(f.accept(11)).toBe(false);
    expect(f.accept(12)).toBe(false);
    expect(f.accept(13)).toBe(true);
  });
});
