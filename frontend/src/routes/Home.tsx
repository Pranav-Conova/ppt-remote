import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
const CORNERS: [Corner, string][] = [
  ["tl", "Top left"],
  ["tr", "Top right"],
  ["bl", "Bottom left"],
  ["br", "Bottom right"],
];

export default function Home() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [deck, setLocalDeck] = useState<LoadedDeck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);

  useEffect(() => saveSettings(settings), [settings]);

  const dupes = duplicateGestures(settings.gestures);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    const ext = file.name.toLowerCase().split(".").pop();
    try {
      if (ext === "pdf") {
        setLocalDeck({ name: file.name, pdf: await file.arrayBuffer() });
      } else if (ext === "ppt" || ext === "pptx" || ext === "odp") {
        setBusy("Converting slides…");
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

  return (
    <div className="home">
      <header className="hero">
        <h1>
          <img src="/logo.png" alt="Signify" className="logo" width={512} height={288} />
        </h1>
        <p className="tagline">Run your slides with hand gestures, or turn your phone into a clicker and laser pointer.</p>
      </header>

      <main>
        <section className="card">
          <h2>1 · Your presentation</h2>
          <div
            className={`dropzone${dragging ? " over" : ""}`}
            onClick={() => fileInput.current?.click()}
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
              <p>{busy}</p>
            ) : deck ? (
              <p>
                <strong>{deck.name}</strong>
                <br />
                <span className="muted">Click to choose a different file</span>
              </p>
            ) : (
              <p>
                Drop a <strong>PDF</strong> or <strong>PowerPoint</strong> file here, or click to choose one.
                <br />
                <span className="muted">PDFs stay on your computer. PowerPoint files are converted on the server.</span>
              </p>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={!deck || !!busy || dupes.length > 0} onClick={start}>
            Start presenting
          </button>
        </section>

        <section className="card">
          <h2>2 · Hand gestures</h2>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.handGestures}
              onChange={(e) => setSettings({ ...settings, handGestures: e.target.checked })}
            />
            Control slides with hand gestures (uses your webcam; video stays in the browser)
          </label>

          <div className={`gesture-grid${settings.handGestures ? "" : " disabled"}`}>
            <span />
            {FINGERS.map((f) => (
              <span key={f} className="finger-head">
                {f}
              </span>
            ))}
            {(Object.keys(GESTURE_LABELS) as GestureName[]).map((name) => (
              <div key={name} className={`gesture-row${dupes.includes(name) ? " dupe" : ""}`}>
                <span className="gesture-name">{GESTURE_LABELS[name]}</span>
                {settings.gestures[name].map((up, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`finger${up ? " up" : ""}`}
                    aria-pressed={!!up}
                    aria-label={`${GESTURE_LABELS[name]}: ${FINGERS[i]} ${up ? "up" : "down"}`}
                    onClick={() => toggleFinger(name, i)}
                  >
                    {up ? "▲" : "·"}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {dupes.length > 0 && (
            <p className="error">Two gestures use the same fingers: {dupes.map((d) => GESTURE_LABELS[d]).join(", ")}.</p>
          )}
          <p className="muted small">
            Raise your hand above the bottom quarter of the camera view to use gestures. Point with your index
            finger.
          </p>

          <div className="row">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.camera.visible}
                onChange={(e) => setSettings({ ...settings, camera: { ...settings.camera, visible: e.target.checked } })}
              />
              Show camera on slides
            </label>
            <div className="corners" role="radiogroup" aria-label="Camera position">
              {CORNERS.map(([c, label]) => (
                <label key={c} className="radio">
                  <input
                    type="radio"
                    name="corner"
                    checked={settings.camera.corner === c}
                    onChange={() => setSettings({ ...settings, camera: { ...settings.camera, corner: c } })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="field">
            Text shown by the “Show text” gesture
            <input
              type="text"
              value={settings.overlayText}
              maxLength={40}
              onChange={(e) => setSettings({ ...settings, overlayText: e.target.value })}
            />
          </label>
        </section>

        <section className="card">
          <h2>3 · Phone remote</h2>
          <ol className="steps">
            <li>Start presenting, then press the phone button (or the P key).</li>
            <li>Scan the QR code with your phone's camera.</li>
            <li>Use Next and Previous, or hold Pointer and aim your phone at the screen.</li>
          </ol>
          <p className="muted small">
            On the same Wi-Fi, your phone talks to your laptop directly, which keeps pointer lag low. On other
            networks it goes through the server.
          </p>
        </section>

        <section className="card">
          <h2>Keyboard</h2>
          <p className="keys">
            <kbd>→</kbd> next · <kbd>←</kbd> previous · <kbd>B</kbd> blank · <kbd>Z</kbd> undo · <kbd>C</kbd> clear ·{" "}
            <kbd>T</kbd> text · <kbd>F</kbd> fullscreen · <kbd>P</kbd> phone
          </p>
        </section>
      </main>

      <footer>Signify · gesture-controlled presentations</footer>
    </div>
  );
}
