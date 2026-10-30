import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  MonitorOff,
  ShieldAlert,
  Smartphone,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { getDeck, type LoadedDeck } from "../lib/deckStore";
import { loadSettings } from "../lib/settings";
import { PdfDeck } from "../slides/pdfDeck";
import { PointerLayer } from "../overlay/PointerLayer";
import { DrawLayer } from "../overlay/DrawLayer";
import { GestureEngine, type HandAction } from "../gesture/gestureEngine";
import { startHandTracking } from "../gesture/handTracker";
import {
  attachPresenter,
  detachPresenter,
  ensureSession,
  presenterLink,
  usePresenterSession,
} from "../link/presenterSession";
import { FLAG_DRAW, FLAG_VISIBLE, SeqFilter, decodePointer, type ControlMessage } from "../link/protocol";
import { StatusBadge } from "../link/StatusBadge";

export default function Present() {
  const deck = getDeck();
  if (!deck) {
    return (
      <div className="center-screen">
        <p>No presentation loaded.</p>
        <RouterLink className="btn btn-shimmer" to="/">
          Choose a file
        </RouterLink>
      </div>
    );
  }
  return <PresentView deck={deck} />;
}

/** How long the pointer stays up after the last update from its source. */
const POINTER_TIMEOUT_MS = 1000;

/** Brief on-screen confirmation when a hand gesture fires. */
const GESTURE_TOASTS: Record<HandAction, [LucideIcon, string]> = {
  next: [ChevronRight, "Next slide"],
  previous: [ChevronLeft, "Previous slide"],
  undo: [Undo2, "Undo"],
  toggle_text: [Type, "Text"],
};

