import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { getDeck, type LoadedDeck } from "../lib/deckStore";
import { loadSettings } from "../lib/settings";
import { PdfDeck } from "../slides/pdfDeck";
import { PointerLayer } from "../overlay/PointerLayer";
import { DrawLayer } from "../overlay/DrawLayer";
import { GestureEngine } from "../gesture/gestureEngine";
import { startHandTracking } from "../gesture/handTracker";
import { Link, fetchConfig, type LinkStatus } from "../link/link";
import { FLAG_DRAW, FLAG_VISIBLE, SeqFilter, decodePointer, type ControlMessage } from "../link/protocol";
import { StatusBadge } from "../link/StatusBadge";

export default function Present() {
  const deck = getDeck();
  if (!deck) {
    return (
      <div className="center-screen">
        <p>No presentation loaded.</p>
        <RouterLink className="btn btn-primary" to="/">
          Choose a file
        </RouterLink>
      </div>
    );
  }
  return <PresentView deck={deck} />;
}

interface Pairing {
  url: string;
  /** The phone cannot reach this address (e.g. localhost). */
  unreachable: boolean;
}

/** How long the pointer stays up after the last update from its source. */
const POINTER_TIMEOUT_MS = 1000;

function PresentView({ deck }: { deck: LoadedDeck }) {
  const navigate = useNavigate();
  const [settings] = useState(loadSettings);
  const [pdf, setPdf] = useState<PdfDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [blank, setBlank] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [phonePanel, setPhonePanel] = useState(false);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null);
  const [camera, setCamera] = useState<"off" | "loading" | "on" | "error">("off");
  const [box, setBox] = useState({ w: 0, h: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const slideCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const pointerElRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pointer = useRef<PointerLayer | null>(null);
  const draw = useRef<DrawLayer | null>(null);
  const link = useRef<Link | null>(null);

  const total = pdf?.pageCount ?? 0;

  // Latest values for callbacks that outlive a render (link, camera, keys).
  const state = useRef({ slide, total, blank });
  state.current = { slide, total, blank };

  const actions = useRef({
    next: () => setSlide((s) => Math.min(s + 1, Math.max(0, state.current.total - 1))),
    prev: () => setSlide((s) => Math.max(s - 1, 0)),
    undo: () => draw.current?.undo(),
    clear: () => draw.current?.clear(),
    blank: () => setBlank((b) => !b),
    text: () => setTextVisible((t) => !t),
  });

  // ---- load PDF ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDeck | null = null;
    PdfDeck.load(deck.pdf)
      .then((d) => {
        if (cancelled) return d.destroy();
        loaded = d;
        setPdf(d);
      })
      .catch((e) => setError(`Could not open this file: ${e instanceof Error ? e.message : e}`));
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [deck]);

  // ---- layout: fit the slide inside the viewport --------------------------------
  useEffect(() => {
    const stage = stageRef.current!;
    const ro = new ResizeObserver(() => {
      const aspect = pdf?.aspect(slide) ?? 16 / 9;
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const w = Math.min(W, H * aspect);
      setBox({ w: Math.floor(w), h: Math.floor(w / aspect) });
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, [pdf, slide]);

  // ---- render current slide, pre-render neighbours ------------------------------
  useEffect(() => {
    if (!pdf || !box.w) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(box.w * dpr);
    const ph = Math.round(box.h * dpr);
    let cancelled = false;
    pdf
      .render(slide, pw, ph)
      .then((bmp) => {
      if (cancelled) return;
      const c = slideCanvasRef.current!;
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      for (const n of [slide + 1, slide - 1]) if (n >= 0 && n < pdf.pageCount) void pdf.render(n, pw, ph).catch(() => {});
      })
      .catch((e) => console.error("slide render failed", e));
    return () => {
      cancelled = true;
    };
  }, [pdf, slide, box]);

  // ---- overlays -------------------------------------------------------------------
  useEffect(() => {
    pointer.current = new PointerLayer(pointerElRef.current!);
    draw.current = new DrawLayer(drawCanvasRef.current!);
    return () => {
      pointer.current?.dispose();
      draw.current?.dispose();
    };
  }, []);

  useEffect(() => draw.current?.setSlide(slide), [slide]);

  // ---- phone link -----------------------------------------------------------------
  const lastPhoneFrame = useRef(-Infinity);

  useEffect(() => {
    let disposed = false;
    const seq = new SeqFilter();
    let phoneDrawing = false;

    const endPhoneStroke = () => {
      if (phoneDrawing) draw.current?.endStroke();
      phoneDrawing = false;
    };

    const sendState = () => {
      const { slide, total, blank } = state.current;
      link.current?.sendControl({ t: "state", slide, total, blank });
    };

    (async () => {
      try {
        const [{ iceServers, publicUrl }, res] = await Promise.all([fetchConfig(), fetch("/api/sessions", { method: "POST" })]);
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        const creds: { id: string; presenterToken: string; remoteToken: string } = await res.json();
        if (disposed) return;

        const l = new Link({ sessionId: creds.id, role: "presenter", token: creds.presenterToken, iceServers });
        link.current = l;
        const base = publicUrl || location.origin;
        const host = new URL(base).hostname;
        setPairing({
          url: `${base}/r/${creds.id}#${creds.remoteToken}`,
          unreachable: host === "localhost" || host === "127.0.0.1" || host === "[::1]",
        });

        let lastTransport = l.status.transport;
        l.onStatus = (s) => {
          setLinkStatus(s);
          if (s.transport !== lastTransport) {
            lastTransport = s.transport;
            seq.reset();
            if (s.transport !== "none") sendState();
            else {
              pointer.current?.hide();
              endPhoneStroke();
            }
          }
        };
        l.onPeerJoined = () => {
          seq.reset();
          setPhonePanel(false);
        };
        l.onPointer = (buf) => {
          const f = decodePointer(buf);
          if (!f || !seq.accept(f.seq)) return;
          if (!(f.flags & FLAG_VISIBLE)) {
            pointer.current?.hide();
            endPhoneStroke();
            return;
          }
          lastPhoneFrame.current = performance.now();
          const drawing = (f.flags & FLAG_DRAW) !== 0;
          pointer.current?.set(f.x, f.y, true, drawing);
          if (drawing) {
            if (phoneDrawing) draw.current?.addPoint(f.x, f.y);
            else draw.current?.beginStroke(f.x, f.y);
            phoneDrawing = true;
          } else {
            endPhoneStroke();
          }
        };
        l.onControl = (m: ControlMessage) => {
          if (m.t === "release") {
            pointer.current?.hide();
            endPhoneStroke();
          } else if (m.t === "action") {
            const a = actions.current;
            ({ next: a.next, prev: a.prev, undo: a.undo, clear: a.clear, blank: a.blank })[m.a]?.();
          }
        };
      } catch (e) {
        if (!disposed) setPairError(`Phone pairing unavailable: ${e instanceof Error ? e.message : e}`);
      }
    })();

    // Hide a phone pointer that stopped updating (e.g. the release was lost).
    const watchdog = setInterval(() => {
      if (pointer.current?.isVisible && performance.now() - lastPhoneFrame.current > POINTER_TIMEOUT_MS && lastPhoneFrame.current > 0) {
        lastPhoneFrame.current = 0;
        pointer.current.hide();
        endPhoneStroke();
      }
    }, 250);

    return () => {
      disposed = true;
      clearInterval(watchdog);
      link.current?.close();
      link.current = null;
    };
  }, []);

  // Keep the phone's slide counter in sync.
  useEffect(() => {
    link.current?.sendControl({ t: "state", slide, total, blank });
  }, [slide, total, blank]);

  // ---- hand gestures ----------------------------------------------------------------
  useEffect(() => {
    if (!settings.handGestures && !settings.camera.visible) return;
    let stopTracking: (() => void) | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;
    let handDrawing = false;
    let handPointer = false;

    const phoneActive = () => performance.now() - lastPhoneFrame.current < 500;
    const endHand = () => {
      if (handDrawing) draw.current?.endStroke();
      if (handPointer && !phoneActive()) pointer.current?.hide();
      handDrawing = handPointer = false;
    };

    const engine = new GestureEngine(settings.gestures, {
      action: (a) => {
        const act = actions.current;
        ({ next: act.next, previous: act.prev, undo: act.undo, toggle_text: act.text })[a]();
      },
      pointer: (x, y, mode) => {
        if (phoneActive()) return;
        if (mode === "none") return endHand();
        pointer.current?.set(x, y, true, mode === "draw");
        handPointer = true;
        if (mode === "draw") {
          if (handDrawing) draw.current?.addPoint(x, y);
          else draw.current?.beginStroke(x, y);
          handDrawing = true;
        } else if (handDrawing) {
          draw.current?.endStroke();
          handDrawing = false;
        }
      },
      lost: endHand,
    });

    setCamera("loading");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        if (settings.handGestures) {
          const stop = await startHandTracking(video, (lm, now) => engine.update(lm, now));
          if (cancelled) return stop();
          stopTracking = stop;
        }
        if (!cancelled) setCamera("on");
      } catch (e) {
        console.warn("camera / hand tracking unavailable", e);
        if (!cancelled) setCamera("error");
      }
    })();

    return () => {
      cancelled = true;
      stopTracking?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [settings]);

  // ---- keyboard & auto-hiding controls -----------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const a = actions.current;
      const key = e.key.toLowerCase();
      if (["arrowright", "pagedown", " ", "enter", "arrowdown"].includes(key)) a.next();
      else if (["arrowleft", "pageup", "backspace", "arrowup"].includes(key)) a.prev();
      else if (key === "b" || key === ".") a.blank();
      else if (key === "z") a.undo();
      else if (key === "c") a.clear();
      else if (key === "t") a.text();
      else if (key === "f") toggleFullscreen();
      else if (key === "p") setPhonePanel((p) => !p);
      else if (key === "home") setSlide(0);
      else if (key === "end") setSlide(Math.max(0, state.current.total - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setControlsVisible(false), 2500);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
    };
  }, []);

  const connected = linkStatus?.peer ?? false;

  return (
    <div className="present" ref={stageRef} style={{ cursor: controlsVisible ? "auto" : "none" }}>
      <div className="slide-box" style={{ width: box.w, height: box.h }}>
        <canvas ref={slideCanvasRef} className="slide-canvas" />
        <canvas ref={drawCanvasRef} className="draw-canvas" />
        {textVisible && <div className="overlay-text">{settings.overlayText}</div>}
        <div ref={pointerElRef} className="laser" />
        {blank && <div className="blank" />}
        <video
          ref={videoRef}
          className={`pip pip-${settings.camera.corner}`}
          style={{ display: settings.camera.visible && camera === "on" ? "block" : "none" }}
          muted
          playsInline
        />
      </div>

      {error && (
        <div className="center-screen">
          <p className="error">{error}</p>
          <RouterLink className="btn btn-primary" to="/">
            Back
          </RouterLink>
        </div>
      )}

      <div className={`present-controls${controlsVisible || phonePanel ? " visible" : ""}`}>
        <button className="btn btn-ghost top-left" onClick={() => navigate("/")}>
          ← Back
        </button>
        <div className="top-right">
          {total > 0 && (
            <span className="counter">
              {slide + 1} / {total}
            </span>
          )}
          {camera === "loading" && <span className="badge badge-idle">Starting camera…</span>}
          {camera === "error" && <span className="badge badge-bad">Camera unavailable</span>}
        </div>
        <div className="bottom-left">
          <button className="btn btn-ghost" onClick={() => setPhonePanel((p) => !p)}>
            📱 {connected ? "Phone" : "Connect phone"}
          </button>
          {linkStatus && connected && <StatusBadge status={linkStatus} waitingFor="phone" />}
        </div>
        <button className="btn btn-ghost bottom-right" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
          ⛶
        </button>
      </div>

      {phonePanel && (
        <div className="phone-panel" role="dialog" aria-label="Connect phone">
          <button className="close" onClick={() => setPhonePanel(false)} aria-label="Close">
            ×
          </button>
          <h2>Use your phone as a remote</h2>
          {pairError ? (
            <p className="error">{pairError}</p>
          ) : pairing ? (
            <>
              <div className="qr">
                <QRCodeSVG value={pairing.url} size={220} marginSize={2} />
              </div>
              {pairing.unreachable && (
                <p className="error small">
                  Your phone can't open <strong>localhost</strong>. Open this page through your computer's network
                  address or an HTTPS tunnel, or set PUBLIC_URL on the server.
                </p>
              )}
              <p className="muted small">Scan this with your phone's camera. Use the same Wi-Fi for the lowest pointer lag.</p>
              <StatusBadge status={linkStatus} waitingFor="phone" />
              <details>
                <summary className="muted small">Can't scan?</summary>
                <input className="pair-url" readOnly value={pairing.url} onFocus={(e) => e.target.select()} />
              </details>
            </>
          ) : (
            <p>Creating pairing code…</p>
          )}
        </div>
      )}
    </div>
  );
}
