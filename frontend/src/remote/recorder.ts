// Records raw motion-sensor data for the Pointer Lab, so the gyro pointer
// algorithm can be analysed and tuned with real device data.
//
// Everything is stored column-wise (one array per field) to keep uploads
// small. Times are milliseconds since the recording started.
import type { GyroSettings } from "./gyro";

export const RECORDING_VERSION = 1;

const r3 = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);

export interface StepWindow {
  id: string;
  start: number;
  end: number | null;
}

export interface RecordingMeta {
  holdStyle: string;
  phoneModel: string;
  issues: string[];
  notes: string;
  settings: GyroSettings;
}

export class MotionRecorder {
  private t0 = 0;
  private running = false;

  readonly motion = {
    t: [] as number[],
    interval: [] as (number | null)[],
    // rotationRate, deg/s. Per spec: alpha = about X, beta = about Y, gamma = about Z.
    ra: [] as (number | null)[],
    rb: [] as (number | null)[],
    rg: [] as (number | null)[],
    // accelerationIncludingGravity, m/s²
    gx: [] as (number | null)[],
    gy: [] as (number | null)[],
    gz: [] as (number | null)[],
    // acceleration without gravity, m/s² (often null)
    ax: [] as (number | null)[],
    ay: [] as (number | null)[],
    az: [] as (number | null)[],
  };
  readonly orientation = {
    t: [] as number[],
    alpha: [] as (number | null)[],
    beta: [] as (number | null)[],
    gamma: [] as (number | null)[],
    absolute: null as boolean | null,
  };
  /** Pointer position produced by the current algorithm (0..1). */
  readonly pointer = { t: [] as number[], x: [] as number[], y: [] as number[] };
  readonly steps: StepWindow[] = [];

  /** Latest raw rotation rate, for the live readout. */
  latest = { a: 0, b: 0, g: 0 };

  start() {
    this.t0 = performance.now();
    this.running = true;
    window.addEventListener("devicemotion", this.onMotion);
    window.addEventListener("deviceorientation", this.onOrientation);
  }

  stop() {
    this.running = false;
    this.endStep();
    window.removeEventListener("devicemotion", this.onMotion);
    window.removeEventListener("deviceorientation", this.onOrientation);
  }

  now() {
    return r3(performance.now() - this.t0)!;
  }

  beginStep(id: string) {
    this.endStep();
    this.steps.push({ id, start: this.now(), end: null });
  }

  endStep() {
    const last = this.steps[this.steps.length - 1];
    if (last && last.end === null) last.end = this.now();
  }

  addPointer(x: number, y: number) {
    if (!this.running) return;
    this.pointer.t.push(this.now());
    this.pointer.x.push(r3(x)!);
    this.pointer.y.push(r3(y)!);
  }

  get sampleCount() {
    return this.motion.t.length;
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const m = this.motion;
    const r = e.rotationRate;
    const g = e.accelerationIncludingGravity;
    const a = e.acceleration;
    m.t.push(r3(e.timeStamp - this.t0)!);
    m.interval.push(r3(e.interval));
    m.ra.push(r3(r?.alpha));
    m.rb.push(r3(r?.beta));
    m.rg.push(r3(r?.gamma));
    m.gx.push(r3(g?.x));
    m.gy.push(r3(g?.y));
    m.gz.push(r3(g?.z));
    m.ax.push(r3(a?.x));
    m.ay.push(r3(a?.y));
    m.az.push(r3(a?.z));
    this.latest = { a: r?.alpha ?? 0, b: r?.beta ?? 0, g: r?.gamma ?? 0 };
  };

  private onOrientation = (e: DeviceOrientationEvent) => {
    const o = this.orientation;
    o.t.push(r3(e.timeStamp - this.t0)!);
    o.alpha.push(r3(e.alpha));
    o.beta.push(r3(e.beta));
    o.gamma.push(r3(e.gamma));
    o.absolute = e.absolute;
  };

  toJSON(meta: RecordingMeta) {
    return {
      version: RECORDING_VERSION,
      createdAt: new Date().toISOString(),
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio },
        orientation: { type: screen.orientation?.type ?? null, angle: screen.orientation?.angle ?? null },
      },
      ...meta,
      steps: this.steps,
      motion: this.motion,
      orientation: this.orientation,
      pointer: this.pointer,
    };
  }
}
