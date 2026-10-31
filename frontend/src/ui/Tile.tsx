import type { CSSProperties, HTMLAttributes, PointerEvent } from "react";

/**
 * Bento tile with its own accent colour. On hover it lifts like a sticker
 * (offset shadow in the accent, CSS), and a soft spotlight follows the
 * cursor (CSS variables).
 */
export function Tile({
  accent,
  className = "",
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { accent: string }) {
  const move = (e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <section
      className={`tile ${className}`}
      style={{ "--accent": accent, ...style } as CSSProperties}
      onPointerMove={move}
      {...rest}
    >
      {children}
    </section>
  );
}
