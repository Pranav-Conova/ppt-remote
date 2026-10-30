// Pointer Lab: a guided recording of phone motion data. Each step asks for a
// specific movement, so the data comes labelled with what the user intended.
// The upload returns an ID that can be shared for analysis.
import { useEffect, useRef, useState } from "react";
import { Check, CircleDot, Copy, Download, FlaskConical, ShieldAlert, Upload } from "lucide-react";
import { GyroPointer, loadGyroSettings, motionSupported, requestMotionPermission } from "../remote/gyro";
import { MotionRecorder } from "../remote/recorder";

interface Step {
  id: string;
  title: string;
  detail: string;
  seconds: number;
}

const STEPS: Step[] = [
  { id: "still", title: "Hold still", detail: "Point at the middle of your screen and keep the phone steady.", seconds: 4 },
  { id: "right", title: "Turn slowly right", detail: "Sweep from the middle to the right edge of your screen.", seconds: 4 },
  { id: "left", title: "Turn slowly left", detail: "Sweep from the middle to the left edge of your screen.", seconds: 4 },
  { id: "up", title: "Tilt slowly up", detail: "Move from the middle to the top edge of your screen.", seconds: 3 },
  { id: "down", title: "Tilt slowly down", detail: "Move from the middle to the bottom edge of your screen.", seconds: 3 },
  { id: "circle", title: "Draw a big circle", detail: "Trace a circle around the screen, clockwise, twice.", seconds: 6 },
  { id: "flick", title: "Quick moves", detail: "Flick quickly to a corner and back, a few times.", seconds: 4 },
  { id: "free", title: "Point naturally", detail: "Point at things the way you would in a real talk.", seconds: 10 },
];
const READY_MS = 2200;

const HOLD_STYLES = ["Flat, like a TV remote", "Tilted up about 45°", "Upright, screen facing me", "Something else"];
const ISSUES = [
  "Left/right and up/down are swapped",
  "Moves the opposite way",
  "Too fast",
  "Too slow",
  "Jittery or shaky",
  "Drifts when I hold still",
  "Lags behind my hand",
  "Jumps suddenly",
  "Feels good",
];

type Phase = "intro" | "ready" | "rec" | "notes" | "uploading" | "done";

