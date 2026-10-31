import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  FlaskConical,
  MonitorOff,
  MousePointer2,
  PenLine,
  PowerOff,
  Settings,
  ShieldAlert,
  Undo2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "../ui/Switch";
import { useParams } from "react-router-dom";
import { Link, fetchConfig, type LinkStatus } from "../link/link";
import { FLAG_DRAW, FLAG_VISIBLE, encodePointer, type RemoteAction } from "../link/protocol";
import { StatusBadge } from "../link/StatusBadge";
import {
  GyroPointer,
  loadGyroSettings,
  saveGyroSettings,
  motionNeedsPermission,
  motionSupported,
  requestMotionPermission,
  type GyroSettings,
} from "../remote/gyro";

/** Pressing Pointer/Draw again within this window continues from the last spot instead of re-centring. */
const CONTINUE_MS = 1500;
/**
 * While holding Pointer, dragging the finger down this far (CSS px, ~7 mm)
 * starts drawing and dragging back up this far stops. Large enough to
 * ignore a finger's natural wobble.
 */
const DRAW_DRAG_PX = 28;
/** Touchpad fallback: slide widths moved per pixel dragged. */
const TOUCHPAD_GAIN = 1 / 350;

type Motion = "unknown" | "granted" | "denied" | "unsupported";
type HoldMode = "pointer" | "draw";

function buzz(ms = 10) {
  navigator.vibrate?.(ms);
}

