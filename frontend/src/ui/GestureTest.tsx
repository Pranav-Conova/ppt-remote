// "Test your gestures" in the gesture sheet: opens the webcam, runs the same
// hand tracking as the presentation, and says live which fingers it sees and
// which gesture that would trigger. Nothing fires; it only shows.
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle } from "lucide-react";
import { fingersUp, samePattern, type Fingers } from "../gesture/fingers";
import { ACTIVE_LINE } from "../gesture/gestureEngine";
import { startHandTracking } from "../gesture/handTracker";
import { GESTURE_LABELS, type GestureName, type PresenterSettings } from "../lib/settings";
import { FingerPattern } from "./FingerPattern";

type Gestures = PresenterSettings["gestures"];
/** What the camera sees: no hand, a hand below the active line, or a finger pattern. */
type Seen = { kind: "none" } | { kind: "low" } | { kind: "hand"; fingers: Fingers };

/** Same idea as the gesture engine: a reading must hold this many frames before it is shown, so it doesn't flicker. */
const STABLE_FRAMES = 3;

export function matchGesture(gestures: Gestures, fingers: readonly number[]): GestureName | null {
  return (Object.keys(gestures) as GestureName[]).find((g) => samePattern(gestures[g], fingers)) ?? null;
}

export function GestureTest({
  gestures,
  onMatch,
}: {
  gestures: Gestures;
  /** The gesture the current pose matches, to highlight its card. */
  onMatch: (g: GestureName | null) => void;
}) {
  const [on, setOn] = useState(false);
  return (
    <div className={`gt${on ? " on" : ""}`}>
      <button type="button" className="gt-toggle" onClick={() => setOn((v) => !v)} aria-pressed={on}>
        {on ? <CameraOff size={16} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
        {on ? "Stop the test" : "Test your gestures with the camera"}
      </button>
      {on && <LiveTest gestures={gestures} onMatch={onMatch} />}
    </div>
  );
}

function LiveTest({ gestures, onMatch }: { gestures: Gestures; onMatch: (g: GestureName | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"loading" | "on" | "error">("loading");
  const [seen, setSeen] = useState<Seen>({ kind: "none" });

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let stop: (() => void) | null = null;
    // Stability filter over the per-frame readings.
    let candidate = "";
    let frames = 0;
    let shown = "none";

    const onFrame = (lm: { x: number; y: number }[] | null) => {
      const next: Seen = !lm ? { kind: "none" } : lm[0].y > ACTIVE_LINE ? { kind: "low" } : { kind: "hand", fingers: fingersUp(lm) };
      const key = next.kind === "hand" ? next.fingers.join("") : next.kind;
      frames = key === candidate ? frames + 1 : 1;
      candidate = key;
      if (frames >= STABLE_FRAMES && key !== shown) {
        shown = key;
        setSeen(next);
      }
    };

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
        const s = await startHandTracking(video, onFrame);
        if (cancelled) return s();
        stop = s;
        setPhase("on");
      } catch (e) {
        console.warn("gesture test: camera / hand tracking unavailable", e);
        if (!cancelled) setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // The match is worked out at render time, so editing a pattern updates it straight away.
  const match = seen.kind === "hand" ? matchGesture(gestures, seen.fingers) : null;
  useEffect(() => onMatch(match), [match, onMatch]);
  useEffect(() => () => onMatch(null), [onMatch]);

  return (
    <div className="gt-live">
      <div className="gt-video">
        <video ref={videoRef} muted playsInline />
        {phase === "on" && (
          <span className="gt-line" style={{ top: `${ACTIVE_LINE * 100}%` }}>
            <span>keep your wrist above this line</span>
          </span>
        )}
      </div>
      <div className="gt-read" aria-live="polite">
        {phase === "loading" && (
          <p className="gt-msg">
            <LoaderCircle size={18} className="spin" aria-hidden="true" /> Starting the camera and hand tracking…
          </p>
        )}
        {phase === "error" && (
          <p className="gt-msg error">
            Couldn&apos;t open the camera. Allow camera access (the camera icon in the address bar), then try again.
          </p>
        )}
        {phase === "on" && seen.kind === "none" && <p className="gt-msg">Hold up your hand so the camera can see it.</p>}
        {phase === "on" && seen.kind === "low" && <p className="gt-msg">Raise your hand above the dashed line.</p>}
        {phase === "on" && seen.kind === "hand" && (
          <>
            <span className="gt-label">I see</span>
            <FingerPattern pattern={seen.fingers} size={44} />
            <p className="gt-msg">
              {match ? (
                <>
                  That&apos;s <strong>{GESTURE_LABELS[match]}</strong>
                </>
              ) : (
                "No gesture uses this pattern."
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
