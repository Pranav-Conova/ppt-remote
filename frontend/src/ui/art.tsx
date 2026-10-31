// Playful gradient shapes in the spirit of gsap.com: a clover, a ring, an
// asterisk, a squiggle and a shape that keeps morphing. Pure SVG, so they
// stay crisp at any size and GSAP can draw and morph their paths.
import { useId } from "react";
import { gsap } from "./gsap";

type ShapeProps = { className?: string };

function Grad({ id, from, to, angle = 135 }: { id: string; from: string; to: string; angle?: number }) {
  return (
    <linearGradient id={id} gradientTransform={`rotate(${angle - 90} .5 .5)`}>
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
}

export function Clover({ className = "" }: ShapeProps) {
  const id = useId();
  return (
    <svg className={`art clover ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Grad id={id} from="#fff0fd" to="#f472d0" angle={160} />
      </defs>
      <g fill={`url(#${id})`}>
        <circle cx="29" cy="29" r="25" />
        <circle cx="71" cy="29" r="25" />
        <circle cx="29" cy="71" r="25" />
        <circle cx="71" cy="71" r="25" />
      </g>
    </svg>
  );
}

export function Ring({ className = "" }: ShapeProps) {
  const id = useId();
  return (
    <svg className={`art ring ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Grad id={id} from="#00bae2" to="#fec5fb" angle={200} />
      </defs>
      <circle cx="50" cy="50" r="36" fill="none" stroke={`url(#${id})`} strokeWidth="20" />
    </svg>
  );
}

export function Asterisk({ className = "" }: ShapeProps) {
  const id = useId();
  return (
    <svg className={`art asterisk ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        {/* User-space units: a bounding-box gradient cannot paint perfectly
            straight lines, because their box has zero width or height. */}
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="90" y2="90">
          <stop offset="0" stopColor="#ff8709" />
          <stop offset="1" stopColor="#ffd9c2" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${id})`} strokeWidth="13" strokeLinecap="round">
        {[0, 45, 90, 135].map((a) => (
          <line key={a} x1="50" y1="8" x2="50" y2="92" transform={`rotate(${a} 50 50)`} />
        ))}
      </g>
    </svg>
  );
}

export function Squiggle({ className = "" }: ShapeProps) {
  const id = useId();
  return (
    <svg className={`art squiggle ${className}`} viewBox="0 0 120 80" aria-hidden="true">
      <defs>
        <Grad id={id} from="#9d95ff" to="#f472d0" angle={90} />
      </defs>
      <path
        className="squiggle-path"
        d="M8 60 C 20 20, 34 20, 40 44 S 62 70, 70 40 S 92 8, 112 22"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="14"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Paths the morphing shape cycles through (all drawn in a 100×100 box).
export const MORPH_SHAPES = [
  // circle
  "M50 6 C74 6 94 26 94 50 C94 74 74 94 50 94 C26 94 6 74 6 50 C6 26 26 6 50 6 Z",
  // four-point star
  "M50 4 C56 34 66 44 96 50 C66 56 56 66 50 96 C44 66 34 56 4 50 C34 44 44 34 50 4 Z",
  // rounded square
  "M24 8 L76 8 C86 8 92 14 92 24 L92 76 C92 86 86 92 76 92 L24 92 C14 92 8 86 8 76 L8 24 C8 14 14 8 24 8 Z",
  // diamond
  "M50 4 L96 50 L50 96 L4 50 Z",
  // blob
  "M52 8 C78 6 96 30 90 54 C86 78 66 94 44 90 C20 86 4 66 10 42 C14 22 30 10 52 8 Z",
];

export function Morpher({ className = "" }: ShapeProps) {
  const id = useId();
  return (
    <svg className={`art morpher ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Grad id={id} from="#e5e2ff" to="#9d95ff" angle={150} />
      </defs>
      <path className="morph-path" d={MORPH_SHAPES[0]} fill={`url(#${id})`} />
    </svg>
  );
}

const CONFETTI_COLORS = ["#0ae448", "#abff84", "#fec5fb", "#f472d0", "#ff8709", "#9d95ff", "#00bae2", "#fffce1"];

/**
 * Bursts little shapes out of an element (Physics2D: velocity + gravity).
 * Used when a file is dropped and when the phone connects.
 */
export function confetti(from: Element | null, count = 26) {
  if (!from || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
  const r = from.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    const kind = i % 3;
    bit.className = `confetti confetti-${kind}`;
    bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    bit.style.left = `${r.left + r.width / 2}px`;
    bit.style.top = `${r.top + r.height / 2}px`;
    layer.appendChild(bit);
    gsap.to(bit, {
      duration: gsap.utils.random(1.2, 2),
      physics2D: { velocity: gsap.utils.random(260, 620), angle: gsap.utils.random(200, 340), gravity: 900 },
      rotation: gsap.utils.random(-540, 540),
      opacity: 0,
      ease: "none",
    });
  }
  setTimeout(() => layer.remove(), 2200);
}
