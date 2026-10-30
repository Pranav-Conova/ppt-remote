import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  Hand,
  Keyboard,
  LoaderCircle,
  MousePointer2,
  PenLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Type,
  Undo2,
  Upload,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { convertPptx, setDeck, type LoadedDeck } from "../lib/deckStore";
import {
  GESTURE_LABELS,
  duplicateGestures,
  loadSettings,
  saveSettings,
  type Corner,
  type GestureName,
  type PresenterSettings,
} from "../lib/settings";
import { Aurora } from "../ui/Aurora";
import { GitHubIcon } from "../ui/GitHubIcon";
import { PairCard } from "../ui/PairCard";
import { SpotlightCard } from "../ui/SpotlightCard";
import { Switch } from "../ui/Switch";
import { FULL_MOTION, gsap, SplitText, useGSAP } from "../ui/gsap";

const REPO_URL = "https://github.com/Pranav-Conova/Signify";

const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
// Relative finger lengths for the hand-shaped pattern editor.
const FINGER_HEIGHT = [0.62, 0.88, 1, 0.9, 0.7];

const GESTURE_ICONS: Record<GestureName, LucideIcon> = {
  next: ChevronRight,
  previous: ChevronLeft,
  point: MousePointer2,
  draw: PenLine,
  undo: Undo2,
  toggle_text: Type,
};

const CORNERS: [Corner, string][] = [
  ["tl", "Top left"],
  ["tr", "Top right"],
  ["bl", "Bottom left"],
  ["br", "Bottom right"],
];

const FEATURES: { icon: LucideIcon; title: string; body: string; className?: string }[] = [
  {
    icon: Hand,
    title: "Hand gestures",
    body: "Show a finger pattern to your webcam to change slides, point, draw or undo. Tracking runs on your GPU, in the browser.",
    className: "span-2",
  },
  {
    icon: Smartphone,
    title: "Phone laser pointer",
    body: "Scan a QR code. Hold Pointer and aim. There's no app to install.",
  },
  {
    icon: Zap,
    title: "~5 ms on Wi-Fi",
    body: "Phone and laptop talk directly over WebRTC, and the server relays only when they can't.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "PDFs never leave your device. Camera video is processed locally and never uploaded.",
  },
  {
    icon: PenLine,
    title: "Draw on slides",
    body: "Annotate with your hand or your phone. Ink is kept per slide.",
  },
];

const KEYS: [string[], string][] = [
  [["→", "Space"], "Next slide"],
  [["←"], "Previous slide"],
  [["B"], "Blank screen"],
  [["Z"], "Undo ink"],
  [["C"], "Clear slide"],
  [["T"], "Show text"],
  [["F"], "Fullscreen"],
  [["P"], "Show pairing QR (asks first)"],
];

