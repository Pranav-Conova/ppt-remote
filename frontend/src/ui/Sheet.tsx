import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FULL_MOTION, gsap } from "./gsap";

const FOCUSABLE = "button, input, textarea, [href], [tabindex]:not([tabindex='-1'])";

/**
 * Pop-up sheet over the home page. Esc, a click outside or `close()` from
 * the children closes it; focus stays inside while it is open and goes back
 * to the opener afterwards. `stagger` names the items that pop in one by one.
 */
export function Sheet({
  labelledBy,
  className = "",
  stagger,
  onClose,
  children,
}: {
  labelledBy: string;
  className?: string;
  stagger?: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (!window.matchMedia(FULL_MOTION).matches) return onClose();
    gsap.to(backdrop.current, { opacity: 0, duration: 0.25 });
    gsap.to(panel.current, { y: 24, scale: 0.96, opacity: 0, filter: "blur(8px)", duration: 0.25, ease: "power2.in", onComplete: onClose });
  };

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    if (window.matchMedia(FULL_MOTION).matches) {
      gsap.from(backdrop.current, { opacity: 0, duration: 0.3 });
      gsap.from(panel.current, { y: 30, scale: 0.94, opacity: 0, filter: "blur(10px)", duration: 0.55, ease: "expo.out", clearProps: "filter" });
      if (stagger && panel.current) {
        gsap.from(panel.current.querySelectorAll(stagger), { y: 18, opacity: 0, duration: 0.5, ease: "back.out(1.6)", stagger: 0.05, delay: 0.1 });
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  // Rendered at the top of the document so no tile can end up above it.
  return createPortal(
    <div className="sheet-backdrop" ref={backdrop} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`sheet ${className}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}
