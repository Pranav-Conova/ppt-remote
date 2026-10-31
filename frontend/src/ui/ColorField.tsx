import { useRef } from "react";
import { FULL_MOTION, gsap, useGSAP } from "./gsap";

// Large, heavily blurred colour blobs drifting behind the home page's glass
// tiles. Only transforms are animated, so the browser blurs each blob once
// and then just moves the cached layer around (cheap, even at 60 fps).
const BLOBS = [
  { color: "var(--c-red)", x: 8, y: 12, size: 34 },
  { color: "var(--c-orange)", x: 38, y: 4, size: 30 },
  { color: "var(--c-yellow)", x: 72, y: 10, size: 28 },
  { color: "var(--c-green)", x: 86, y: 52, size: 32 },
  { color: "var(--c-cyan)", x: 60, y: 74, size: 30 },
  { color: "var(--c-blue)", x: 26, y: 78, size: 34 },
  { color: "var(--c-violet)", x: 4, y: 48, size: 30 },
  { color: "var(--c-pink)", x: 48, y: 40, size: 26 },
];

export function ColorField() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        gsap.utils.toArray<HTMLElement>(".cf-blob").forEach((el) => {
          const drift = () =>
            gsap.to(el, {
              xPercent: gsap.utils.random(-60, 60),
              yPercent: gsap.utils.random(-50, 50),
              scale: gsap.utils.random(0.8, 1.35),
              duration: gsap.utils.random(14, 26),
              ease: "sine.inOut",
              onComplete: drift,
            });
          drift();
        });
      });
    },
    { scope: root },
  );

  return (
    <div className="color-field" ref={root} aria-hidden="true">
      {BLOBS.map((b, i) => (
        <span
          key={i}
          className="cf-blob"
          style={{
            background: `radial-gradient(circle, ${b.color} 0%, transparent 68%)`,
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${b.size}vmax`,
            height: `${b.size}vmax`,
          }}
        />
      ))}
      <span className="cf-noise" />
    </div>
  );
}
