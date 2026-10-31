import { useRef } from "react";
import { FULL_MOTION, gsap, useGSAP } from "./gsap";

const PAD = "#1f2220";
const POINT = "#0ae448";
const DRAW = "#ff8709";

const STEPS = ["Hold to point", "Drag down to draw", "Drag up to stop", "Tap Next"];

/**
 * The phone remote in action, on a loop: hold the Pointer pad and tilt to
 * move the laser, drag down to circle a bar, drag up to stop, then tap Next.
 * The step chips underneath light up in time (and simply list the steps
 * when motion is reduced).
 */
export function RemoteDemo() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(FULL_MOTION, () => {
        const el = root.current!;
        const q = <T extends Element>(s: string) => el.querySelector<T>(s)!;
        const ink = q<SVGPathElement>(".rd-ink");
        const len = ink.getTotalLength();
        const padLabel = q<SVGTextElement>(".rd-pad-label");
        const counter = q<SVGTextElement>(".rd-counter");
        const step = (n: number) => () => (el.dataset.step = String(n));
        const label = (text: string) => () => (padLabel.textContent = text);
        const count = (text: string) => () => (counter.textContent = text);

        gsap.set(ink, { strokeDasharray: len, strokeDashoffset: len });
        gsap.set(".rd-dot", { x: 150, y: 60, opacity: 0 });
        gsap.set(".rd-finger", { opacity: 0, scale: 0, transformOrigin: "50% 50%" });
        gsap.set(".rd-phone", { transformOrigin: "50% 90%" });

        gsap
          .timeline({ repeat: -1, repeatDelay: 0.5, defaults: { ease: "power2.inOut" } })
          // 1. hold the pad and tilt: the laser appears and follows
          .call(step(1))
          .set(".rd-finger", { x: 0, y: 0 })
          .to(".rd-finger", { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" })
          .to(".rd-pad", { fill: POINT, duration: 0.2 }, "<")
          .to(".rd-dot", { opacity: 1, duration: 0.2 })
          .to(".rd-phone", { rotation: -6, duration: 0.7 }, "<")
          .to(".rd-dot", { x: 118, y: 42, duration: 0.7 }, "<")
          .to(".rd-phone", { rotation: 4, duration: 0.9 })
          .to(".rd-dot", { x: 204, y: 58, duration: 0.9 }, "<")
          // 2. drag down: the pad turns amber and the laser draws
          .call(step(2))
          .call(label("Drawing"))
          .to(".rd-finger", { y: 12, duration: 0.3 })
          .to(".rd-pad", { fill: DRAW, duration: 0.2 }, "<")
          .to(ink, { strokeDashoffset: 0, duration: 1.3, ease: "none" })
          .to(".rd-dot", { motionPath: { path: ink }, duration: 1.3, ease: "none" }, "<")
          // 3. drag up: drawing stops, the ink stays
          .call(step(3))
          .call(label("Pointer"))
          .to(".rd-finger", { y: -2, duration: 0.3 })
          .to(".rd-pad", { fill: POINT, duration: 0.2 }, "<")
          .to(".rd-phone", { rotation: 0, duration: 0.6 })
          .to(".rd-dot", { x: 250, y: 36, duration: 0.6 }, "<")
          .to(".rd-finger", { opacity: 0, scale: 0, duration: 0.25 }, "+=0.2")
          .to(".rd-dot", { opacity: 0, duration: 0.2 }, "<")
          .to(".rd-pad", { fill: PAD, duration: 0.2 }, "<")
          // 4. tap Next: the next slide comes up
          .call(step(4))
          .set(".rd-finger", { x: 17, y: 45 })
          .to(".rd-finger", { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" })
          .to(".rd-next", { fill: POINT, duration: 0.1 })
          .to(".rd-finger", { scale: 0.75, duration: 0.1, yoyo: true, repeat: 1 }, "<")
          .to([".rd-slide-1", ink], { opacity: 0, duration: 0.3 })
          .to(".rd-slide-2", { opacity: 1, duration: 0.3 }, "<")
          .call(count("4 / 12"))
          .to(".rd-next", { fill: PAD, duration: 0.2 }, "+=0.15")
          .to(".rd-finger", { opacity: 0, scale: 0, duration: 0.2 }, "<")
          // back to the start
          .to(".rd-slide-2", { opacity: 0, duration: 0.3 }, "+=1.4")
          .to(".rd-slide-1", { opacity: 1, duration: 0.3 }, "<")
          .set(ink, { strokeDashoffset: len, opacity: 1 })
          .call(count("3 / 12"));

        return () => delete el.dataset.step;
      });
    },
    { scope: root },
  );

  return (
    <div className="remote-demo" ref={root}>
      <svg
        className="rd-scene"
        viewBox="0 0 300 232"
        role="img"
        aria-label="A phone used as a remote: holding the Pointer pad moves a laser dot over a slide, dragging down draws a circle, and tapping Next changes the slide"
      >
        <defs>
          <radialGradient id="rd-laser">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.3" stopColor="#ff3b3b" />
            <stop offset="1" stopColor="#ff3b3b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* the slide on the big screen */}
        <rect x="64" y="6" width="230" height="146" rx="10" className="rd-slide" />
        <g className="rd-slide-1">
          <rect x="82" y="22" width="92" height="9" rx="4.5" fill="#abff84" />
          <rect x="82" y="38" width="130" height="5" rx="2.5" className="rd-line" />
          {[30, 46, 38, 58, 70, 50, 62].map((h, i) => (
            <rect
              key={i}
              x={98 + i * 26}
              y={140 - h}
              width="16"
              height={h}
              rx="3"
              className={i === 4 ? "rd-bar hot" : "rd-bar"}
            />
          ))}
          <path className="rd-ink" d="M204 58 C 232 58, 234 150, 204 150 C 174 150, 176 58, 208 62" />
        </g>
        <g className="rd-slide-2">
          <rect x="82" y="22" width="120" height="11" rx="5.5" fill="#fec5fb" />
          <rect x="82" y="42" width="170" height="5" rx="2.5" className="rd-line" />
          <rect x="82" y="54" width="150" height="5" rx="2.5" className="rd-line" />
          <circle cx="230" cy="108" r="26" fill="#9d95ff" />
          <path d="M230 108 L230 82 A26 26 0 0 1 254 116 Z" fill="#ff8709" />
          <rect x="82" y="84" width="96" height="44" rx="6" className="rd-card" />
        </g>

        {/* the phone */}
        <g className="rd-phone">
          <rect x="8" y="76" width="86" height="152" rx="14" className="rd-phone-body" />
          <text x="51" y="92" className="rd-counter" textAnchor="middle">
            3 / 12
          </text>
          <rect x="16" y="100" width="70" height="58" rx="9" className="rd-pad" fill={PAD} />
          <text x="51" y="134" className="rd-pad-label" textAnchor="middle">
            Pointer
          </text>
          <rect x="16" y="164" width="33" height="26" rx="7" fill={PAD} />
          <path d="M35 171 l-6 6 6 6" className="rd-glyph" />
          <rect x="53" y="164" width="33" height="26" rx="7" className="rd-next" fill={PAD} />
          <path d="M67 171 l6 6 -6 6" className="rd-glyph" />
          {[16, 41.5, 67].map((x) => (
            <rect key={x} x={x} y="196" width="19" height="17" rx="5" fill={PAD} />
          ))}
          <circle className="rd-finger" cx="51" cy="129" r="10" />
        </g>

        {/* the laser dot (moved by the animation; parked on the bar when motion is reduced) */}
        <g className="rd-dot" transform="translate(204 58)">
          <circle r="11" fill="url(#rd-laser)" />
          <circle r="2.4" fill="#fff" />
        </g>
      </svg>

      <ol className="rd-steps">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