export default function Remote() {
  const { id = "" } = useParams();
  const token = location.hash.slice(1);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [deckState, setDeckState] = useState<{ slide: number; total: number; blank: boolean } | null>(null);
  const [motion, setMotion] = useState<Motion>(() =>
    !motionSupported() ? "unsupported" : motionNeedsPermission() ? "unknown" : "granted",
  );
  const [gyroSettings, setGyroSettings] = useState<GyroSettings>(loadGyroSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [holding, setHolding] = useState<HoldMode | null>(null);

  const link = useRef<Link | null>(null);
  const gyro = useRef<GyroPointer | null>(null);
  const seq = useRef(0);
  const hold = useRef<HoldMode | null>(null);
  const lastRelease = useRef(-Infinity);
  /** Finger on the Pointer pad. extremeY: highest point while not drawing, lowest while drawing. */
  const touch = useRef<{ x: number; y: number; px: number; py: number; extremeY: number } | null>(null);

  // ---- link -------------------------------------------------------------------------
  useEffect(() => {
    if (!id || !token) return;
    let disposed = false;
    fetchConfig().then(({ iceServers }) => {
      if (disposed) return;
      const l = new Link({ sessionId: id, role: "remote", token, iceServers });
      l.onStatus = setStatus;
      l.onControl = (m) => {
        if (m.t === "state") setDeckState({ slide: m.slide, total: m.total, blank: m.blank });
      };
      link.current = l;
    });
    return () => {
      disposed = true;
      link.current?.close();
      link.current = null;
    };
  }, [id, token]);

  // The presenter closed the presentation: stop the pointer and the sensors.
  const ended = status?.ended ?? false;
  useEffect(() => {
    if (!ended) return;
    hold.current = null;
    setHolding(null);
    setDeckState(null);
    setShowSettings(false);
    gyro.current?.dispose();
    navigator.vibrate?.([30, 80, 30]);
  }, [ended]);

  // ---- gyro -------------------------------------------------------------------------
  const sendPointer = (x: number, y: number) => {
    const mode = hold.current;
    if (!mode) return;
    const flags = FLAG_VISIBLE | (mode === "draw" ? FLAG_DRAW : 0);
    link.current?.sendPointer(encodePointer({ seq: seq.current++ & 0xffff, x, y, flags }));
  };

  useEffect(() => {
    const g = new GyroPointer(loadGyroSettings());
    g.onMove = sendPointer;
    gyro.current = g;
    return () => g.dispose();
  }, []);

  useEffect(() => {
    gyro.current?.update(gyroSettings);
    saveGyroSettings(gyroSettings);
  }, [gyroSettings]);

  // Keep the screen awake while the remote is open.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        lock = await navigator.wakeLock?.request("screen");
        lock?.addEventListener("release", () => (lock = null));
      } catch {
        // not allowed yet (needs a user gesture on some browsers); retried on tap
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    document.addEventListener("click", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      document.removeEventListener("click", acquire);
      void lock?.release();
    };
  }, []);

  async function enableMotion() {
    const ok = await requestMotionPermission();
    setMotion(ok ? "granted" : "denied");
    buzz();
  }

  // ---- actions ------------------------------------------------------------------------
  const act = (a: RemoteAction) => {
    link.current?.sendControl({ t: "action", a });
    buzz();
  };

  const startHold = (mode: HoldMode, e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    hold.current = mode;
    setHolding(mode);
    const g = gyro.current!;
    const recentre = performance.now() - lastRelease.current > CONTINUE_MS;
    g.begin(recentre);
    const [x, y] = g.position;
    touch.current = { x, y, px: e.clientX, py: e.clientY, extremeY: e.clientY };
    sendPointer(x, y);
    buzz(15);
  };

  /** Pen down/up while holding Pointer; the stroke starts and ends exactly at the dot. */
  const setPen = (on: boolean, fingerY: number) => {
    hold.current = on ? "draw" : "pointer";
    setHolding(hold.current);
    touch.current!.extremeY = fingerY;
    const [x, y] = gyro.current!.position;
    sendPointer(x, y);
    buzz(on ? 20 : 10);
  };

  const moveHold = (e: React.PointerEvent) => {
    const t = touch.current;
    if (!hold.current || !t) return;
    // Decide by whether gyro data actually arrives, not by the permission state:
    // newer Chrome has DeviceMotionEvent.requestPermission too, so `motion` can
    // stay "unknown" while the gyro already drives the dot. Treating that as
    // "no gyro" let finger movement snap the dot back to where the touch began.
    if (gyro.current?.hasData) {
      // The gyro aims; the finger only lifts the pen. Measuring from the
      // highest/lowest point means dragging up while not drawing does nothing.
      if (hold.current === "pointer") {
        t.extremeY = Math.min(t.extremeY, e.clientY);
        if (e.clientY - t.extremeY > DRAW_DRAG_PX) setPen(true, e.clientY);
      } else {
        t.extremeY = Math.max(t.extremeY, e.clientY);
        if (t.extremeY - e.clientY > DRAW_DRAG_PX) setPen(false, e.clientY);
      }
      return;
    }
    // Touchpad fallback for phones without a usable gyroscope: dragging moves the dot.
    t.x = Math.min(1, Math.max(0, t.x + (e.clientX - t.px) * TOUCHPAD_GAIN));
    t.y = Math.min(1, Math.max(0, t.y + (e.clientY - t.py) * TOUCHPAD_GAIN * (16 / 9)));
    t.px = e.clientX;
    t.py = e.clientY;
    gyro.current?.setPosition(t.x, t.y);
    sendPointer(t.x, t.y);
  };

  const endHold = () => {
    if (!hold.current) return;
    hold.current = null;
    setHolding(null);
    gyro.current?.end();
    lastRelease.current = performance.now();
    // The pointer channel is lossy, so the release also goes over the reliable one.
    const [x, y] = gyro.current?.position ?? [0.5, 0.5];
    for (let i = 0; i < 2; i++) link.current?.sendPointer(encodePointer({ seq: seq.current++ & 0xffff, x, y, flags: 0 }));
    link.current?.sendControl({ t: "release" });
  };

  // ---- render ---------------------------------------------------------------------------
  if (!id || !token) {
    return (
      <div className="center-screen remote">
        <p>This link is incomplete. Scan the QR code on the presenter's screen again.</p>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="center-screen remote remote-ended">
        <span className="feature-icon">
          <PowerOff size={22} aria-hidden="true" />
        </span>
        <h1>Presentation ended</h1>
        <p className="muted">
          The presenter closed the presentation, so this remote has stopped. To control a new one, scan the QR code on
          the presenter&apos;s home page.
        </p>
      </div>
    );
  }

  const connected = status?.transport !== "none" && status != null;
  const needsMotion = motion === "unknown";
  const insecure = !window.isSecureContext;

  return (
    <div className="remote">
      <header className="remote-bar">
        <StatusBadge status={status} waitingFor="presenter" />
        <span className="remote-counter" aria-live="polite">
          {deckState ? (
            <>
              <strong>{deckState.slide + 1}</strong>
              <span> / {deckState.total}</span>
            </>
          ) : (
            "– / –"
          )}
        </span>
        <button
          className={`icon-btn${showSettings ? " on" : ""}`}
          onClick={() => setShowSettings((s) => !s)}
          aria-label="Pointer settings"
          aria-expanded={showSettings}
        >
          <Settings size={18} />
        </button>
      </header>

      {insecure && (
        <p className="notice">
          <ShieldAlert size={16} aria-hidden="true" />
          Open this page over HTTPS to use the motion pointer. Buttons still work, and you can drag on the pointer
          pad.
        </p>
      )}
      {!insecure && needsMotion && (
        <button className="notice notice-btn" onClick={enableMotion}>
          <Zap size={16} aria-hidden="true" />
          Tap to enable the motion pointer
        </button>
      )}
      {motion === "denied" && (
        <p className="notice">
          <ShieldAlert size={16} aria-hidden="true" />
          Motion access was denied. Drag on the pointer pad instead, or reload to try again.</p>
      )}

      {showSettings && (
        <section className="settings-sheet">
          <label className="range">
            <span className="range-head">
              Sensitivity <output>{80 - gyroSettings.degreesPerWidth}</output>
            </span>
            <input
              type="range"
              min={10}
              max={70}
              step={1}
              // Higher sensitivity = fewer degrees to cross the slide.
              value={80 - gyroSettings.degreesPerWidth}
              onChange={(e) => setGyroSettings({ ...gyroSettings, degreesPerWidth: 80 - Number(e.target.value) })}
            />
          </label>
          <label className="range">
            <span className="range-head">
              Acceleration <output>{Math.round(gyroSettings.acceleration * 100)}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={gyroSettings.acceleration}
              aria-describedby="accel-hint"
              onChange={(e) => setGyroSettings({ ...gyroSettings, acceleration: Number(e.target.value) })}
            />
            <span className="range-hint" id="accel-hint">
              Higher = steadier small moves, faster big sweeps
            </span>
          </label>
          <label className="range">
            <span className="range-head">
              Smoothing <output>{Math.round(gyroSettings.smoothing * 100)}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={gyroSettings.smoothing}
              onChange={(e) => setGyroSettings({ ...gyroSettings, smoothing: Number(e.target.value) })}
            />
            <span className="range-hint">Steadies small movements only; big moves stay instant</span>
          </label>
          <Switch
            checked={gyroSettings.autoCalibrate}
            onChange={(v) => setGyroSettings({ ...gyroSettings, autoCalibrate: v })}
            hint="Stops the dot sliding when you hold still"
          >
            Automatic drift correction
          </Switch>
          <Switch checked={gyroSettings.invertX} onChange={(v) => setGyroSettings({ ...gyroSettings, invertX: v })}>
            Invert left/right
          </Switch>
          <Switch checked={gyroSettings.invertY} onChange={(v) => setGyroSettings({ ...gyroSettings, invertY: v })}>
            Invert up/down
          </Switch>
          <a className="lab-link" href="/lab" target="_blank" rel="noreferrer">
            <FlaskConical size={16} aria-hidden="true" />
            Pointer not right? Record motion data in the Pointer Lab
          </a>
        </section>
      )}

      <div className={`remote-grid${connected ? "" : " offline"}`}>
        <HoldPad
          icon={holding === "draw" ? PenLine : MousePointer2}
          label={holding === "draw" ? "Drawing" : "Pointer"}
          hint={holding === "draw" ? "Drag up to stop" : "Hold to point · drag down to draw"}
          active={holding !== null}
          onDown={(e) => startHold("pointer", e)}
          onMove={moveHold}
          onUp={endHold}
          className={holding === "draw" ? "draw" : ""}
        />
        <TapButton className="prev" onTap={() => act("prev")}>
          <ChevronLeft size={30} aria-hidden="true" />
          <span>Prev</span>
        </TapButton>
        <TapButton className="next" onTap={() => act("next")}>
          <span>Next</span>
          <ChevronRight size={30} aria-hidden="true" />
        </TapButton>
        <TapButton className="small" onTap={() => act("undo")}>
          <Undo2 size={20} aria-hidden="true" />
          <span>Undo</span>
        </TapButton>
        <TapButton className="small" onTap={() => act("clear")}>
          <Eraser size={20} aria-hidden="true" />
          <span>Clear</span>
        </TapButton>
        <TapButton className={`small${deckState?.blank ? " on" : ""}`} onTap={() => act("blank")}>
          <MonitorOff size={20} aria-hidden="true" />
          <span>Blank</span>
        </TapButton>
      </div>
    </div>
  );
}

// pointerdown fires immediately on touch, with no click delay. touch-action:none
// in CSS stops the browser from scrolling or zooming instead.
function TapButton({ children, onTap, className = "" }: { children: ReactNode; onTap: () => void; className?: string }) {
  return (
    <button
      className={`pad tap ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        // Restart the green flash even on quick repeated taps.
        const el = e.currentTarget;
        el.classList.remove("hit");
        void el.offsetWidth;
        el.classList.add("hit");
        onTap();
      }}
      onAnimationEnd={(e) => e.currentTarget.classList.remove("hit")}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function HoldPad(props: {
  icon: LucideIcon;
  label: string;
  hint: string;
  active: boolean;
  onDown: (e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onUp: () => void;
  className?: string;
}) {
  return (
    <button
      className={`pad hold ${props.className ?? ""}${props.active ? " active" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        props.onDown(e);
      }}
      onPointerMove={props.onMove}
      onPointerUp={props.onUp}
      onPointerCancel={props.onUp}
      onLostPointerCapture={props.onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pad-rings" aria-hidden="true" />
      <props.icon size={30} aria-hidden="true" />
      <span className="pad-label">{props.label}</span>
      <span className="pad-hint">{props.hint}</span>
    </button>
  );
}
