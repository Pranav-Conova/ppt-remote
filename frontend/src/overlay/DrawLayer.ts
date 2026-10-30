// Freehand annotations on top of the slide. Strokes are stored in normalized
// slide coordinates per slide, so they survive resizes and are still there
// when you come back to a slide.

type Stroke = [number, number][];

const COLOR = "#ff2d2d";
const WIDTH = 0.004; // fraction of the slide width

export class DrawLayer {
  private strokes = new Map<number, Stroke[]>();
  private slide = 0;
  private active: Stroke | null = null;
  private ctx: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  dispose() {
    this.ro.disconnect();
  }

  setSlide(index: number) {
    this.endStroke();
    this.slide = index;
    this.redraw();
  }

  get drawing() {
    return this.active !== null;
  }

  beginStroke(x: number, y: number) {
    this.active = [[x, y]];
    this.list().push(this.active);
  }

  addPoint(x: number, y: number) {
    if (!this.active) return this.beginStroke(x, y);
    const last = this.active[this.active.length - 1];
    if (last[0] === x && last[1] === y) return;
    this.active.push([x, y]);
    this.segment(last, [x, y]);
  }

  endStroke() {
    this.active = null;
  }

  undo() {
    this.endStroke();
    this.list().pop();
    this.redraw();
  }

  clear() {
    this.endStroke();
    this.strokes.set(this.slide, []);
    this.redraw();
  }

  private list() {
    let l = this.strokes.get(this.slide);
    if (!l) this.strokes.set(this.slide, (l = []));
    return l;
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.redraw();
  }

  private style() {
    const c = this.ctx;
    c.strokeStyle = COLOR;
    c.lineWidth = Math.max(2, WIDTH * this.canvas.width);
    c.lineCap = "round";
    c.lineJoin = "round";
  }

  private segment(a: [number, number], b: [number, number]) {
    const { width: w, height: h } = this.canvas;
    this.style();
    this.ctx.beginPath();
    this.ctx.moveTo(a[0] * w, a[1] * h);
    this.ctx.lineTo(b[0] * w, b[1] * h);
    this.ctx.stroke();
  }

  private redraw() {
    const { width: w, height: h } = this.canvas;
    this.ctx.clearRect(0, 0, w, h);
    this.style();
    for (const stroke of this.strokes.get(this.slide) ?? []) {
      this.ctx.beginPath();
      stroke.forEach(([x, y], i) => (i ? this.ctx.lineTo(x * w, y * h) : this.ctx.moveTo(x * w, y * h)));
      if (stroke.length === 1) this.ctx.lineTo(stroke[0][0] * w + 0.1, stroke[0][1] * h);
      this.ctx.stroke();
    }
  }
}
