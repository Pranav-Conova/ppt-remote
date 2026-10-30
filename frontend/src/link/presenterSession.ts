// The presenter's pairing session, shared by the home page and the presenter
// view. Pairing happens on the home page (the laptop screen is usually not
// projected yet), and the same connection carries on into the presentation,
// so the QR code never has to appear on the big screen.
//
// Exactly one presenter Link may exist per session: two connections with the
// same token would keep replacing each other on the server.
//
// Closing or reloading the tab ends the session, which stops the phone.
import { useSyncExternalStore } from "react";
import { Link, fetchConfig, type LinkStatus } from "./link";
import type { ControlMessage } from "./protocol";

export interface PresenterSessionState {
  /** URL encoded in the QR code; null while the session is being created. */
  pairUrl: string | null;
  /** The pairing URL points at localhost, which a phone can't open. */
  unreachable: boolean;
  status: LinkStatus | null;
  error: string | null;
}

export interface PresenterHandlers {
  onPointer: (buf: ArrayBuffer) => void;
  onControl: (msg: ControlMessage) => void;
  /** A phone (re)connected; also fired on transport changes so state can be resent. */
  onPeerJoined: () => void;
  onStatus: (s: LinkStatus) => void;
}

let state: PresenterSessionState = { pairUrl: null, unreachable: false, status: null, error: null };
let link: Link | null = null;
let creating: Promise<void> | null = null;
let handlers: Partial<PresenterHandlers> = {};
const listeners = new Set<() => void>();

function set(patch: Partial<PresenterSessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Creates the session and its connection, once. Safe to call repeatedly. */
export function ensureSession(): Promise<void> {
  if (link || creating) return creating ?? Promise.resolve();
  creating = (async () => {
    try {
      const [{ iceServers, publicUrl }, res] = await Promise.all([fetchConfig(), fetch("/api/sessions", { method: "POST" })]);
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const creds: { id: string; presenterToken: string; remoteToken: string } = await res.json();

      const l = new Link({ sessionId: creds.id, role: "presenter", token: creds.presenterToken, iceServers });
      link = l;
      l.onPointer = (buf) => handlers.onPointer?.(buf);
      l.onControl = (m) => handlers.onControl?.(m);
      l.onPeerJoined = () => handlers.onPeerJoined?.();
      l.onStatus = (s) => {
        set({ status: s });
        handlers.onStatus?.(s);
        // The server dropped the session (we were offline too long): start a
        // fresh one so a new QR code appears.
        if (s.ended && link === l) {
          link = null;
          set({ pairUrl: null, status: null });
          void ensureSession();
        }
      };

      const base = publicUrl || location.origin;
      const host = new URL(base).hostname;
      set({
        pairUrl: `${base}/r/${creds.id}#${creds.remoteToken}`,
        unreachable: host === "localhost" || host === "127.0.0.1" || host === "[::1]",
        status: l.status,
        error: null,
      });
    } catch (e) {
      set({ error: `Phone pairing unavailable: ${e instanceof Error ? e.message : e}` });
    } finally {
      creating = null;
    }
  })();
  return creating;
}

/** The presenter view takes the incoming pointer/control messages. */
export function attachPresenter(h: Partial<PresenterHandlers>) {
  handlers = h;
}

export function detachPresenter() {
  handlers = {};
}

export function presenterLink(): Link | null {
  return link;
}

export function usePresenterSession(): PresenterSessionState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// Closing or reloading the tab ends the session and stops the phone.
// In-app navigation (home ⇄ presentation) does not fire pagehide.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => link?.endSession());
}
