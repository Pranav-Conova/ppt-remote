import { useRef } from "react";
import { FULL_MOTION, gsap, useGSAP } from "./gsap";

// Slow-drifting aurora glow behind the hero. The blobs are pre-blurred radial
// gradients (no CSS filter), and only transforms animate, so it stays cheap.
export function Aurora() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        gsap.utils.toArray<HTMLElement>(".aurora-blob").forEach((blob, i) => {
          gsap.to(blob, {
            xPercent: gsap.utils.random(-18, 18),
            yPercent: gsap.utils.random(-14, 14),
            scale: gsap.utils.random(0.85, 1.2),
            rotate: gsap.utils.random(-20, 20),
            duration: gsap.utils.random(9, 14),
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            delay: i * -2,
          });
        });
      });
    },
    { scope: root },
  );

  return (
    <div className="aurora" ref={root} aria-hidden="true">
      <div className="aurora-blob b1" />
      <div className="aurora-blob b2" />
      <div className="aurora-blob b3" />
      <div className="aurora-grid" />
    </div>
  );
}
