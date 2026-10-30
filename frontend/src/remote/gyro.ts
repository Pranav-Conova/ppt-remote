// Gyro air-pointer: turns phone rotation into an absolute pointer position.
//
// We integrate angular velocity (devicemotion.rotationRate) rather than
// reading absolute orientation. Absolute alpha relies on the magnetometer,
// which drifts and jumps indoors. Turning is measured in "player space" (see
// yawPitch), so it works however the phone is held. The pointer starts at
// the centre each time the button is pressed
// (clutch), so there is no long-term drift to calibrate away.
//
// Per-sample pipeline (each stage is its own function/class below):
//   raw rate → bias removal → player-space yaw/pitch → soft tiered
//   smoothing → tightening (+ steady freeze) → acceleration gain → position

export interface GyroSettings {
  /** Degrees of rotation needed to sweep the full slide width. */
  degreesPerWidth: number;
  /**
   * Pointer acceleration, 0..1. 0 = constant speed. Higher = slower, more
   * precise small movements and faster big sweeps.
   */
  acceleration: number;
  /**
   * 0 (off) .. 1 (strong). Sets the speed below which movement is smoothed
   * (0..SMOOTH_MAX_THRESHOLD deg/s); faster movement is never smoothed.
   */
  smoothing: number;
  /** Learn and remove gyro bias (drift) whenever the phone is still. */
  autoCalibrate: boolean;
  invertX: boolean;
  invertY: boolean;
}

export const DEFAULT_GYRO: GyroSettings = {
  degreesPerWidth: 35,
  acceleration: 0.5,
  smoothing: 0.5,
  autoCalibrate: true,
  invertX: false,
  invertY: false,
};

// v2: v1 builds mapped the gyro axes wrong, so saved invert toggles are stale.
const GYRO_STORAGE_KEY = "signify.gyro.v2";

