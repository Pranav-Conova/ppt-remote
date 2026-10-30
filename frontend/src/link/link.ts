// Link connects the presenter (laptop) and the remote (phone).
//
// Both sides keep a WebSocket to the Go server for pairing and WebRTC
// signaling. As soon as the phone joins, the presenter negotiates a direct
// WebRTC connection with two DataChannels:
//   - "pointer": unordered, no retransmits. UDP-like, so a lost Wi-Fi packet
//     never stalls later pointer updates (no head-of-line blocking).
//   - "control": reliable and ordered, for buttons and state.
// Until (or unless) the direct path opens, everything goes through the
// server over the same WebSocket. The server coalesces relayed pointer frames,
// so the relay never builds up a backlog.
import type { ControlMessage, SignalMessage } from "./protocol";

export type Role = "presenter" | "remote";
export type Transport = "none" | "relay" | "p2p";

export interface LinkStatus {
  server: "connecting" | "online" | "offline";
  peer: boolean;
  transport: Transport;
  /** Smoothed round-trip time in ms over the active transport. */
  rtt: number | null;
  /** The session is over for good (presenter left, or it no longer exists). Final. */
  ended: boolean;
}

/**
 * WebSocket close codes from the server (backend/internal/session/peer.go).
 * Any of these means "stop retrying".
 */
const CLOSE_ENDED = 4000;
const FINAL_CLOSE_CODES = new Set([CLOSE_ENDED, 4401, 4404]);

export interface LinkOptions {
  sessionId: string;
  role: Role;
  token: string;
  iceServers: RTCIceServer[];
}

// Skip pointer frames instead of queueing them when the socket is backed up:
// a stale position is worse than a dropped one.
const MAX_POINTER_BUFFER = 1024;
const PING_INTERVAL = 2000;
const P2P_RETRY_MS = [3000, 8000, 15000, 30000];

export interface ServerConfig {
  iceServers: RTCIceServer[];
  convert: boolean;
  /** Base URL for the phone link, if the server overrides it. */
  publicUrl?: string;
}

export async function fetchConfig(): Promise<ServerConfig> {
  try {
    const res = await fetch("/api/config");
    if (res.ok) return await res.json();
  } catch {
    // fall through to defaults
  }
  return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }], convert: false };
}

export class Link {
  onPointer: (buf: ArrayBuffer) => void = () => {};
  onControl: (msg: ControlMessage) => void = () => {};
  onStatus: (s: LinkStatus) => void = () => {};
  /** Fired when a (new) phone/presenter connection appears on the other side. */
  onPeerJoined: () => void = () => {};

  status: LinkStatus = { server: "connecting", peer: false, transport: "none", rtt: null, ended: false };

  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private pointerCh: RTCDataChannel | null = null;
  private controlCh: RTCDataChannel | null = null;
  private gen = 0;
  private pendingIce: RTCIceCandidateInit[] = [];
  private closed = false;
  private wsAttempts = 0;
  private p2pAttempts = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private pingTimer: ReturnType<typeof setInterval>;
  private readonly opts: LinkOptions;

