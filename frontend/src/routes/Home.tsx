import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  FileText,
  FlaskConical,
  Hand,
  Keyboard,
  LoaderCircle,
  MousePointer2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Upload,
  X,
  Zap,
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
import { ColorField } from "../ui/ColorField";
import { GitHubIcon } from "../ui/GitHubIcon";
import { FINGER_HEIGHT, GESTURE_COLORS, GESTURE_ICONS, GestureSheet } from "../ui/GestureSheet";
import { PairCard } from "../ui/PairCard";
import { Switch } from "../ui/Switch";
import { Tile } from "../ui/Tile";
import { FULL_MOTION, gsap, SplitText, useGSAP } from "../ui/gsap";
import "./home.css";

const REPO_URL = "https://github.com/Pranav-Conova/Signify";

const CORNERS: [Corner, string][] = [
  ["tl", "Top left"],
  ["tr", "Top right"],
  ["bl", "Bottom left"],
  ["br", "Bottom right"],
];

const KEYS: [string, string][] = [
  ["→", "Next"],
  ["←", "Back"],
  ["B", "Blank"],
  ["Z", "Undo"],
  ["F", "Full"],
  ["P", "Pair"],
];

/** Colour of the dropzone pulse per file type. */
const FILE_COLORS: Record<string, string> = {
  pdf: "var(--c-red)",
  ppt: "var(--c-orange)",
  pptx: "var(--c-orange)",
  odp: "var(--c-blue)",
};

