import { type CSSProperties, type HTMLAttributes, type PointerEvent } from "react";
import { gsap } from "./gsap";

const canHover = typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Glass bento tile with its own accent colour. A soft spotlight follows the
 * cursor (CSS variables) and the tile tilts slightly towards it (GSAP).
 */
export function Tile({
  accent,
  className = "",
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { accent: string }) {
  const tilt = canHover && !reduced;

  const move = (e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    if (tilt) gsap.to(el, { rotateY: (px - 0.5) * 5, rotateX: (0.5 - py) * 5, duration: 0.5, ease: "power3.out" });
  };
  const leave = (e: PointerEvent<HTMLElement>) => {
    if (tilt) gsap.to(e.currentTarget, { rotateX: 0, rotateY: 0, duration: 0.8, ease: "elastic.out(1, 0.5)" });
  };

  return (
    <section
      className={`tile ${className}`}
      style={{ "--accent": accent, ...style } as CSSProperties}
      onPointerMove={move}
      onPointerLeave={leave}
      {...rest}
    >
      {children}
    </section>
  );
}
