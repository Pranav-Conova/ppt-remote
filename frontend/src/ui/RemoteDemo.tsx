import { useRef } from "react";
import { FULL_MOTION, gsap, useGSAP } from "./gsap";

// Illustration for the phone-remote section: the phone tilts, the laser dot
// follows across a slide and circles a chart bar, on a loop.
export function RemoteDemo() {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        const circle = root.current!.querySelector<SVGPathElement>(".demo-ink")!;
        const len = circle.getTotalLength();
        gsap.set(circle, { strokeDasharray: len, strokeDashoffset: len });
        gsap.set(".demo-dot", { x: 345, y: 150, opacity: 0 });
        gsap.set(".demo-phone", { transformOrigin: "50% 85%" });

        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, defaults: { ease: "power2.inOut" } });
        tl.to(".demo-phone", { rotate: -7, duration: 0.6 })
          .to(".demo-dot", { opacity: 1, duration: 0.2 }, "<0.2")
          .to(".demo-dot", { x: 250, y: 120, duration: 0.8 }, "<")
          .to(".demo-phone", { rotate: 5, duration: 1.1 }, ">-0.1")
          .to(".demo-dot", { x: 440, y: 205, duration: 1.1 }, "<")
          .to(circle, { strokeDashoffset: 0, duration: 0.9, ease: "power1.inOut" }, ">0.1")
          .to(".demo-dot", { x: 470, y: 180, duration: 0.9, ease: "none" }, "<")
          .to(".demo-phone", { rotate: 0, duration: 0.6 }, ">0.4")
          .to(".demo-dot", { opacity: 0, duration: 0.3 }, "<")
          .to(circle, { opacity: 0, duration: 0.4 }, ">0.6")
          .set(circle, { strokeDashoffset: len, opacity: 1 });
      });
    },
    { scope: root },
  );

  return (
    <svg ref={root} className="remote-demo" viewBox="0 0 560 330" role="img" aria-label="A phone tilting to move a laser pointer across a slide">
      <defs>
        <linearGradient id="demo-brand" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#FFC93C" />
          <stop offset="0.55" stopColor="#FF7A2F" />
          <stop offset="1" stopColor="#B69CFF" />
        </linearGradient>
        <radialGradient id="demo-laser">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.3" stopColor="#FF3B3B" />
          <stop offset="1" stopColor="#FF3B3B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* beam from phone to slide */}
      <path className="demo-beam" d="M118 205 C 150 205, 150 160, 182 160" />

      {/* slide */}
      <g>
        <rect x="182" y="40" width="360" height="226" rx="14" className="demo-slide" />
        <rect x="206" y="64" width="150" height="12" rx="6" fill="url(#demo-brand)" opacity="0.9" />
        <rect x="206" y="86" width="210" height="7" rx="3.5" className="demo-line" />
        <rect x="206" y="100" width="170" height="7" rx="3.5" className="demo-line" />
        {[
          [214, 70],
          [254, 104],
          [294, 84],
          [334, 128],
          [374, 96],
          [414, 150],
          [454, 118],
        ].map(([x, h], i) => (
          <rect key={i} x={x} y={244 - h} width="26" height={h} rx="5" className={i === 5 ? "demo-bar hot" : "demo-bar"} />
        ))}
        <path
          className="demo-ink"
          d="M427 84 C 455 80, 470 100, 468 140 C 466 175, 452 200, 427 199 C 402 198, 393 170, 395 135 C 397 102, 408 86, 432 84"
        />
      </g>

      {/* phone */}
      <g className="demo-phone">
        <rect x="30" y="112" width="88" height="170" rx="16" className="demo-phone-body" />
        <rect x="40" y="128" width="68" height="62" rx="9" className="demo-pad active" />
        <circle cx="74" cy="159" r="12" className="demo-pad-ring" />
        <rect x="40" y="198" width="32" height="30" rx="7" className="demo-pad" />
        <rect x="76" y="198" width="32" height="30" rx="7" fill="url(#demo-brand)" />
        <rect x="40" y="236" width="20" height="20" rx="5" className="demo-pad" />
        <rect x="64" y="236" width="20" height="20" rx="5" className="demo-pad" />
        <rect x="88" y="236" width="20" height="20" rx="5" className="demo-pad" />
      </g>

      {/* laser dot */}
      <g className="demo-dot">
        <circle r="16" fill="url(#demo-laser)" />
        <circle r="3.2" fill="#fff" />
      </g>

      {/* latency chip */}
      <g transform="translate(36 70)">
        <rect width="118" height="28" rx="14" className="demo-chip" />
        <circle cx="16" cy="14" r="4" fill="#34D399" />
        <text x="28" y="18.5" className="demo-chip-text">
          Direct · 4 ms
        </text>
      </g>
    </svg>
  );
}