export default function Lab() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [holdStyle, setHoldStyle] = useState(HOLD_STYLES[0]);
  const [issues, setIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [phoneModel, setPhoneModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [readout, setReadout] = useState({ a: 0, b: 0, g: 0, n: 0 });

  const recorder = useRef<MotionRecorder | null>(null);
  const gyro = useRef<GyroPointer | null>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settings = useRef(loadGyroSettings());

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      recorder.current?.stop();
      gyro.current?.dispose();
    },
    [],
  );

  // Live sensor readout while recording (4×/s is plenty for humans).
  useEffect(() => {
    if (phase !== "ready" && phase !== "rec") return;
    const id = setInterval(() => {
      const r = recorder.current;
      if (r) setReadout({ ...r.latest, n: r.sampleCount });
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  function runStep(i: number) {
    const step = STEPS[i];
    setStepIndex(i);
    setPhase("ready");
    gyro.current!.end();
    later(() => {
      setPhase("rec");
      recorder.current!.beginStep(step.id);
      gyro.current!.begin(true);
      navigator.vibrate?.(30);
      later(() => {
        recorder.current!.endStep();
        if (i + 1 < STEPS.length) runStep(i + 1);
        else finish();
      }, step.seconds * 1000);
    }, READY_MS);
  }

  function finish() {
    gyro.current?.end();
    recorder.current?.stop();
    navigator.vibrate?.([20, 60, 20]);
    setPhase("notes");
  }

  async function start() {
    setError(null);
    if (!(await requestMotionPermission())) {
      setError("Motion access was denied. Allow it in your browser settings and reload.");
      return;
    }
    recorder.current?.stop();
    gyro.current?.dispose();
    settings.current = loadGyroSettings();
    const rec = new MotionRecorder();
    const g = new GyroPointer(settings.current);
    g.onMove = (x, y) => {
      rec.addPointer(x, y);
      const dot = dotRef.current;
      if (dot) dot.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    };
    recorder.current = rec;
    gyro.current = g;
    rec.start();
    runStep(0);
  }

  function payload() {
    return recorder.current!.toJSON({ holdStyle, phoneModel, issues, notes, settings: settings.current });
  }

  function download() {
    const blob = new Blob([JSON.stringify(payload())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `signify-gyro-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function upload() {
    setPhase("uploading");
    setError(null);
    try {
      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!res.ok) throw new Error((await res.text()).trim() || `Upload failed (${res.status})`);
      const { id } = await res.json();
      setResultId(id);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("notes");
    }
  }

  const step = STEPS[stepIndex];
  const insecure = !window.isSecureContext;

  return (
    <div className="lab">
      <header className="lab-head">
        <span className="feature-icon small">
          <FlaskConical size={16} aria-hidden="true" />
        </span>
        <h1>Pointer Lab</h1>
      </header>

      {phase === "intro" && (
        <section className="lab-body">
          <p>
            This records how your phone's motion sensors behave while you do a few guided moves. The data helps
            fix and tune the laser pointer for your phone. It takes about <strong>1 minute</strong>.
          </p>
          <ol className="lab-list">
            <li>Stand in front of your laptop or a wall, as if presenting.</li>
            <li>Hold the phone the way you normally would to point.</li>
            <li>Follow each instruction until the bar fills up.</li>
          </ol>
          <fieldset className="lab-choice">
            <legend>How do you hold the phone when pointing?</legend>
            {HOLD_STYLES.map((s) => (
              <label key={s} className={`chip${holdStyle === s ? " on" : ""}`}>
                <input type="radio" name="hold" checked={holdStyle === s} onChange={() => setHoldStyle(s)} />
                {s}
              </label>
            ))}
          </fieldset>
          {(insecure || !motionSupported()) && (
            <p className="notice">
              <ShieldAlert size={16} aria-hidden="true" />
              {insecure ? "Open this page over HTTPS to read motion sensors." : "This browser has no motion sensors."}
            </p>
          )}
          {error && <p className="error small">{error}</p>}
          <button className="btn btn-shimmer" onClick={start} disabled={insecure || !motionSupported()}>
            <CircleDot size={18} aria-hidden="true" /> Start recording
          </button>
        </section>
      )}

      {(phase === "ready" || phase === "rec") && (
        <section className="lab-body">
          <div className="lab-progress" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.id} className={i < stepIndex ? "done" : i === stepIndex ? "now" : ""} />
            ))}
          </div>
          <p className="eyebrow">
            Step {stepIndex + 1} of {STEPS.length} · {phase === "ready" ? "get ready" : "recording"}
          </p>
          <h2 className={`lab-step${phase === "rec" ? " live" : ""}`}>{step.title}</h2>
          <p className="muted">{step.detail}</p>
          <div className="lab-bar">
            <span
              key={`${step.id}-${phase}`}
              className={phase}
              style={{ animationDuration: `${phase === "ready" ? READY_MS : step.seconds * 1000}ms` }}
            />
          </div>
          <div className="lab-preview" aria-label="Where the current algorithm puts the pointer">
            <div className="lab-dot-track" ref={dotRef}>
              <span className="lab-dot" />
            </div>
          </div>
          <p className="lab-readout">
            α {readout.a.toFixed(1)} · β {readout.b.toFixed(1)} · γ {readout.g.toFixed(1)} °/s · {readout.n} samples
          </p>
        </section>
      )}

      {(phase === "notes" || phase === "uploading") && (
        <section className="lab-body">
          <h2>How did the pointer feel?</h2>
          <p className="muted small">Pick everything that applies. This tells the analysis what to look for.</p>
          <div className="lab-choice">
            {ISSUES.map((s) => (
              <label key={s} className={`chip${issues.includes(s) ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={issues.includes(s)}
                  onChange={(e) => setIssues((l) => (e.target.checked ? [...l, s] : l.filter((x) => x !== s)))}
                />
                {s}
              </label>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Describe the problem in your own words</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. when I turn right the dot goes up, and it keeps sliding left when I stop"
            />
          </label>
          <label className="field">
            <span className="field-label">Phone model (optional)</span>
            <input type="text" value={phoneModel} onChange={(e) => setPhoneModel(e.target.value)} placeholder="e.g. Pixel 8, iPhone 13" />
          </label>
          {error && (
            <p className="error small" role="alert">
              {error}. You can still download the data file and send it directly.
            </p>
          )}
          <button className="btn btn-shimmer" onClick={upload} disabled={phase === "uploading"}>
            <Upload size={18} aria-hidden="true" /> {phase === "uploading" ? "Uploading…" : "Upload recording"}
          </button>
          <button className="btn btn-quiet" onClick={download}>
            <Download size={18} aria-hidden="true" /> Download data file
          </button>
        </section>
      )}

      {phase === "done" && resultId && (
        <section className="lab-body center">
          <span className="lab-ok">
            <Check size={28} aria-hidden="true" />
          </span>
          <h2>Recording saved</h2>
          <p className="muted">Send this ID for analysis:</p>
          <button
            className="lab-id"
            onClick={() => {
              void navigator.clipboard?.writeText(resultId).then(() => setCopied(true));
            }}
          >
            <code>{resultId}</code>
            {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          </button>
          <p className="muted small">
            The server may clear recordings when it restarts, so share the ID soon, or keep a copy:
          </p>
          <button className="btn btn-quiet" onClick={download}>
            <Download size={18} aria-hidden="true" /> Download data file
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => {
              setPhase("intro");
              setIssues([]);
              setNotes("");
              setResultId(null);
              setCopied(false);
            }}
          >
            Record another
          </button>
        </section>
      )}
    </div>
  );
}
