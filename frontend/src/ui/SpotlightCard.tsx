import type { HTMLAttributes, PointerEvent } from "react";

// Card with a soft glow that follows the cursor (21st.dev / Inspira-style
// spotlight). The position is written to CSS variables; CSS does the drawing.
export function SpotlightCard({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div className={`spotlight ${className}`} onPointerMove={move} {...rest}>
      {children}
    </div>
  );
}
