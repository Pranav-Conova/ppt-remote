import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileText,
  FlaskConical,
  Hand,
  LoaderCircle,
  MonitorOff,
  QrCode,
  SlidersHorizontal,
  Smartphone,
  Undo2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { convertPptx, setDeck, type LoadedDeck } from "../lib/deckStore";
import { duplicateGestures, loadSettings, saveSettings, type Corner, type PresenterSettings } from "../lib/settings";
import { usePresenterSession } from "../link/presenterSession";
import { AboutSheet, SocialLinks } from "../ui/AboutSheet";
import { Asterisk, Clover, InkShape, MORPH_SHAPES, Morpher, Ring, Squiggle, confetti } from "../ui/art";
import { GitHubIcon } from "../ui/GitHubIcon";
import { GestureSheet } from "../ui/GestureSheet";
import { PairCard } from "../ui/PairCard";
import { RemoteDemo } from "../ui/RemoteDemo";
import { Switch } from "../ui/Switch";
import { Tile } from "../ui/Tile";
import { FULL_MOTION, fullMotion, gsap, useGSAP } from "../ui/gsap";
import { ME } from "../ui/me";
import "./home.css";

const REPO_URL = "https://github.com/Pranav-Conova/Signify";

const CORNERS: [Corner, string][] = [
  ["tl", "Top left"],
  ["tr", "Top right"],
  ["bl", "Bottom left"],
  ["br", "Bottom right"],
];

/** The buttons on the phone remote, as shown on the Buttons tile. */
const REMOTE_BUTTONS = [
  { icon: ChevronLeft, label: "Prev" },
  { icon: ChevronRight, label: "Next" },
  { icon: Undo2, label: "Undo" },
  { icon: Eraser, label: "Clear" },
  { icon: MonitorOff, label: "Blank" },
];

const MARQUEE = [
  "Your phone is the remote",
  "Tilt to point",
  "Drag down to draw",
  "Pair before you present",
  "~5 ms on Wi-Fi",
  "Hand gestures too",
  "Your file never leaves this device",
  `Made by ${ME.name}, creative developer`,
];

/** A heartbeat for the latency tile, drawn twice so it can scroll forever. */
const PULSE = "M0 24 H40 L48 24 L54 8 L62 36 L68 20 L74 24 H120 L126 24 L131 14 L137 30 L142 24 H200";

