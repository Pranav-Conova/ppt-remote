// Wire formats shared by the presenter (laptop) and the remote (phone).
//
// Pointer frames are tiny fixed-size binary messages sent ~60 times a second
// over an unreliable/unordered channel, so they carry an absolute position and
// a sequence number: a lost frame is simply superseded by the next one, and a
// late (reordered) frame is dropped.
//
//   byte 0     type (PointerType)
//   byte 1     flags (FLAG_*)
//   bytes 2-3  seq   uint16, wraps
//   bytes 4-5  x     uint16, 0..65535 maps to 0..1 across the slide
//   bytes 6-7  y     uint16, 0..65535 maps to 0..1 down the slide

export const POINTER_FRAME = 1;
export const POINTER_FRAME_SIZE = 8;

export const FLAG_VISIBLE = 1 << 0;
export const FLAG_DRAW = 1 << 1;

export interface PointerFrame {
  seq: number;
  x: number;
  y: number;
  flags: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function encodePointer(f: PointerFrame): ArrayBuffer {
  const buf = new ArrayBuffer(POINTER_FRAME_SIZE);
  const v = new DataView(buf);
  v.setUint8(0, POINTER_FRAME);
  v.setUint8(1, f.flags & 0xff);
  v.setUint16(2, f.seq & 0xffff);
  v.setUint16(4, Math.round(clamp01(f.x) * 0xffff));
  v.setUint16(6, Math.round(clamp01(f.y) * 0xffff));
  return buf;
}

export function decodePointer(buf: ArrayBuffer): PointerFrame | null {
  if (buf.byteLength !== POINTER_FRAME_SIZE) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== POINTER_FRAME) return null;
  return {
    flags: v.getUint8(1),
    seq: v.getUint16(2),
    x: v.getUint16(4) / 0xffff,
    y: v.getUint16(6) / 0xffff,
  };
}

/** True if uint16 sequence number a comes after b, accounting for wrap-around. */
export function seqNewer(a: number, b: number): boolean {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}

/** Drops duplicate and out-of-order pointer frames. */
export class SeqFilter {
  private last = -1;

  accept(seq: number): boolean {
    if (this.last === -1 || seqNewer(seq, this.last)) {
      this.last = seq;
      return true;
    }
    return false;
  }

  reset() {
    this.last = -1;
  }
}

export type RemoteAction = "next" | "prev" | "undo" | "clear" | "blank";

/** Messages on the reliable control channel (or the relay WebSocket). */
export type ControlMessage =
  | { t: "action"; a: RemoteAction }
  /** Phone released the pointer/draw button; hide pointer, end stroke. */
  | { t: "release" }
  | { t: "state"; slide: number; total: number; blank: boolean }
  | { t: "ping"; ts: number }
  | { t: "pong"; ts: number }
  /** Presenter closed the presentation tab; the phone should stop. */
  | { t: "end" };

/** Messages only exchanged through the signaling server. */
export type SignalMessage =
  | { t: "welcome"; peer: boolean }
  | { t: "peer-joined" }
  | { t: "peer-left" }
  /** The presenter ended the session (server-side). */
  | { t: "ended" }
  | { t: "sig"; gen: number; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit | null }
  | { t: "relay"; m: ControlMessage };
