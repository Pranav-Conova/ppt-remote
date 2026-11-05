// Pointer Lab pop-up: a guided recording of phone motion data. Each step asks
// for a specific movement, so the data comes labelled with what the user
// intended. The upload returns an ID that can be shared for analysis.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, CircleDot, Copy, Download, FlaskConical, RotateCcw, ShieldAlert, Upload, X } from "lucide-react";
import { GyroPointer, loadGyroSettings, motionSupported, requestMotionPermission } from "../remote/gyro";
import { MotionRecorder } from "../remote/recorder";
import { Asterisk, Clover, Ring } from "./art";
import { FULL_MOTION, gsap, useGSAP } from "./gsap";
import { Sheet } from "./Sheet";
import { Tile } from "./Tile";
// Stickers, tiles and buttons come from home.css (loaded by the home page);
// lab.css only lays them out inside the sheet.
import "./lab.css";

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

/** Each step gets its own sticker colour; the progress bar uses the same. */
const STEP_COLORS = [
  "--c-green",
  "--c-pink",
  "--c-orange",
  "--c-violet",
  "--c-blue",
  "--c-lime",
  "--c-yellow",
  "--c-green",
];
const color = (i: number) => `var(${STEP_COLORS[i % STEP_COLORS.length]})`;

const HOW = [
  { text: "Stand in front of your laptop or a wall, as if presenting", color: "var(--c-orange)" },
  { text: "Hold the phone the way you normally point", color: "var(--c-violet)" },
  { text: "Follow each step until its bar fills up", color: "var(--c-blue)" },
];

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

