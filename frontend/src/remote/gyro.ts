// Gyro air-pointer: turns phone rotation into an absolute pointer position.
//
// We integrate angular velocity (devicemotion.rotationRate) rather than
// reading absolute orientation. Absolute alpha relies on the magnetometer,
// which drifts and jumps indoors. Yaw is measured around the gravity vector,
// so it works however steeply the phone is tilted while being held like a
// remote. The pointer starts at the centre each time the button is pressed
// (clutch), so there is no long-term drift to calibrate away.
import { OneEuroFilter } from "./oneEuro";

export interface GyroSettings {
  /** Degrees of rotation needed to sweep the full slide width. */
  degreesPerWidth: number;
  /** 0 (raw) .. 1 (very smooth) */
  smoothing: number;
  invertX: boolean;
  invertY: boolean;
}

export const DEFAULT_GYRO: GyroSettings = {
  degreesPerWidth: 35,
  smoothing: 0.5,
  invertX: false,
  invertY: false,
};

const SLIDE_ASPECT = 16 / 9;
/** Rotation below this (deg/s) is treated as sensor noise. */
const DEADZONE = 0.4;

type PermissionFn = () => Promise<"granted" | "denied">;

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

    // Angular velocity in device axes: x→beta, y→gamma, z→alpha (deg/s).
    const [ux, uy, uz] = this.up;
    const len = Math.hypot(ux, uy, uz) || 1;
    let yaw = (r.beta * ux + r.gamma * uy + r.alpha * uz) / len;
    let pitch = r.beta;
    if (Math.abs(yaw) < DEADZONE) yaw = 0;
    if (Math.abs(pitch) < DEADZONE) pitch = 0;

    const { degreesPerWidth, invertX, invertY } = this.settings;
    const degreesPerHeight = degreesPerWidth / SLIDE_ASPECT;
    // Turning left (positive yaw about "up") moves the pointer left; tilting
    // the top up (positive beta) moves it up.
    this.x += ((invertX ? 1 : -1) * yaw * dt) / degreesPerWidth;
    this.y += ((invertY ? 1 : -1) * pitch * dt) / degreesPerHeight;
    this.x = Math.min(1, Math.max(0, this.x));
    this.y = Math.min(1, Math.max(0, this.y));

    this.onMove(this.fx.filter(this.x, dt), this.fy.filter(this.y, dt));
  };
}
