// Presenter settings, kept in localStorage. The old app stored these in the
// Django session.

export type GestureName = "next" | "previous" | "point" | "draw" | "undo" | "toggle_text";
export type Corner = "tl" | "tr" | "bl" | "br";

export interface PresenterSettings {
  /** Finger patterns, [thumb, index, middle, ring, pinky] with 1 for up. */
  gestures: Record<GestureName, number[]>;
  handGestures: boolean;
  camera: { visible: boolean; corner: Corner };
  overlayText: string;
}

export const GESTURE_LABELS: Record<GestureName, string> = {
  next: "Next",
  previous: "Previous",
  point: "Point",
  draw: "Draw",
  undo: "Undo",
  toggle_text: "Show text",
};

// The defaults from the original consumers.py.
export const DEFAULT_SETTINGS: PresenterSettings = {
  gestures: {
    next: [0, 0, 0, 0, 1],
    previous: [1, 0, 0, 0, 0],
    point: [0, 1, 0, 0, 0],
    draw: [1, 1, 0, 0, 0],
    undo: [0, 1, 1, 1, 0],
    toggle_text: [0, 1, 1, 0, 1],
  },
  // The webcam stays off until asked for: the phone is the default remote.
  handGestures: false,
  camera: { visible: false, corner: "tl" },
  overlayText: "NAMASKARAM",
};

const KEY = "signify.settings.v2";

export function loadSettings(): PresenterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PresenterSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        gestures: { ...DEFAULT_SETTINGS.gestures, ...saved.gestures },
        camera: { ...DEFAULT_SETTINGS.camera, ...saved.camera },
      };
    }
  } catch {
    // storage unavailable or corrupt; fall back to defaults
  }
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(s: PresenterSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore (private mode etc.)
  }
}

/** Names of gestures that share a finger pattern with another gesture. */
export function duplicateGestures(g: PresenterSettings["gestures"]): GestureName[] {
  const seen = new Map<string, GestureName>();
  const dupes = new Set<GestureName>();
  for (const [name, pattern] of Object.entries(g) as [GestureName, number[]][]) {
    const key = pattern.join("");
    const other = seen.get(key);
    if (other) {
      dupes.add(other);
      dupes.add(name);
    } else {
      seen.set(key, name);
    }
  }
  return [...dupes];
}