  constructor(opts: LinkOptions) {
    this.opts = opts;
    this.connectWs();
    this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL);
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    clearInterval(this.pingTimer);
    this.timers.forEach(clearTimeout);
    this.teardownP2P();
    this.ws?.close(code, reason);
    this.ws = null;
  }

  /**
   * Presenter only: end the session for good, e.g. when the tab closes. The
   * phone hears it directly (control channel) and from the server (close
   * code), so it stops even if one of the two is lost.
   */
  endSession() {
    this.sendControl({ t: "end" });
    this.close(CLOSE_ENDED, "ended");
  }

  /** The other side ended the session: stop everything, never reconnect. */
  private ended() {
    if (this.status.ended) return;
    this.close();
    this.setStatus({ server: "offline", peer: false, ended: true });
  }

  sendPointer(buf: ArrayBuffer) {
    const ch = this.pointerCh;
    if (ch && ch.readyState === "open" && this.status.transport === "p2p") {
      if (ch.bufferedAmount < MAX_POINTER_BUFFER) ch.send(buf);
      return;
    }
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN && this.status.peer && ws.bufferedAmount < MAX_POINTER_BUFFER) {
      ws.send(buf);
    }
  }

  sendControl(msg: ControlMessage) {
    const ch = this.controlCh;
    if (ch && ch.readyState === "open") {
      ch.send(JSON.stringify(msg));
      return;
    }
    if (this.status.peer) this.sendSignal({ t: "relay", m: msg });
  }

  // ---- signaling WebSocket -------------------------------------------------

  private connectWs() {
    if (this.closed) return;
    const { sessionId, role, token } = this.opts;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const q = new URLSearchParams({ session: sessionId, role, token });
    const ws = new WebSocket(`${proto}//${location.host}/ws/signal?${q}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.setStatus({ server: "connecting" });

    ws.onopen = () => {
      this.wsAttempts = 0;
      this.setStatus({ server: "online" });
    };
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        this.onPointer(e.data);
        return;
      }
      let msg: SignalMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handleSignal(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      if (FINAL_CLOSE_CODES.has(e.code)) return this.ended();
      this.ws = null;
      this.setStatus({ server: "offline", peer: false });
      if (this.closed) return;
      const delay = Math.min(500 * 2 ** this.wsAttempts++, 8000);
      this.later(() => this.connectWs(), delay);
    };
  }

  private sendSignal(msg: SignalMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handleSignal(msg: SignalMessage) {
    switch (msg.t) {
      case "welcome":
        this.setStatus({ peer: msg.peer });
        if (msg.peer) this.peerJoined();
        break;
      case "peer-joined":
        this.setStatus({ peer: true });
        this.peerJoined();
        break;
      case "peer-left":
        this.teardownP2P();
        this.setStatus({ peer: false });
        break;
      case "ended":
        this.ended();
        break;
      case "sig":
        void this.handleSig(msg);
        break;
      case "relay":
        this.handleControl(msg.m);
        break;
    }
  }

  private peerJoined() {
    this.onPeerJoined();
    if (this.opts.role === "presenter") {
      this.p2pAttempts = 0;
      void this.startP2P();
    }
  }

  // ---- WebRTC ---------------------------------------------------------------

  private newPeerConnection(gen: number) {
    const pc = new RTCPeerConnection({ iceServers: this.opts.iceServers });
    pc.onicecandidate = (e) => {
      if (this.pc === pc) this.sendSignal({ t: "sig", gen, ice: e.candidate ? e.candidate.toJSON() : null });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.teardownP2P();
        this.scheduleP2PRetry();
      }
    };
    return pc;
  }

  private setupChannel(ch: RTCDataChannel) {
    ch.binaryType = "arraybuffer";
    if (ch.label === "pointer") {
      this.pointerCh = ch;
      ch.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) this.onPointer(e.data);
      };
    } else if (ch.label === "control") {
      this.controlCh = ch;
      ch.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        try {
          this.handleControl(JSON.parse(e.data));
        } catch {
          // ignore malformed
        }
      };
    }
    ch.onopen = () => this.updateTransport();
    ch.onclose = () => {
      this.updateTransport();
      if (this.pointerCh === ch || this.controlCh === ch) this.scheduleP2PRetry();
    };
  }

  /** Presenter side: create the connection, channels and offer. */
  private async startP2P() {
    if (this.closed || !this.status.peer) return;
    this.teardownP2P();
    const gen = ++this.gen;
    const pc = this.newPeerConnection(gen);
    this.pc = pc;
    this.setupChannel(pc.createDataChannel("pointer", { ordered: false, maxRetransmits: 0 }));
    this.setupChannel(pc.createDataChannel("control", { ordered: true }));
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (this.pc === pc) this.sendSignal({ t: "sig", gen, sdp: pc.localDescription!.toJSON() });
    } catch (err) {
      console.warn("p2p offer failed", err);
      this.scheduleP2PRetry();
    }
    // If the direct path does not come up quickly, the relay is already in
    // use; try again later in case the network changes.
    this.later(() => {
      if (this.pc === pc && this.status.transport !== "p2p") {
        this.teardownP2P();
        this.scheduleP2PRetry();
      }
    }, 10000);
  }

  private async handleSig(msg: Extract<SignalMessage, { t: "sig" }>) {
    try {
      if (msg.sdp?.type === "offer" && this.opts.role === "remote") {
        this.teardownP2P();
        this.gen = msg.gen;
        const pc = this.newPeerConnection(msg.gen);
        this.pc = pc;
        pc.ondatachannel = (e) => this.setupChannel(e.channel);
        await pc.setRemoteDescription(msg.sdp);
        await this.flushIce(pc);
        await pc.setLocalDescription(await pc.createAnswer());
        if (this.pc === pc) this.sendSignal({ t: "sig", gen: msg.gen, sdp: pc.localDescription!.toJSON() });
        return;
      }
      if (msg.gen !== this.gen || !this.pc) return;
      const pc = this.pc;
      if (msg.sdp?.type === "answer" && this.opts.role === "presenter") {
        await pc.setRemoteDescription(msg.sdp);
        await this.flushIce(pc);
      } else if (msg.ice) {
        if (pc.remoteDescription) await pc.addIceCandidate(msg.ice);
        else this.pendingIce.push(msg.ice);
      }
    } catch (err) {
      console.warn("signaling error", err);
    }
  }

  private async flushIce(pc: RTCPeerConnection) {
    const pending = this.pendingIce;
    this.pendingIce = [];
    for (const c of pending) await pc.addIceCandidate(c).catch(() => {});
  }

  private scheduleP2PRetry() {
    if (this.opts.role !== "presenter" || this.closed || !this.status.peer) return;
    const delay = P2P_RETRY_MS[Math.min(this.p2pAttempts++, P2P_RETRY_MS.length - 1)];
    const gen = this.gen;
    this.later(() => {
      if (this.gen === gen && this.status.transport !== "p2p") void this.startP2P();
    }, delay);
  }

  private teardownP2P() {
    const pc = this.pc;
    this.pc = null;
    this.pointerCh = null;
    this.controlCh = null;
    this.pendingIce = [];
    pc?.close();
    this.updateTransport();
  }

  // ---- status / ping --------------------------------------------------------

  private handleControl(msg: ControlMessage) {
    if (msg.t === "ping") {
      this.sendControl({ t: "pong", ts: msg.ts });
    } else if (msg.t === "pong") {
      const sample = performance.now() - msg.ts;
      const prev = this.status.rtt;
      this.setStatus({ rtt: prev == null ? sample : prev * 0.7 + sample * 0.3 });
    } else if (msg.t === "end") {
      this.ended();
    } else {
      this.onControl(msg);
    }
  }

  private ping() {
    if (this.status.transport !== "none") this.sendControl({ t: "ping", ts: performance.now() });
  }

  private updateTransport() {
    this.setStatus({});
  }

  private setStatus(patch: Partial<Omit<LinkStatus, "transport">>) {
    const next = { ...this.status, ...patch };
    const open = (ch: RTCDataChannel | null) => ch?.readyState === "open";
    const transport: Transport =
      open(this.pointerCh) && open(this.controlCh)
        ? "p2p"
        : next.peer && this.ws?.readyState === WebSocket.OPEN
          ? "relay"
          : "none";
    if (transport !== next.transport) {
      if (transport === "p2p") this.p2pAttempts = 0;
      // The previous transport's RTT says nothing about the new one.
      next.transport = transport;
      next.rtt = null;
    }
    const s = this.status;
    if (
      s.server === next.server &&
      s.peer === next.peer &&
      s.transport === next.transport &&
      s.rtt === next.rtt &&
      s.ended === next.ended
    )
      return;
    this.status = next;
    this.onStatus(next);
  }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }
}