export default function Home() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const [deck, setLocalDeck] = useState<LoadedDeck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);

  useEffect(() => saveSettings(settings), [settings]);

  const dupes = duplicateGestures(settings.gestures);

  // ---- motion ----------------------------------------------------------------
  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        // Tiles fly in out of a blur, one after another.
        gsap.from(".tile", {
          y: 36,
          scale: 0.95,
          opacity: 0,
          filter: "blur(14px)",
          duration: 1.1,
          ease: "expo.out",
          stagger: { each: 0.07, from: "start" },
          clearProps: "filter,transform,opacity",
        });
        gsap.from(".bh-top > *", { y: -16, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 });
        // Lines, not words: word boxes would break the gradient text.
        SplitText.create(".bh-title", {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.lines, { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.12, delay: 0.25 }),
        });
      });
    },
    { scope: root },
  );

  // ---- deck -------------------------------------------------------------------
  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    try {
      if (ext === "pdf") {
        setLocalDeck({ name: file.name, pdf: await file.arrayBuffer() });
      } else if (ext === "ppt" || ext === "pptx" || ext === "odp") {
        setBusy("Converting your slides…");
        setLocalDeck({ name: file.name, pdf: await convertPptx(file) });
      } else {
        setError("Choose a PDF or PowerPoint file.");
        return;
      }
      pulse(FILE_COLORS[ext]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** A loaded file makes the dropzone ring in the file type's colour. */
  function pulse(color: string) {
    const el = dropRef.current;
    if (!el) return;
    el.style.setProperty("--pulse", color);
    if (!window.matchMedia(FULL_MOTION).matches) return;
    gsap.fromTo(el, { scale: 0.97 }, { scale: 1, duration: 0.7, ease: "elastic.out(1, 0.45)" });
    gsap.fromTo(el, { "--ring": 0 }, { "--ring": 1, duration: 1, ease: "power2.out" });
  }

  function start() {
    if (!deck) return;
    setDeck(deck);
    // Must run inside the click handler to be allowed.
    document.documentElement.requestFullscreen?.().catch(() => {});
    navigate("/present");
  }

  // Magnetic start button: it leans towards the cursor.
  const magnet = (e: React.PointerEvent<HTMLDivElement>) => {
    const btn = startRef.current;
    if (!btn || btn.disabled || !window.matchMedia(FULL_MOTION).matches) return;
    const r = btn.getBoundingClientRect();
    gsap.to(btn, {
      x: (e.clientX - (r.left + r.width / 2)) * 0.18,
      y: (e.clientY - (r.top + r.height / 2)) * 0.3,
      duration: 0.4,
      ease: "power3.out",
    });
  };
  const unmagnet = () => gsap.to(startRef.current, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.4)" });

  const setCamera = (patch: Partial<PresenterSettings["camera"]>) =>
    setSettings((s) => ({ ...s, camera: { ...s.camera, ...patch } }));

  return (
    <div className="bento-home" ref={root}>
      <ColorField />

      <header className="bh-top">
        <span className="bh-word">
          Signify<span className="bh-dot" aria-hidden="true" />
        </span>
        <nav className="bh-nav">
          {/* In-app navigation: a full page load would end the phone session. */}
          <RouterLink className="icon-link" to="/lab">
            <FlaskConical size={16} aria-hidden="true" /> Pointer Lab
          </RouterLink>
          <a className="icon-link" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Signify on GitHub">
            <GitHubIcon />
          </a>
        </nav>
      </header>

      <main className="bh-grid">
        {/* ---- start ---- */}
        <Tile accent="var(--c-orange)" className="t-start beam" aria-labelledby="start-title">
          <div className="t-start-copy">
            <h1 className="bh-title" id="start-title">
              Present with a <span className="spectrum-text">wave of your hand</span>
            </h1>
            <p className="muted">
              Hand gestures or your phone as a clicker and laser pointer. Runs in your browser — nothing to install.
            </p>
          </div>

          <div
            ref={dropRef}
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
                <LoaderCircle className="spin" size={26} aria-hidden="true" />
                <p>{busy}</p>
              </>
            ) : deck ? (
              <div className="file-chip">
                <FileText size={20} aria-hidden="true" />
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
                  <Upload size={20} aria-hidden="true" />
                </span>
                <p>
                  <strong>Drop your slides</strong> or click to browse
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

          <div className="t-start-row">
            <Switch checked={settings.handGestures} onChange={(v) => setSettings((s) => ({ ...s, handGestures: v }))}>
              Hand gestures
            </Switch>
            <div className="magnet" onPointerMove={magnet} onPointerLeave={unmagnet}>
              <button
                ref={startRef}
                className="btn btn-spectrum start-btn"
                disabled={!deck || !!busy || dupes.length > 0}
                onClick={start}
              >
                Start presenting <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          {dupes.length > 0 && (
            <p className="error small">
              Two gestures share the same fingers.{" "}
              <button className="link-btn" onClick={() => setSheet(true)}>
                Fix them
              </button>
            </p>
          )}
        </Tile>

        {/* ---- phone pairing ---- */}
        <Tile accent="var(--c-green)" className="t-pair">
          <TileHead icon={Smartphone} title="Phone remote" />
          <PairCard size={150} />
          <p className="muted small center">
            Pair here, before presenting, so the code never shows on the big screen.
          </p>
        </Tile>

        {/* ---- gestures ---- */}
        <Tile accent="var(--c-violet)" className="t-gest">
          <TileHead icon={Hand} title="Gestures" />
          <GesturePreview gestures={settings.gestures} />
          <button className="tile-btn" onClick={() => setSheet(true)}>
            <SlidersHorizontal size={15} aria-hidden="true" /> Customize
          </button>
        </Tile>

        {/* ---- camera ---- */}
        <Tile accent="var(--c-cyan)" className="t-cam">
          <TileHead icon={Camera} title="Camera" />
          <div className="t-cam-body">
            <Switch checked={settings.camera.visible} onChange={(v) => setCamera({ visible: v })}>
              Show on slides
            </Switch>
            <div
              className={`mini-screen${settings.camera.visible ? "" : " disabled"}`}
              role="radiogroup"
              aria-label="Camera position"
            >
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
                  {settings.camera.corner === c && <Camera size={12} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        </Tile>

        {/* ---- small facts ---- */}
        <Tile accent="var(--c-yellow)" className="t-mini t-lat">
          <TileHead icon={Zap} title="Latency" />
          <div className="lat-row">
            <strong className="lat-num">~5 ms</strong>
            <span className="lat-bars" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} style={{ animationDelay: `${-i * 0.23}s` }} />
              ))}
            </span>
          </div>
          <p className="muted small">Phone → screen, direct over Wi-Fi</p>
        </Tile>

        <Tile accent="var(--c-blue)" className="t-mini t-priv">
          <TileHead icon={ShieldCheck} title="Private" />
          <p className="mini-big">Your file stays here</p>
          <p className="muted small">PDFs and camera video never leave this device</p>
        </Tile>

        <Tile accent="var(--c-pink)" className="t-mini t-keys">
          <TileHead icon={Keyboard} title="Keys" />
          <div className="keys">
            {KEYS.map(([k, label], i) => (
              <span key={k} className="key" style={{ animationDelay: `${i * 0.6}s` }}>
                <kbd>{k}</kbd>
                <span>{label}</span>
              </span>
            ))}
          </div>
        </Tile>

        <Tile accent="var(--c-red)" className="t-mini t-tip">
          <TileHead icon={MousePointer2} title="Pointer" />
          <div className="tip-row">
            <svg className="tip-slide" viewBox="0 0 96 54" aria-hidden="true">
              <rect x="1" y="1" width="94" height="52" rx="6" />
              <path className="tip-ink" d="M22 34 C 34 18, 52 44, 72 22" />
              <circle className="tip-dot" r="3.2" />
            </svg>
            <p className="small">
              <strong>Hold</strong> to point, <strong>drag down</strong> to draw
            </p>
          </div>
        </Tile>
      </main>

      {sheet && (
        <GestureSheet settings={settings} setSettings={setSettings} dupes={dupes} onClose={() => setSheet(false)} />
      )}
    </div>
  );
}

function TileHead({ icon: Icon, title }: { icon: typeof Hand; title: string }) {
  return (
    <h2 className="tile-head">
      <span className="tile-icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      {title}
    </h2>
  );
}

/** A small hand that cycles through the configured gestures. */
function GesturePreview({ gestures }: { gestures: PresenterSettings["gestures"] }) {
  const names = Object.keys(GESTURE_LABELS) as GestureName[];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!window.matchMedia(FULL_MOTION).matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % names.length), 1800);
    return () => clearInterval(t);
  }, [names.length]);
  const name = names[i];
  const Icon = GESTURE_ICONS[name];
  return (
    <div className="g-preview" style={{ "--accent": GESTURE_COLORS[name] } as CSSProperties} aria-live="off">
      <div className="hand mini" aria-hidden="true">
        {gestures[name].map((up, f) => (
          <span key={f} className={`finger${up ? " up" : ""}`} style={{ "--h": FINGER_HEIGHT[f] } as CSSProperties}>
            <span className="finger-bar" />
          </span>
        ))}
      </div>
      <span className="g-label" key={name}>
        <Icon size={14} aria-hidden="true" /> {GESTURE_LABELS[name]}
      </span>
    </div>
  );
}