/** Colour of the dropzone pulse per file type. */
const FILE_COLORS: Record<string, string> = {
  pdf: "var(--c-pink)",
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
  const [about, setAbout] = useState(false);
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);

  useEffect(() => saveSettings(settings), [settings]);

  const dupes = duplicateGestures(settings.gestures);

  // Confetti from the QR code when the phone connects.
  const paired = usePresenterSession().status?.peer ?? false;
  const wasPaired = useRef(paired);
  useEffect(() => {
    if (paired && !wasPaired.current) confetti(root.current?.querySelector(".t-pair .pair-visual") ?? null, 34);
    wasPaired.current = paired;
  }, [paired]);

  // ---- motion ----------------------------------------------------------------
  useGSAP(
    (_, contextSafe) => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        // Entrance: tiles wipe up, stickers slap on, shapes spring in.
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .from(".tile", {
            clipPath: "inset(100% 0% 0% 0% round 22px)",
            y: 40,
            duration: 1.1,
            stagger: 0.06,
            clearProps: "clipPath,transform",
          })
          .from(".bh-top > *, .marquee", { y: -20, opacity: 0, duration: 0.8, stagger: 0.06 }, 0)
          .from(
            ".sticker",
            { scale: 0, rotation: () => gsap.utils.random(-30, 30), duration: 0.9, ease: "back.out(2.4)", stagger: 0.09 },
            0.35,
          )
          .from(".art-wrap", { scale: 0, rotation: -120, duration: 1.4, ease: "elastic.out(1, 0.5)", stagger: 0.1 }, 0.45)
          .to(
            ".brace-text",
            { duration: 1.2, scrambleText: { text: "{ Signify 2.0 }", chars: "01!<>-_/[]{}=+*^?#", speed: 0.6 } },
            0.3,
          );

        // Always moving.
        gsap.to(".clover", { rotation: 360, duration: 16, repeat: -1, ease: "none" });
        gsap.to(".asterisk", { rotation: -360, duration: 9, repeat: -1, ease: "none" });
        gsap.to(".ring", { y: -12, scale: 1.06, duration: 2.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
        gsap
          .timeline({ repeat: -1, repeatDelay: 0.6 })
          .fromTo(".squiggle-path", { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 1.4, ease: "power2.inOut" })
          .to(".squiggle-path", { drawSVG: "100% 100%", duration: 1.2, ease: "power2.inOut" }, "+=2.4");
        const morph = gsap.timeline({ repeat: -1 });
        [...MORPH_SHAPES.slice(1), MORPH_SHAPES[0]].forEach((shape) =>
          morph.to(".morph-path", { morphSVG: shape, duration: 1.2, ease: "elastic.out(1, 0.55)" }, "+=1"),
        );
        gsap.to(".morpher", { rotation: 360, duration: 24, repeat: -1, ease: "none" });
        gsap.to(".marquee-track", { xPercent: -50, duration: 30, repeat: -1, ease: "none" });

        // The hero shapes drift away from the cursor at different depths.
        const hero = root.current?.querySelector<HTMLElement>(".t-start");
        const movers = gsap.utils.toArray<HTMLElement>(".t-start .art-wrap").map((el, i) => ({
          x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3.out" }),
          y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3.out" }),
          depth: 12 + i * 9,
        }));
        const onMove = contextSafe!((e: PointerEvent) => {
          const r = hero!.getBoundingClientRect();
          const dx = (e.clientX - r.left) / r.width - 0.5;
          const dy = (e.clientY - r.top) / r.height - 0.5;
          movers.forEach((m) => {
            m.x(-dx * m.depth * 2);
            m.y(-dy * m.depth * 2);
          });
        });
        hero?.addEventListener("pointermove", onMove);
        return () => hero?.removeEventListener("pointermove", onMove);
      });
    },
    { scope: root },
  );

  /** Stickers wiggle when you hover them. */
  const wiggle = (e: React.PointerEvent<HTMLElement>) => {
    if (!fullMotion() || gsap.isTweening(e.currentTarget)) return;
    gsap.fromTo(
      e.currentTarget,
      { rotation: 0 },
      { keyframes: { rotation: [-7, 6, -4, 2, 0] }, duration: 0.6, ease: "power1.inOut" },
    );
  };

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
      celebrate(FILE_COLORS[ext]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** A loaded file: the dropzone takes the file type's colour and throws confetti. */
  function celebrate(color: string) {
    const el = dropRef.current;
    if (!el) return;
    el.style.setProperty("--pulse", color);
    if (!fullMotion()) return;
    gsap.fromTo(el, { scale: 0.96 }, { scale: 1, duration: 0.8, ease: "elastic.out(1, 0.45)" });
    confetti(el);
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
    if (!btn || btn.disabled || !fullMotion()) return;
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
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <span key={copy} className="marquee-group">
              {MARQUEE.map((m) => (
                <span key={m}>
                  {m} <i>✦</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <header className="bh-top">
        <span className="wordmark">
          Signify<span className="wordmark-dot" aria-hidden="true" />
        </span>
        <nav className="bh-nav">
          <button className="pill-link hire" onClick={() => setAbout(true)}>
            <span className="avail-dot" aria-hidden="true" /> Hire me
          </button>
          {/* In-app navigation: a full page load would end the phone session. */}
          <RouterLink className="pill-link nav-lab" to="/lab">
            <FlaskConical size={15} aria-hidden="true" /> Pointer Lab
          </RouterLink>
          <a className="pill-link" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Signify on GitHub">
            <GitHubIcon />
          </a>
        </nav>
      </header>

      <main className="bh-grid">
        {/* ---- start ---- */}
        <Tile accent="var(--c-green)" className="t-start" aria-labelledby="start-title">
          <div className="hero-art" aria-hidden="true">
            <span className="art-wrap w-clover">
              <Clover />
            </span>
            <span className="art-wrap w-ring">
              <Ring />
            </span>
            <span className="art-wrap w-asterisk">
              <Asterisk />
            </span>
            <span className="art-wrap w-squiggle">
              <Squiggle />
            </span>
          </div>

          <div className="t-start-copy">
            <span className="brace-tag">
              <span className="brace-text">{"{ Signify 2.0 }"}</span>
            </span>
            <h1 className="art-title" id="start-title">
              <span className="title-line">Present with</span>
              <span className="title-line">
                <span className="sticker s-green" onPointerEnter={wiggle}>
                  your phone
                </span>{" "}
                <span className="sticker s-pink" onPointerEnter={wiggle}>
                  as a laser
                </span>
              </span>
            </h1>
            <p className="lead">
              Scan the code and your phone becomes the clicker: tilt to point, drag down to draw. Nothing to install.
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
                <LoaderCircle className="spin" size={24} aria-hidden="true" />
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
                  <Upload size={18} aria-hidden="true" />
                </span>
                <p>
                  <strong>Drop your slides</strong> or click to browse
                  <span className="muted"> · PDF, PPT, PPTX</span>
                </p>
              </>
            )}
          </div>
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}

          <div className="t-start-row">
            <span className={`phone-chip${paired ? " on" : ""}`} role="status">
              {paired ? <Check size={15} aria-hidden="true" /> : <QrCode size={15} aria-hidden="true" />}
              {paired ? "Phone connected" : "Scan the code to pair your phone"}
            </span>
            <div className="magnet" onPointerMove={magnet} onPointerLeave={unmagnet}>
              <button
                ref={startRef}
                className="btn-go start-btn"
                disabled={!deck || !!busy || dupes.length > 0}
                onClick={start}
              >
                Start presenting
                <span className="btn-go-icon">
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
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
          <TileHead icon={QrCode} title="Pair your phone" />
          <PairCard size={150} />
          <p className="small center pair-note">
            Pair here, <strong>before</strong> presenting, so the code never shows on the big screen.
          </p>
        </Tile>

        {/* ---- phone remote demo ---- */}
        <Tile accent="var(--c-blue)" className="t-block t-demo">
          <TileHead icon={Smartphone} title="Phone remote" />
          <RemoteDemo />
        </Tile>

        {/* ---- hand gestures (the alternative) ---- */}
        <Tile accent="var(--c-violet)" className="t-gest">
          <span className="art-wrap w-morph" aria-hidden="true">
            <Morpher />
          </span>
          <TileHead icon={Hand} title="Hand gestures" />
          <Switch checked={settings.handGestures} onChange={(v) => setSettings((s) => ({ ...s, handGestures: v }))}>
            Use webcam
          </Switch>
          <button className="tile-btn" onClick={() => setSheet(true)}>
            <SlidersHorizontal size={15} aria-hidden="true" /> Customize
          </button>
        </Tile>

        {/* ---- camera ---- */}
        <Tile accent="var(--c-blue)" className="t-cam">
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

        {/* ---- colour blocks ---- */}
        <Tile accent="var(--c-orange)" className="t-mini t-block t-lat">
          <InkShape kind="asterisk" className="deco" />
          <TileHead icon={Zap} title="Latency" />
          <div className="lat-row">
            <strong className="lat-num">5 ms</strong>
            <svg className="pulse-line" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
              <g className="pulse-track">
                <path d={PULSE} />
                <path d={PULSE} transform="translate(200 0)" />
              </g>
            </svg>
          </div>
          <p className="small">phone → screen, direct over Wi-Fi</p>
        </Tile>

        <Tile accent="var(--c-pink)" className="t-mini t-block t-me">
          <InkShape kind="clover" className="deco" />
          <div className="me-top">
            <span className="me-avatar" aria-hidden="true">
              {ME.initials}
            </span>
            <span className="me-name">
              <strong>{ME.name}</strong>
              <span>{ME.role}</span>
            </span>
          </div>
          <p className="mini-big">Want a site like this?</p>
          <p className="small">Creative websites, web apps and AI features. Open for freelance work.</p>
          <div className="me-row">
            <SocialLinks size={15} />
            <button className="me-cta" onClick={() => setAbout(true)}>
              Let's talk <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </Tile>

        <Tile accent="var(--c-violet)" className="t-mini t-block t-keys">
          <InkShape kind="ring" className="deco" />
          <TileHead icon={Smartphone} title="Buttons" />
          <div className="keys">
            {REMOTE_BUTTONS.map(({ icon: Icon, label }, i) => (
              <span key={label} className="key" style={{ animationDelay: `${i * 0.6}s` }}>
                <kbd>
                  <Icon size={13} aria-hidden="true" />
                </kbd>
                <span>{label}</span>
              </span>
            ))}
          </div>
        </Tile>
      </main>

      {sheet && (
        <GestureSheet settings={settings} setSettings={setSettings} dupes={dupes} onClose={() => setSheet(false)} />
      )}
      {about && <AboutSheet onClose={() => setAbout(false)} />}
    </div>
  );
}

function TileHead({ icon: Icon, title }: { icon: typeof Hand; title: string }) {
  return (
    <h2 className="tile-head">
      <span className="tile-icon">
        <Icon size={15} aria-hidden="true" />
      </span>
      {title}
    </h2>
  );
}
