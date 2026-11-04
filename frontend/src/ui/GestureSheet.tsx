import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, MousePointer2, PenLine, Type, Undo2, X, type LucideIcon } from "lucide-react";
import { GESTURE_LABELS, type GestureName, type PresenterSettings } from "../lib/settings";
import { GestureTest } from "./GestureTest";
import { Sheet } from "./Sheet";
import { Switch } from "./Switch";

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

/** Pop-up with the finger-pattern editor. */
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
  /** The gesture the camera test currently sees, highlighted in the list. */
  const [live, setLive] = useState<GestureName | null>(null);
  const toggleFinger = (name: GestureName, i: number) =>
    setSettings((s) => {
      const pattern = [...s.gestures[name]];
      pattern[i] = pattern[i] ? 0 : 1;
      return { ...s, gestures: { ...s.gestures, [name]: pattern } };
    });

  return (
    <Sheet labelledBy="sheet-title" stagger=".gesture-card" onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet-head">
            <div>
              <h2 id="sheet-title">Make the gestures yours</h2>
              <p className="muted small">
                Tap a finger to raise or lower it. Hold your hand above the bottom quarter of the camera view; point
                with your index finger.
              </p>
            </div>
            <button className="sheet-close" onClick={close} aria-label="Close">
              <X size={18} />
            </button>
          </header>

          <div className="sheet-tools">
            <Switch
              checked={settings.handGestures}
              onChange={(v) => setSettings((s) => ({ ...s, handGestures: v }))}
              hint={settings.handGestures ? undefined : "Off: the camera won't watch for these while you present."}
            >
              Use hand gestures when presenting
            </Switch>
            <GestureTest gestures={settings.gestures} onMatch={setLive} />
          </div>

          <div className="gesture-list">
            {(Object.keys(GESTURE_LABELS) as GestureName[]).map((name) => {
              const Icon = GESTURE_ICONS[name];
              const dupe = dupes.includes(name);
              return (
                <div
                  key={name}
                  className={`gesture-card${dupe ? " dupe" : ""}${live === name ? " live" : ""}`}
                  style={{ "--accent": GESTURE_COLORS[name] } as CSSProperties}
                >
                  <div className="gesture-title">
                    <span className="g-icon">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span>{GESTURE_LABELS[name]}</span>
                    {live === name && <span className="live-tag">Seen now</span>}
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
        </>
      )}
    </Sheet>
  );
}
