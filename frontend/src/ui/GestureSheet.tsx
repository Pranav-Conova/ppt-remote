import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, MousePointer2, PenLine, Type, Undo2, X, type LucideIcon } from "lucide-react";
import { GESTURE_LABELS, type GestureName, type PresenterSettings } from "../lib/settings";
import { FULL_MOTION, gsap } from "./gsap";

export const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
// Relative finger lengths for the hand-shaped pattern editor.
export const FINGER_HEIGHT = [0.62, 0.88, 1, 0.9, 0.7];

export const GESTURE_ICONS: Record<GestureName, LucideIcon> = {
  next: ChevronRight,
  previous: ChevronLeft,
  point: MousePointer2,
  draw: PenLine,
  undo: Undo2,
  toggle_text: Type,
};

/** One accent per gesture, so the tile preview and the editor match. */
export const GESTURE_COLORS: Record<GestureName, string> = {
  next: "var(--c-green)",
  previous: "var(--c-cyan)",
  point: "var(--c-red)",
  draw: "var(--c-yellow)",
  undo: "var(--c-violet)",
  toggle_text: "var(--c-pink)",
};

const FOCUSABLE = "button, input, [href], [tabindex]:not([tabindex='-1'])";

/**
 * Glass pop-up with the finger-pattern editor. Esc, the close button or a
 * click outside closes it; focus stays inside while it is open.
 */
export function GestureSheet({
  settings,
  setSettings,
  dupes,
  onClose,
}: {
  settings: PresenterSettings;
  setSettings: (update: (s: PresenterSettings) => PresenterSettings) => void;
  dupes: GestureName[];
  onClose: () => void;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (!window.matchMedia(FULL_MOTION).matches) return onClose();
    gsap.to(backdrop.current, { opacity: 0, duration: 0.25 });
    gsap.to(panel.current, { y: 24, scale: 0.96, opacity: 0, filter: "blur(8px)", duration: 0.25, ease: "power2.in", onComplete: onClose });
  };

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    if (window.matchMedia(FULL_MOTION).matches) {
      gsap.from(backdrop.current, { opacity: 0, duration: 0.3 });
      gsap.from(panel.current, { y: 30, scale: 0.94, opacity: 0, filter: "blur(10px)", duration: 0.55, ease: "expo.out", clearProps: "filter" });
      gsap.from(".sheet .gesture-card", { y: 18, opacity: 0, duration: 0.5, ease: "back.out(1.6)", stagger: 0.05, delay: 0.1 });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  const toggleFinger = (name: GestureName, i: number) =>
    setSettings((s) => {
      const pattern = [...s.gestures[name]];
      pattern[i] = pattern[i] ? 0 : 1;
      return { ...s, gestures: { ...s.gestures, [name]: pattern } };
    });

  // Rendered at the top of the document so no tile can end up above it.
  return createPortal(
    <div className="sheet-backdrop" ref={backdrop} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" ref={panel} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className="sheet-head">
          <div>
            <h2 id="sheet-title">Make the gestures yours</h2>
            <p className="muted small">
              Tap a finger to raise or lower it. Hold your hand above the bottom quarter of the camera view; point with
              your index finger.
            </p>
          </div>
          <button className="sheet-close" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {!settings.handGestures && (
          <p className="sheet-note small">Hand gestures are off. Turn them on in the Start tile to use these.</p>
        )}

        <div className="gesture-list">
          {(Object.keys(GESTURE_LABELS) as GestureName[]).map((name) => {
            const Icon = GESTURE_ICONS[name];
            const dupe = dupes.includes(name);
            return (
              <div
                key={name}
                className={`gesture-card${dupe ? " dupe" : ""}`}
                style={{ "--accent": GESTURE_COLORS[name] } as CSSProperties}
              >
                <div className="gesture-title">
                  <span className="g-icon">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span>{GESTURE_LABELS[name]}</span>
                </div>
                <div className="hand" role="group" aria-label={`${GESTURE_LABELS[name]} finger pattern`}>
                  {settings.gestures[name].map((up, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`finger${up ? " up" : ""}`}
                      style={{ "--h": FINGER_HEIGHT[i] } as CSSProperties}
                      aria-pressed={!!up}
                      aria-label={`${FINGERS[i]} ${up ? "up" : "down"}`}
                      title={FINGERS[i]}
                      onClick={() => toggleFinger(name, i)}
                    >
                      <span className="finger-bar" />
                      <span className="finger-label">{FINGERS[i][0]}</span>
                    </button>
                  ))}
                </div>
                {dupe && <span className="dupe-note">Same as another gesture</span>}
              </div>
            );
          })}
        </div>

        <footer className="sheet-foot">
          <label className="field">
            <span className="field-label">Text for the “Show text” gesture</span>
            <input
              type="text"
              value={settings.overlayText}
              maxLength={40}
              onChange={(e) => setSettings((s) => ({ ...s, overlayText: e.target.value }))}
            />
          </label>
          <button className="btn btn-spectrum" onClick={close}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
