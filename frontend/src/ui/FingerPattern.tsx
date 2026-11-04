import type { CSSProperties } from "react";

const NAMES = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
// Relative finger lengths, so the pattern reads as a hand.
const HEIGHTS = [0.62, 0.88, 1, 0.9, 0.7];

/**
 * A read-only five-finger pattern ([thumb … pinky], 1 = up), drawn as a
 * small hand. Used in the shortcuts overlay and the live gesture test.
 */
export function FingerPattern({ pattern, size = 28 }: { pattern: readonly number[]; size?: number }) {
  const label = pattern.some(Boolean)
    ? NAMES.filter((_, i) => pattern[i]).join(" + ") + " up"
    : "Fist (all fingers down)";
  return (
    <span className="fp" role="img" aria-label={label} title={label} style={{ "--fp": `${size}px` } as CSSProperties}>
      {pattern.map((up, i) => (
        <span key={i} className={`fp-f${up ? " up" : ""}`} style={{ "--h": HEIGHTS[i] } as CSSProperties} />
      ))}
    </span>
  );
}