function PresentView({ deck }: { deck: LoadedDeck }) {
  const navigate = useNavigate();
  const [settings] = useState(loadSettings);
  const [pdf, setPdf] = useState<PdfDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [blank, setBlank] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  // The QR code is normally shown on the home page, before presenting. Here
  // it is behind a confirmation, because this screen is usually projected and
  // anyone in the room could scan it.
  const [phonePanel, setPhonePanel] = useState<"closed" | "confirm" | "qr">("closed");
  const session = usePresenterSession();
  const linkStatus = session.status;
  const [camera, setCamera] = useState<"off" | "loading" | "on" | "error">("off");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [toast, setToast] = useState<{ key: number; action: HandAction } | null>(null);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const slideCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const pointerElRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pointer = useRef<PointerLayer | null>(null);
  const draw = useRef<DrawLayer | null>(null);

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
    const seq = new SeqFilter();
    let phoneDrawing = false;
    let lastTransport = presenterLink()?.status.transport ?? "none";

    const endPhoneStroke = () => {
      if (phoneDrawing) draw.current?.endStroke();
      phoneDrawing = false;
    };

    const sendState = () => {
      const { slide, total, blank } = state.current;
      presenterLink()?.sendControl({ t: "state", slide, total, blank });
    };

    // Normally created on the home page already; this covers opening /present directly.
    void ensureSession();
    attachPresenter({
      onStatus: (s) => {
        if (s.transport !== lastTransport) {
          lastTransport = s.transport;
          seq.reset();
          if (s.transport !== "none") sendState();
          else {
            pointer.current?.hide();
            endPhoneStroke();
          }
        }
      },
      onPeerJoined: () => {
        seq.reset();
        setPhonePanel("closed");
      },
      onPointer: (buf) => {
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
      },
      onControl: (m: ControlMessage) => {
        if (m.t === "release") {
          pointer.current?.hide();
          endPhoneStroke();
        } else if (m.t === "action") {
          const a = actions.current;
          ({ next: a.next, prev: a.prev, undo: a.undo, clear: a.clear, blank: a.blank })[m.a]?.();
        }
      },
    });

    // Hide a phone pointer that stopped updating (e.g. the release was lost).
    const watchdog = setInterval(() => {
      if (pointer.current?.isVisible && performance.now() - lastPhoneFrame.current > POINTER_TIMEOUT_MS && lastPhoneFrame.current > 0) {
        lastPhoneFrame.current = 0;
        pointer.current.hide();
        endPhoneStroke();
      }
    }, 250);

    // Leaving the presentation keeps the phone paired (back on the home page).
    return () => {
      clearInterval(watchdog);
      detachPresenter();
    };
  }, []);

  // Keep the phone's slide counter in sync.
  useEffect(() => {
    presenterLink()?.sendControl({ t: "state", slide, total, blank });
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
        setToast((t) => ({ key: (t?.key ?? 0) + 1, action: a }));
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
      else if (key === "p") setPhonePanel((p) => (p === "closed" ? "confirm" : "closed"));
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
          <RouterLink className="btn btn-shimmer" to="/">
            Back
          </RouterLink>
        </div>
      )}

      {toast && (
        <GestureToast key={toast.key} action={toast.action} onDone={() => setToast(null)} />
      )}

      <div className={`present-controls${controlsVisible || phonePanel !== "closed" ? " visible" : ""}`}>
        <div className="hud-top-right">
          {blank && (
            <span className="badge">
              <MonitorOff size={14} aria-hidden="true" /> Screen blanked
            </span>
          )}
          {camera === "loading" && (
            <span className="badge">
              <Camera size={14} aria-hidden="true" /> Starting camera…
            </span>
          )}
          {camera === "error" && (
            <span className="badge badge-bad">
              <span className="badge-dot" /> Camera unavailable
            </span>
          )}
        </div>

        <div className="toolbar" role="toolbar" aria-label="Presentation controls">
          <button className="tool" onClick={() => navigate("/")} aria-label="Back to home" title="Back">
            <ArrowLeft size={18} />
          </button>
          <span className="tool-sep" />
          <button
            className="tool"
            onClick={() => actions.current.prev()}
            disabled={slide === 0}
            aria-label="Previous slide"
            title="Previous (←)"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="tool-counter" aria-live="polite">
            {total > 0 ? (
              <>
                <strong>{slide + 1}</strong> / {total}
              </>
            ) : (
              "–"
            )}
          </span>
          <button
            className="tool"
            onClick={() => actions.current.next()}
            disabled={slide >= total - 1}
            aria-label="Next slide"
            title="Next (→)"
          >
            <ChevronRight size={20} />
          </button>
          <span className="tool-sep" />
          <button
            className={`tool tool-wide${phonePanel !== "closed" ? " on" : ""}`}
            onClick={() => setPhonePanel((p) => (p === "closed" ? "confirm" : "closed"))}
            aria-expanded={phonePanel !== "closed"}
            title="Phone remote (P)"
          >
            <Smartphone size={18} aria-hidden="true" />
            {connected && linkStatus ? <StatusBadge status={linkStatus} waitingFor="phone" /> : <span>Pair phone</span>}
          </button>
          <button
            className="tool"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title="Fullscreen (F)"
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {phonePanel === "confirm" && (
        <div className="phone-panel" role="alertdialog" aria-labelledby="pair-confirm-title">
          <button className="close" onClick={() => setPhonePanel("closed")} aria-label="Close">
            <X size={18} />
          </button>
          <span className="feature-icon">
            <ShieldAlert size={20} aria-hidden="true" />
          </span>
          <h2 id="pair-confirm-title">Show the QR code on this screen?</h2>
          <p className="muted small">
            If this screen is being projected, anyone in the room could scan it and control your slides. Pairing from
            the home page before presenting is safer.
          </p>
          <div className="panel-actions">
            <button className="btn btn-quiet" onClick={() => setPhonePanel("closed")} autoFocus>
              Cancel
            </button>
            <button className="btn btn-shimmer" onClick={() => setPhonePanel("qr")}>
              Show QR code
            </button>
          </div>
        </div>
      )}

      {phonePanel === "qr" && (
        <div className="phone-panel" role="dialog" aria-label="Connect phone">
          <button className="close" onClick={() => setPhonePanel("closed")} aria-label="Close">
            <X size={18} />
          </button>
          <span className="feature-icon">
            <Smartphone size={20} aria-hidden="true" />
          </span>
          <h2>Use your phone as a remote</h2>
          {session.error ? (
            <p className="error small">{session.error}</p>
          ) : session.pairUrl ? (
            <>
              <div className="qr">
                <QRCodeSVG value={session.pairUrl} size={200} marginSize={1} />
              </div>
              {session.unreachable && (
                <p className="error small">
                  Your phone can't open <strong>localhost</strong>. Open this page through your computer's network
                  address or an HTTPS tunnel, or set PUBLIC_URL on the server.
                </p>
              )}
              <p className="muted small">Scan with your phone's camera. Use the same Wi-Fi for the lowest pointer lag.</p>
              <StatusBadge status={linkStatus} waitingFor="phone" />
              <details>
                <summary className="muted small">Can't scan?</summary>
                <input className="pair-url" readOnly value={session.pairUrl} onFocus={(e) => e.target.select()} />
              </details>
            </>
          ) : (
            <p className="muted">Creating pairing code…</p>
          )}
        </div>
      )}
    </div>
  );
}

function GestureToast({ action, onDone }: { action: HandAction; onDone: () => void }) {
  const [Icon, label] = GESTURE_TOASTS[action];
  return (
    <div className="gesture-toast" role="status" onAnimationEnd={onDone}>
      <Icon size={16} aria-hidden="true" />
      {label}
    </div>
  );
}
