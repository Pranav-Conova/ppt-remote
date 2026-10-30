// Moves the laser-pointer dot. Updates arrive up to 60+ times per second from
// the phone or the camera, so they bypass React entirely. set() only records
// the target, and one requestAnimationFrame callback applies it with a GPU
// transform, at most once per display frame.

export class PointerLayer {
  private x = 0.5;
  private y = 0.5;
  private visible = false;
  private drawing = false;
  private frame = 0;
  private w = 0;
  private h = 0;
  private ro: ResizeObserver;
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    const parent = el.parentElement!;
    this.ro = new ResizeObserver(() => {
      this.w = parent.clientWidth;
      this.h = parent.clientHeight;
      this.schedule();
    });
    this.ro.observe(parent);
  }

  set(x: number, y: number, visible: boolean, drawing = false) {
    this.x = x;
    this.y = y;
    this.visible = visible;
    this.drawing = drawing;
    this.schedule();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.schedule();
  }

  get isVisible() {
    return this.visible;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
  }

  private schedule() {
    if (!this.frame) this.frame = requestAnimationFrame(this.apply);
  }

  private apply = () => {
    this.frame = 0;
    const s = this.el.style;
    s.opacity = this.visible ? "1" : "0";
    s.transform = `translate3d(${this.x * this.w}px, ${this.y * this.h}px, 0)`;
    this.el.classList.toggle("drawing", this.drawing);
  };
}
