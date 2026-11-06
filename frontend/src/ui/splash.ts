// The loading screen lives in index.html so it paints before any JS loads.
// The app calls hideSplash() once its first route has rendered.

/** Keep the splash up at least this long so a fast load doesn't just flash it. */
const MIN_VISIBLE_MS = 700;
const FADE_MS = 400;

let resolveGone: () => void = () => {};
/** Resolves when the splash starts fading out (right away if there is none). */
export const splashGone = new Promise<void>((resolve) => {
  resolveGone = resolve;
});

let hiding = false;

export function hideSplash(): void {
  if (hiding) return;
  hiding = true;
  const el = typeof document !== "undefined" ? document.getElementById("splash") : null;
  if (!el) {
    resolveGone();
    return;
  }
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    el.classList.add("is-done");
    resolveGone();
    const remove = () => el.remove();
    el.addEventListener("transitionend", remove, { once: true });
    window.setTimeout(remove, FADE_MS + 200);
  }, wait);
}