export default function Home() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [deck, setLocalDeck] = useState<LoadedDeck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);

  useEffect(() => saveSettings(settings), [settings]);

  const dupes = duplicateGestures(settings.gestures);

  // ---- motion ----------------------------------------------------------------
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        // Split by lines, not words: splitting the gradient span into word
        // boxes breaks its background-clip:text and the words vanish.
        SplitText.create(".hero-title", {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.lines, { yPercent: 110, duration: 1, ease: "expo.out", stagger: 0.12, delay: 0.1 }),
        });
        gsap.from(".hero-fade", { y: 18, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.1, delay: 0.35 });
        gsap.from(".start-card", { y: 28, scale: 0.97, opacity: 0, duration: 1, ease: "expo.out", delay: 0.25 });

        gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
          gsap.from(el, {
            y: 28,
            opacity: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          });
        });
        gsap.utils.toArray<HTMLElement>(".stagger").forEach((group) => {
          gsap.from(group.children, {
            y: 24,
            opacity: 0,
            scale: 0.98,
            duration: 0.6,
            ease: "back.out(1.4)",
            stagger: { each: 0.07, grid: "auto" },
            scrollTrigger: { trigger: group, start: "top 82%", once: true },
          });
        });
      });
    },
    { scope: root },
  );

  // ---- deck -------------------------------------------------------------------
  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    const ext = file.name.toLowerCase().split(".").pop();
    try {
      if (ext === "pdf") {
        setLocalDeck({ name: file.name, pdf: await file.arrayBuffer() });
      } else if (ext === "ppt" || ext === "pptx" || ext === "odp") {
        setBusy("Converting your slides…");
        setLocalDeck({ name: file.name, pdf: await convertPptx(file) });
      } else {
        setError("Choose a PDF or PowerPoint file.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function start() {
    if (!deck) return;
    setDeck(deck);
    // Must run inside the click handler to be allowed.
    document.documentElement.requestFullscreen?.().catch(() => {});
    navigate("/present");
  }

  function toggleFinger(name: GestureName, i: number) {
    setSettings((s) => {
      const pattern = [...s.gestures[name]];
      pattern[i] = pattern[i] ? 0 : 1;
      return { ...s, gestures: { ...s.gestures, [name]: pattern } };
    });
  }

  const setCamera = (patch: Partial<PresenterSettings["camera"]>) =>
    setSettings((s) => ({ ...s, camera: { ...s.camera, ...patch } }));

  return (
    <div className="home" ref={root}>
      <nav className="topnav">
        <a href="#top" className="topnav-brand" aria-label="Signify home">
          <img src="/logo.png" alt="Signify" width={512} height={288} />
        </a>
        <div className="topnav-links">
          <a href="#features">Features</a>
          <a href="#gestures">Gestures</a>
          <a href="#remote">Phone remote</a>
        </div>
        <a className="icon-link" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Signify on GitHub">
          <GitHubIcon />
        </a>
      </nav>

      {/* ---- hero ---- */}
      <header className="hero" id="top">
        <Aurora />
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="pill hero-fade">
              <Sparkles size={14} aria-hidden="true" /> Signify 2.0 · now with a phone laser pointer
            </span>
            <h1 className="hero-title">
              Present with a <span className="grad-text">wave of your hand</span>
            </h1>
            <p className="lead hero-fade">
              Control your slides with hand gestures, or turn your phone into a clicker and laser pointer. It runs in
              your browser, with no app or clicker to buy.
            </p>
            <dl className="hero-stats hero-fade">
              <div>
                <dt>~5 ms</dt>
                <dd>phone → screen</dd>
              </div>
              <div>
                <dt>0</dt>
                <dd>PDF uploads</dd>
              </div>
              <div>
                <dt>6</dt>
                <dd>custom gestures</dd>
              </div>
            </dl>
          </div>

          <section className="start-card beam" aria-labelledby="start-title">
            <h2 id="start-title">Start presenting</h2>
            <div
              className={`dropzone${dragging ? " over" : ""}${deck ? " has-file" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void pick(e.dataTransfer.files[0]);
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.ppt,.pptx,.odp,application/pdf"
                hidden
                onChange={(e) => void pick(e.target.files?.[0])}
              />
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={28} aria-hidden="true" />
                  <p>{busy}</p>
                </>
              ) : deck ? (
                <div className="file-chip">
                  <FileText size={22} aria-hidden="true" />
                  <span className="file-name">{deck.name}</span>
                  <button
                    type="button"
                    className="chip-x"
                    aria-label="Remove file"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocalDeck(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="drop-icon">
                    <Upload size={22} aria-hidden="true" />
                  </span>
                  <p>
                    <strong>Drop your slides here</strong> or click to browse
                  </p>
                  <p className="muted small">PDF, PPT or PPTX</p>
                </>
              )}
            </div>
            {error && (
              <p className="error small" role="alert">
                {error}
              </p>
            )}

            <Switch checked={settings.handGestures} onChange={(v) => setSettings({ ...settings, handGestures: v })}>
              Hand gestures
            </Switch>

            <button className="btn btn-shimmer" disabled={!deck || !!busy || dupes.length > 0} onClick={start}>
              Start presenting <ArrowRight size={18} aria-hidden="true" />
            </button>
            {dupes.length > 0 ? (
              <p className="error small">Two gestures share the same fingers. Fix them below first.</p>
            ) : (
              <p className="muted small center">
                <ShieldCheck size={14} aria-hidden="true" /> PDFs stay on this device · PowerPoint is converted on the server
              </p>
            )}
          </section>
        </div>
      </header>

      <main>
        {/* ---- features ---- */}
        <section className="section" id="features">
          <div className="section-head reveal">
            <span className="eyebrow">Features</span>
            <h2>Everything you need, without a clicker</h2>
          </div>
          <div className="bento stagger">
            {FEATURES.map(({ icon: Icon, title, body, className }) => (
              <SpotlightCard key={title} className={`card feature ${className ?? ""}`}>
                <span className="feature-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </SpotlightCard>
            ))}
          </div>
        </section>

        {/* ---- gestures ---- */}
        <section className="section" id="gestures">
          <div className="section-head reveal">
            <span className="eyebrow">Gestures</span>
            <h2>Make the gestures yours</h2>
            <p className="muted">
              Tap a finger to raise or lower it. Raise your hand above the bottom quarter of the camera view, and point
              with your index finger.
            </p>
          </div>

          <div className="gesture-layout">
            <div className={`gesture-list stagger${settings.handGestures ? "" : " disabled"}`}>
              {(Object.keys(GESTURE_LABELS) as GestureName[]).map((name) => {
                const Icon = GESTURE_ICONS[name];
                const dupe = dupes.includes(name);
                return (
                  <div key={name} className={`card gesture-card${dupe ? " dupe" : ""}`}>
                    <div className="gesture-title">
                      <span className="feature-icon small">
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
                          style={{ "--h": FINGER_HEIGHT[i] } as React.CSSProperties}
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

            <aside className="card settings-card reveal">
              <h3>
                <Camera size={18} aria-hidden="true" /> Camera
              </h3>
              <Switch
                checked={settings.handGestures}
                onChange={(v) => setSettings({ ...settings, handGestures: v })}
                hint="Uses your webcam. Video never leaves the browser."
              >
                Control slides with gestures
              </Switch>
              <Switch
                checked={settings.camera.visible}
                onChange={(v) => setCamera({ visible: v })}
                hint="Picture-in-picture on top of your slides"
              >
                Show camera on slides
              </Switch>

              <div className={`corner-picker${settings.camera.visible ? "" : " disabled"}`}>
                <span className="field-label" id="corner-label">
                  Camera position
                </span>
                <div className="mini-screen" role="radiogroup" aria-labelledby="corner-label">
                  {CORNERS.map(([c, label]) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={settings.camera.corner === c}
                      aria-label={label}
                      className={`corner corner-${c}${settings.camera.corner === c ? " on" : ""}`}
                      onClick={() => setCamera({ corner: c })}
                    >
                      {settings.camera.corner === c && <Camera size={14} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>

              <label className="field">
                <span className="field-label">Text for the “Show text” gesture</span>
                <input
                  type="text"
                  value={settings.overlayText}
                  maxLength={40}
                  onChange={(e) => setSettings({ ...settings, overlayText: e.target.value })}
                />
              </label>
            </aside>
          </div>
        </section>

        {/* ---- phone remote ---- */}
        <section className="section" id="remote">
          <div className="remote-layout">
            <div>
              <div className="section-head left reveal">
                <span className="eyebrow">Phone remote</span>
                <h2>Your phone is the clicker</h2>
                <p className="muted">
                  On the same Wi-Fi, your phone talks straight to your laptop, so the laser dot keeps up with your hand.
                </p>
              </div>
              <ol className="steps stagger">
                <li>
                  <span className="step-num">1</span>
                  <div>
                    <strong>Scan the QR code here</strong>
                    <p className="muted">Before presenting, so the code never shows on the big screen.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <div>
                    <strong>Start presenting</strong>
                    <p className="muted">Your phone stays connected. Closing this tab disconnects it.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <div>
                    <strong>Hold Pointer and aim</strong>
                    <p className="muted">Tilt to move the dot. Drag down on Pointer to circle what matters.</p>
                  </div>
                </li>
              </ol>
              <p className="pill subtle reveal">
                <Wifi size={14} aria-hidden="true" /> On other networks it goes through the server automatically
              </p>
            </div>
            <div className="card demo-card reveal">
              <PairCard />
            </div>
          </div>
        </section>

        {/* ---- keyboard ---- */}
        <section className="section" id="keys">
          <div className="section-head reveal">
            <span className="eyebrow">
              <Keyboard size={14} aria-hidden="true" /> Keyboard
            </span>
            <h2>Prefer keys? They work too</h2>
          </div>
          <div className="keys-grid stagger">
            {KEYS.map(([keys, label]) => (
              <div key={label} className="key-card">
                <span className="key-caps">
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <img src="/logo.png" alt="Signify" width={512} height={288} />
        <p className="muted small">Gesture-controlled presentations. Runs in your browser.</p>
        <a className="icon-link" href={REPO_URL} target="_blank" rel="noreferrer">
          <GitHubIcon size={16} /> GitHub
        </a>
      </footer>
    </div>
  );
}
