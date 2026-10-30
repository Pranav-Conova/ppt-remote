// Gyro air-pointer: turns phone rotation into an absolute pointer position.
//
// We integrate angular velocity (devicemotion.rotationRate) rather than
// reading absolute orientation. Absolute alpha relies on the magnetometer,
// which drifts and jumps indoors. Turning is measured in "player space" (see
// yawPitch), so it works however the phone is held. The pointer starts at
// the centre each time the button is pressed
// (clutch), so there is no long-term drift to calibrate away.
import { OneEuroFilter } from "./oneEuro";

export interface GyroSettings {
  /** Degrees of rotation needed to sweep the full slide width. */
  degreesPerWidth: number;
  /**
   * Pointer acceleration, 0..1. 0 = constant speed. Higher = slower, more
   * precise small movements and faster big sweeps.
   */
  acceleration: number;
  /** 0 (raw) .. 1 (very smooth) */
  smoothing: number;
  invertX: boolean;
  invertY: boolean;
}

export const DEFAULT_GYRO: GyroSettings = {
  degreesPerWidth: 35,
  acceleration: 0.5,
  smoothing: 0.5,
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
  private fx = new OneEuroFilter();
  private fy = new OneEuroFilter();
  private up: [number, number, number] = [0, 0.7, 0.7];
  private active = false;

  constructor(settings: GyroSettings) {
    this.settings = settings;
    this.applySmoothing();
    window.addEventListener("devicemotion", this.handle);
  }

  dispose() {
    window.removeEventListener("devicemotion", this.handle);
  }

  update(settings: GyroSettings) {
    this.settings = settings;
    this.applySmoothing();
  }

  /** Start emitting, from the centre of the slide or from the last position. */
  begin(recentre = true) {
    if (recentre) this.setPosition(0.5, 0.5);
    this.lastT = null;
    this.active = true;
  }

  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.fx.reset(x);
    this.fy.reset(y);
  }

  end() {
    this.active = false;
  }

  get position(): [number, number] {
    return [this.x, this.y];
  }

  private applySmoothing() {
    // smoothing 0 → 8Hz minimum cutoff (nearly raw); 1 → 0.3Hz (heavy).
    const s = Math.min(1, Math.max(0, this.settings.smoothing));
    const minCutoff = 8 * Math.pow(0.3 / 8, s);
    this.fx.minCutoff = this.fy.minCutoff = minCutoff;
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
    if (!this.active) return;

    const t = e.timeStamp;
    const dt = this.lastT == null ? 0 : Math.min(0.05, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    if (dt === 0) return;

    const turn = yawPitch(r.alpha, r.beta, r.gamma, this.up);
    const [yaw, pitch] = tighten(turn.yaw, turn.pitch);

    const { degreesPerWidth, acceleration, invertX, invertY } = this.settings;
    const gain = accelerationGain(Math.hypot(turn.yaw, turn.pitch), acceleration);
    const degreesPerHeight = degreesPerWidth / SLIDE_ASPECT;
    // Turning left (positive yaw about "up") moves the pointer left; tilting
    // the top up (positive pitch) moves it up.
    this.x += ((invertX ? 1 : -1) * yaw * gain * dt) / degreesPerWidth;
    this.y += ((invertY ? 1 : -1) * pitch * gain * dt) / degreesPerHeight;
    this.x = Math.min(1, Math.max(0, this.x));
    this.y = Math.min(1, Math.max(0, this.y));

    this.onMove(this.fx.filter(this.x, dt), this.fy.filter(this.y, dt));
  };
}