export function loadGyroSettings(): GyroSettings {
  try {
    return { ...DEFAULT_GYRO, ...JSON.parse(localStorage.getItem(GYRO_STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_GYRO;
  }
}

export function saveGyroSettings(s: GyroSettings) {
  try {
    localStorage.setItem(GYRO_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore (private mode etc.)
  }
}

const SLIDE_ASPECT = 16 / 9;
/**
 * Below this rotation speed (deg/s), input is scaled down proportionally
 * ("tightening") rather than cut off, so slow deliberate aiming still works
 * while tremor and sensor noise shrink to almost nothing.
 */
export const TIGHTEN_THRESHOLD = 4;

// ---- drift correction & steady state ------------------------------------
/** Samples per stillness window (~0.5 s at 60 Hz). */
export const STILL_WINDOW = 30;
/**
 * Bias is only learned when every axis varies less than this (deg/s).
 * Loose enough to include a phone held in the hand (tremor ≈ 0.5-1 deg/s);
 * tremor averages out, so the window mean still tracks the bias.
 */
const CALIBRATE_MAX_STD = 1.5;
/** ...and the average rate is small enough to plausibly be bias, not motion. */
const CALIBRATE_MAX_MEAN = 1.0;
/** "Steady" = held but not moving: jitter without a consistent direction. */
const STEADY_MAX_STD = 1.5;
const STEADY_MAX_MEAN = 0.75;
/** How fast the bias estimate follows (per still sample; ~1.7 s time constant). */
const BIAS_RATE = 0.01;

/**
 * Tracks gyro bias and stillness over a sliding window.
 *
 * Bias calibration: the standard approach is to average the gyro output
 * while the device is still and subtract it (mobile sensor-calibration
 * patents; Jibb Smart's calibration guidance). Android and iOS usually
 * correct most bias already, so this mainly removes what's left.
 *
 * Steady state: commercial air mice treat "held but not moving" as its own
 * state and freeze the cursor there, so hand tremor (8-12 Hz) doesn't make
 * it shimmer. Tremor has near-zero mean, while slow deliberate motion has a
 * consistent direction, so the mean tells the two apart.
 */
export class GyroCalibrator {
  bias: [number, number, number] = [0, 0, 0];
  /** Held but not deliberately moving. */
  steady = false;
  private buf: [number, number, number][] = [];
  private i = 0;

  /** Feeds one raw sample; returns it with the current bias removed. */
  push(a: number, b: number, g: number, autoCalibrate: boolean): [number, number, number] {
    const sample: [number, number, number] = [a, b, g];
    if (this.buf.length < STILL_WINDOW) this.buf.push(sample);
    else this.buf[this.i] = sample;
    this.i = (this.i + 1) % STILL_WINDOW;

    if (this.buf.length === STILL_WINDOW) {
      const n = STILL_WINDOW;
      const mean = [0, 1, 2].map((k) => this.buf.reduce((s, v) => s + v[k], 0) / n);
      const std = [0, 1, 2].map((k) => Math.sqrt(this.buf.reduce((s, v) => s + (v[k] - mean[k]) ** 2, 0) / n));
      const maxStd = Math.max(...std);
      const residual = Math.hypot(mean[0] - this.bias[0], mean[1] - this.bias[1], mean[2] - this.bias[2]);

      if (autoCalibrate && maxStd < CALIBRATE_MAX_STD && Math.max(...mean.map(Math.abs)) < CALIBRATE_MAX_MEAN) {
        for (let k = 0; k < 3; k++) this.bias[k] += BIAS_RATE * (mean[k] - this.bias[k]);
      }
      this.steady = maxStd < STEADY_MAX_STD && residual < STEADY_MAX_MEAN;
    }
    if (!autoCalibrate) return sample;
    return [a - this.bias[0], b - this.bias[1], g - this.bias[2]];
  }
}

// ---- smoothing -------------------------------------------------------------
/** Upper smoothing threshold (deg/s) at smoothing = 1. */
export const SMOOTH_MAX_THRESHOLD = 12;
/** Samples averaged for the smoothed part (~130 ms at 60 Hz). */
const SMOOTH_SAMPLES = 8;

/**
 * Soft tiered smoothing (Jibb Smart, "Good gyro controls part 1").
 * Movement slower than threshold/2 is fully smoothed (moving average),
 * movement faster than threshold passes straight through, and in between
 * the two are blended. Fast, intentional moves therefore get no added lag,
 * while slow jittery input is steadied.
 */
export class SoftTieredSmoother {
  private buf: [number, number][] = [];
  private i = 0;

  reset() {
    this.buf = [];
    this.i = 0;
  }

  apply(yaw: number, pitch: number, threshold: number): [number, number] {
    if (threshold <= 0) return [yaw, pitch];
    const lower = threshold / 2;
    const w = Math.min(1, Math.max(0, (Math.hypot(yaw, pitch) - lower) / (threshold - lower)));
    const part: [number, number] = [yaw * (1 - w), pitch * (1 - w)];
    if (this.buf.length < SMOOTH_SAMPLES) this.buf.push(part);
    else this.buf[this.i] = part;
    this.i = (this.i + 1) % SMOOTH_SAMPLES;
    // Average over the full window (missing samples count as zero), so the
    // smoothed part ramps in rather than jumping at the start.
    const sy = this.buf.reduce((s, v) => s + v[0], 0) / SMOOTH_SAMPLES;
    const sp = this.buf.reduce((s, v) => s + v[1], 0) / SMOOTH_SAMPLES;
    return [yaw * w + sy, pitch * w + sp];
  }
}

/** Rotation speeds (deg/s) where acceleration starts and reaches full effect. */
export const ACCEL_SLOW = 5;
export const ACCEL_FAST = 75;

/**
 * Pointer acceleration (Jibb Smart, "Good gyro controls part 1"; Casiez &
 * Roussel found OS-style acceleration up to 24% faster than constant gain).
 * Returns a sensitivity multiplier that blends from a "slow" gain below
 * ACCEL_SLOW to a "fast" gain above ACCEL_FAST, based on rotation speed.
 *
 * acceleration 0   → 1× always (constant gain)
 * acceleration 0.5 → 0.75× slow … 1.5× fast
 * acceleration 1   → 0.5× slow … 2× fast
 */
export function accelerationGain(speed: number, acceleration: number): number {
  const a = Math.min(1, Math.max(0, acceleration));
  const slow = 1 - 0.5 * a;
  const fast = 1 + a;
  const t = Math.min(1, Math.max(0, (speed - ACCEL_SLOW) / (ACCEL_FAST - ACCEL_SLOW)));
  return slow + (fast - slow) * t;
}

/**
 * Tightening (Jibb Smart, "Good gyro controls part 1"): scale the rotation
 * by speed/threshold when it is slower than the threshold. A hard minimum
 * speed would swallow slow, intentional movement entirely.
 */
export function tighten(yaw: number, pitch: number, threshold = TIGHTEN_THRESHOLD): [number, number] {
  const speed = Math.hypot(yaw, pitch);
  if (threshold <= 0 || speed >= threshold) return [yaw, pitch];
  const scale = speed / threshold;
  return [yaw * scale, pitch * scale];
}

type PermissionFn = () => Promise<"granted" | "denied">;

/**
 * How far (as a multiplier) a turn may stray from the gravity-based yaw axis
 * before it is reduced. 2 ≈ a 60° buffer, the value JoyShockMapper uses.
 */
const YAW_RELAX = 2;

/**
 * Splits angular velocity into turning (yaw) and tilting (pitch), in deg/s,
 * using "player space" (Jibb Smart, http://gyrowiki.jibbsmart.com/blog:player-space-gyro-and-alternatives-explained).
 *
 * Careful: DeviceMotionEvent.rotationRate is NOT named like
 * DeviceOrientationEvent. Browsers report rotationRate.alpha as the rate
 * about the device X axis, beta about Y and gamma about Z (x: right, y: top
 * of the screen, z: out of the screen).
 *
 * Yaw: the phone's own turning axes (Y and Z: Z when held flat, Y when held
 * upright) give the speed. Gravity only decides the direction, so an error
 * in the gravity estimate (e.g. from hand acceleration) can't skew the aim
 * the way projecting onto gravity ("world space") does. Turns far from the
 * gravity axis fade out smoothly instead of flipping.
 * Pitch: rotation about the phone's own X axis (tilting the top up/down).
 *
 * @param up Gravity "up" direction in device coordinates (any length).
 */
export function yawPitch(alpha: number, beta: number, gamma: number, up: readonly [number, number, number]) {
  const [ux, uy, uz] = up;
  const len = Math.hypot(ux, uy, uz) || 1;
  const worldYaw = (beta * uy + gamma * uz) / len;
  const turn = Math.hypot(beta, gamma);
  const yaw = Math.sign(worldYaw) * Math.min(Math.abs(worldYaw) * YAW_RELAX, turn);
  return { yaw, pitch: alpha };
}

export function motionSupported(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

/** iOS needs an explicit permission prompt triggered from a user tap. */
export function motionNeedsPermission(): boolean {
  return typeof (DeviceMotionEvent as unknown as { requestPermission?: PermissionFn }).requestPermission === "function";
}

export async function requestMotionPermission(): Promise<boolean> {
  if (!motionSupported()) return false;
  const req = (DeviceMotionEvent as unknown as { requestPermission?: PermissionFn }).requestPermission;
  if (typeof req !== "function") return true;
  try {
    return (await req()) === "granted";
  } catch {
    return false;
  }
}

export class GyroPointer {
  onMove: (x: number, y: number) => void = () => {};
  /** True once at least one event with rotation data has been seen. */
  hasData = false;

  private settings: GyroSettings;
  private x = 0.5;
  private y = 0.5;
  private lastT: number | null = null;
  private smoother = new SoftTieredSmoother();
  private up: [number, number, number] = [0, 0.7, 0.7];
  private calibrator = new GyroCalibrator();
  private active = false;

  constructor(settings: GyroSettings) {
    this.settings = settings;
    window.addEventListener("devicemotion", this.handle);
  }

  dispose() {
    window.removeEventListener("devicemotion", this.handle);
  }

  update(settings: GyroSettings) {
    this.settings = settings;
  }

  /** Start emitting, from the centre of the slide or from the last position. */
  begin(recentre = true) {
    if (recentre) this.setPosition(0.5, 0.5);
    this.smoother.reset();
    this.lastT = null;
    this.active = true;
  }

  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  end() {
    this.active = false;
  }

  get position(): [number, number] {
    return [this.x, this.y];
  }

  private handle = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (g && g.x != null && g.y != null && g.z != null) {
      // Low-pass the gravity direction. Browsers disagree on its sign, but the
      // phone is always held screen-up or top-up, so make y+z positive.
      const sign = g.y + g.z >= 0 ? 1 : -1;
      const k = 0.1;
      this.up = [
        this.up[0] + k * (sign * g.x - this.up[0]),
        this.up[1] + k * (sign * g.y - this.up[1]),
        this.up[2] + k * (sign * g.z - this.up[2]),
      ];
    }

    const r = e.rotationRate;
    if (!r || r.alpha == null || r.beta == null || r.gamma == null) return;
    this.hasData = true;
    // Runs even while the pointer is off, so bias is learned while the
    // phone rests between uses.
    const [ra, rb, rg] = this.calibrator.push(r.alpha, r.beta, r.gamma, this.settings.autoCalibrate);
    if (!this.active) return;

    const t = e.timeStamp;
    const dt = this.lastT == null ? 0 : Math.min(0.05, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    if (dt === 0) return;

    const turn = yawPitch(ra, rb, rg, this.up);
    const smoothThreshold = Math.min(1, Math.max(0, this.settings.smoothing)) * SMOOTH_MAX_THRESHOLD;
    const [sy, sp] = this.smoother.apply(turn.yaw, turn.pitch, smoothThreshold);
    let [yaw, pitch] = tighten(sy, sp);
    // Held steady (tremor only): keep the dot perfectly still.
    if (this.calibrator.steady && Math.hypot(turn.yaw, turn.pitch) < TIGHTEN_THRESHOLD) yaw = pitch = 0;

    const { degreesPerWidth, acceleration, invertX, invertY } = this.settings;
    const gain = accelerationGain(Math.hypot(turn.yaw, turn.pitch), acceleration);
    const degreesPerHeight = degreesPerWidth / SLIDE_ASPECT;
    // Turning left (positive yaw about "up") moves the pointer left; tilting
    // the top up (positive pitch) moves it up.
    this.x += ((invertX ? 1 : -1) * yaw * gain * dt) / degreesPerWidth;
    this.y += ((invertY ? 1 : -1) * pitch * gain * dt) / degreesPerHeight;
    this.x = Math.min(1, Math.max(0, this.x));
    this.y = Math.min(1, Math.max(0, this.y));

    this.onMove(this.x, this.y);
  };
}
