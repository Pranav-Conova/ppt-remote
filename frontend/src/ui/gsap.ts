// GSAP set-up for the marketing/home page only. The presenter and phone
// routes never import this, so animation code stays off the pointer path.
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { Physics2DPlugin } from "gsap/Physics2DPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, DrawSVGPlugin, MorphSVGPlugin, Physics2DPlugin, ScrambleTextPlugin);

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
export const FULL_MOTION = "(prefers-reduced-motion: no-preference)";

export const fullMotion = () => typeof window !== "undefined" && window.matchMedia(FULL_MOTION).matches;

export { gsap, ScrollTrigger, SplitText, useGSAP };