/** Opened from the home page (and from `/lab`, which the phone remote links to). */
export function LabSheet({ onClose }: { onClose: () => void }) {
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
  const root = useRef<HTMLDivElement>(null);

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
    a.download = `ppt-remote-gyro-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
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
  // Which screen is up; the two recording phases share one.
  const screen = phase === "ready" || phase === "rec" ? "rec" : phase === "uploading" ? "notes" : phase;

  // Same motion as the home page: cards wipe up, stickers slap on, shapes
  // keep turning. Runs again whenever the screen changes inside the sheet.
  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .from(".lab-body > *", {
            clipPath: "inset(100% 0% 0% 0% round 22px)",
            y: 30,
            duration: 0.9,
            stagger: 0.07,
            clearProps: "clipPath,transform",
          })
          .from(
            ".lab-body .sticker:not(.lab-step)",
            { scale: 0, rotation: -20, duration: 0.8, ease: "back.out(2.4)", stagger: 0.08 },
            0.25,
          );
        gsap.to(".clover", { rotation: 360, duration: 16, repeat: -1, ease: "none" });
        gsap.to(".asterisk", { rotation: -360, duration: 9, repeat: -1, ease: "none" });
        gsap.to(".ring", { y: -8, duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut" });
      });
    },
    { scope: root, dependencies: [screen], revertOnUpdate: true },
  );

  function reset() {
    setPhase("intro");
    setIssues([]);
    setNotes("");
    setResultId(null);
    setCopied(false);
  }

  return (
    <Sheet labelledBy="lab-title" className="lab-sheet" onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet-head lab-head">
            <span className="lab-head-icon" aria-hidden="true">
              <FlaskConical size={20} />
            </span>
            <h2 id="lab-title">Pointer Lab</h2>
            <button className="sheet-close" onClick={close} aria-label="Close">
              <X size={18} />
            </button>
          </header>

          <div className="lab-body" ref={root}>
            {screen === "intro" && (
              <>
                <Tile accent="var(--c-green)" className="lab-hero">
                  <div className="lab-art" aria-hidden="true">
                    <span className="art-wrap la-clover">
                      <Clover />
                    </span>
                    <span className="art-wrap la-asterisk">
                      <Asterisk />
                    </span>
                    <span className="art-wrap la-ring">
                      <Ring />
                    </span>
                  </div>
                  <span className="brace-tag">{"{ About 1 minute }"}</span>
                  <h3 className="art-title lab-title">
                    <span className="title-line">Tune the laser</span>
                    <span className="title-line">
                      <span className="sticker s-green">for your</span> <span className="sticker s-pink">phone</span>
                    </span>
                  </h3>
                  <p className="lab-intro">
                    About <strong>1 minute</strong> of guided moves records how your phone's motion sensors behave. The data
                    helps fix and tune the laser pointer for your phone.
                  </p>
                </Tile>

                <ol className="lab-how">
                  {HOW.map((h, i) => (
                    <li key={h.text} style={{ "--s": h.color } as CSSProperties}>
                      <span className="lab-how-n">{i + 1}</span>
                      {h.text}
                    </li>
                  ))}
                </ol>

                <Tile accent="var(--c-violet)" className="lab-card">
                  <fieldset className="lab-choice">
                    <legend>How do you hold the phone when pointing?</legend>
                    {HOLD_STYLES.map((s) => (
                      <label key={s} className={`chip${holdStyle === s ? " on" : ""}`}>
                        <input type="radio" name="hold" checked={holdStyle === s} onChange={() => setHoldStyle(s)} />
                        {s}
                      </label>
                    ))}
                  </fieldset>
                </Tile>

                {(insecure || !motionSupported()) && (
                  <p className="notice">
                    <ShieldAlert size={16} aria-hidden="true" />
                    {insecure ? "Open this page over HTTPS to read motion sensors." : "This browser has no motion sensors."}
                  </p>
                )}
                {error && <p className="error small">{error}</p>}
                <button className="btn-go lab-cta" onClick={start} disabled={insecure || !motionSupported()}>
                  Start recording
                  <span className="btn-go-icon">
                    <CircleDot size={18} aria-hidden="true" />
                  </span>
                </button>
              </>
            )}

            {screen === "rec" && (
              <Tile accent={color(stepIndex)} className="lab-rec" style={{ "--s": color(stepIndex) } as CSSProperties}>
                <div className="lab-progress" aria-hidden="true">
                  {STEPS.map((s, i) => (
                    <span
                      key={s.id}
                      className={i < stepIndex ? "done" : i === stepIndex ? "now" : ""}
                      style={{ "--s": color(i) } as CSSProperties}
                    />
                  ))}
                </div>
                <p className="lab-status">
                  <span className="brace-tag">{`{ Step ${stepIndex + 1} of ${STEPS.length} }`}</span>
                  <span className={`lab-rec-dot${phase === "rec" ? " on" : ""}`}>
                    {phase === "ready" ? "Get ready" : "Recording"}
                  </span>
                </p>
                <h3 key={`${step.id}-${phase}`} className={`sticker lab-step${phase === "rec" ? "" : " ready"}`}>
                  {step.title}
                </h3>
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
              </Tile>
            )}

            {screen === "notes" && (
              <>
                <Tile accent="var(--c-pink)" className="lab-card">
                  <span className="brace-tag">{"{ Almost done }"}</span>
                  <h3 className="lab-h">
                    How did the <span className="sticker s-pink">pointer</span> feel?
                  </h3>
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
                    <input
                      type="text"
                      value={phoneModel}
                      onChange={(e) => setPhoneModel(e.target.value)}
                      placeholder="e.g. Pixel 8, iPhone 13"
                    />
                  </label>
                </Tile>
                {error && (
                  <p className="error small" role="alert">
                    {error}. You can still download the data file and send it directly.
                  </p>
                )}
                <button className="btn-go lab-cta" onClick={upload} disabled={phase === "uploading"}>
                  {phase === "uploading" ? "Uploading…" : "Upload recording"}
                  <span className="btn-go-icon">
                    <Upload size={18} aria-hidden="true" />
                  </span>
                </button>
                <button className="pill-link lab-quiet" onClick={download}>
                  <Download size={16} aria-hidden="true" /> Download data file
                </button>
              </>
            )}

            {screen === "done" && resultId && (
              <>
                <Tile accent="var(--c-green)" className="lab-card lab-done">
                  <span className="lab-ok">
                    <Check size={32} aria-hidden="true" />
                  </span>
                  <h3 className="lab-h">
                    Recording <span className="sticker s-green">saved</span>
                  </h3>
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
                    The server may clear recordings when it restarts, so share the ID soon, or keep a copy.
                  </p>
                </Tile>
                <button className="pill-link lab-quiet" onClick={download}>
                  <Download size={16} aria-hidden="true" /> Download data file
                </button>
                <button className="pill-link lab-quiet" onClick={reset}>
                  <RotateCcw size={16} aria-hidden="true" /> Record another
                </button>
              </>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
