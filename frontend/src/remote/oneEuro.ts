// One Euro filter (Casiez et al., CHI 2012): an adaptive low-pass filter.
// At low speed the cutoff is low, which removes hand tremor. As speed grows
// the cutoff rises, so fast pointer moves get almost no added lag.

function alpha(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;

  /**
   * @param minCutoff Hz. Lower means smoother when still, but more lag.
   * @param beta Speed coefficient. Higher means less lag on fast moves.
   * @param dCutoff Hz. Cutoff for the derivative estimate.
   */
  constructor(
    public minCutoff = 1.0,
    public beta = 5.0,
    public dCutoff = 1.0,
  ) {}

  reset(value?: number) {
    this.x = value ?? null;
    this.dx = 0;
  }

  /** @param dt seconds since the previous sample */
  filter(value: number, dt: number): number {
    if (this.x === null || dt <= 0) {
      this.x = value;
      return value;
    }
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
