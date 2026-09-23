// Heavy symmetric top (a gyroscope wheel on a pivot) in uniform gravity.
// Full rigid-body dynamics: Euler's equations with the gravity torque in the
// body frame, plus a unit quaternion for the attitude, advanced with RK4.
// Pure module: no DOM, no Three.js. Hot paths allocate nothing.
//
// Conventions
// - World frame is z-up. The pivot is the origin. Gravity is -g z.
// - Body axis 3 is the symmetry axis (the axle). The centre of mass sits at
//   distance l along +axis 3 from the pivot.
// - I1 is the transverse moment about the pivot (includes m l^2). I3 is the
//   moment about the axle.
// - State s = [w1, w2, w3, qw, qx, qy, qz]: body angular velocity (rad/s) and
//   the unit quaternion that rotates body vectors into the world frame.

export type Vec3 = [number, number, number];
export type State = Float64Array;

export interface TopParams {
  /** Transverse moment of inertia about the pivot (kg m^2). */
  I1: number;
  /** Moment of inertia about the symmetry axis (kg m^2). */
  I3: number;
  /** Mass (kg). */
  m: number;
  /** Pivot to centre-of-mass distance (m). */
  l: number;
  /** Gravitational acceleration (m/s^2). */
  g: number;
}

export const newState = (): State => new Float64Array(7);

/** Wheel radius of gyration used by the scene (m). A spoked wheel with a heavy rim. */
export const WHEEL_RG = 0.035;

/** Build top parameters for a thin wheel of mass m and radius of gyration rg on an arm of length l. */
export function wheelParams(m: number, l: number, g: number, rg = WHEEL_RG): TopParams {
  const I3 = m * rg * rg;
  // Thin wheel: transverse moment about its centre is I3 / 2. Parallel-axis to the pivot.
  const I1 = I3 / 2 + m * l * l;
  return { I1, I3, m, l, g };
}

/** Time derivative of the state. Writes into out. */
export function derivatives(p: TopParams, s: ArrayLike<number>, out: Float64Array): void {
  const w1 = s[0], w2 = s[1], w3 = s[2];
  const qw = s[3], qx = s[4], qy = s[5], qz = s[6];
  // Third row of the rotation matrix: world z expressed in body axes.
  const r20 = 2 * (qx * qz - qw * qy);
  const r21 = 2 * (qy * qz + qw * qx);
  // Gravity torque about the pivot, body frame: tau = l e3 x (-m g zhat_body).
  const mgl = p.m * p.g * p.l;
  const t1 = mgl * r21;
  const t2 = -mgl * r20;
  // Euler's equations with I1 = I2 (axis 3 gets no torque, so w3 is constant).
  out[0] = ((p.I1 - p.I3) * w2 * w3 + t1) / p.I1;
  out[1] = ((p.I3 - p.I1) * w3 * w1 + t2) / p.I1;
  out[2] = 0;
  // q' = 1/2 q (x) (0, w_body)
  out[3] = 0.5 * (-qx * w1 - qy * w2 - qz * w3);
  out[4] = 0.5 * (qw * w1 + qy * w3 - qz * w2);
  out[5] = 0.5 * (qw * w2 + qz * w1 - qx * w3);
  out[6] = 0.5 * (qw * w3 + qx * w2 - qy * w1);
}

/** RK4 stepper with preallocated scratch buffers. */
export class Integrator {
  private k1 = new Float64Array(7);
  private k2 = new Float64Array(7);
  private k3 = new Float64Array(7);
  private k4 = new Float64Array(7);
  private tmp = new Float64Array(7);
  /** Renormalize the quaternion after each step. Tests switch this off to measure raw drift. */
  renormalize = true;

  p: TopParams;

  constructor(p: TopParams) {
    this.p = p;
  }

  /** Advance s in place by h seconds. */
  step(s: State, h: number): void {
    const { p, k1, k2, k3, k4, tmp } = this;
    derivatives(p, s, k1);
    for (let i = 0; i < 7; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
    derivatives(p, tmp, k2);
    for (let i = 0; i < 7; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
    derivatives(p, tmp, k3);
    for (let i = 0; i < 7; i++) tmp[i] = s[i] + h * k3[i];
    derivatives(p, tmp, k4);
    for (let i = 0; i < 7; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    if (this.renormalize) {
      const n = Math.hypot(s[3], s[4], s[5], s[6]);
      s[3] /= n; s[4] /= n; s[5] /= n; s[6] /= n;
    }
  }
}

/** Rotate body vector v into the world frame with the state's quaternion. */
export function toWorld(s: ArrayLike<number>, vx: number, vy: number, vz: number, out: Vec3): Vec3 {
  const w = s[3], x = s[4], y = s[5], z = s[6];
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  out[0] = vx + w * tx + (y * tz - z * ty);
  out[1] = vy + w * ty + (z * tx - x * tz);
  out[2] = vz + w * tz + (x * ty - y * tx);
  return out;
}

/** Unit vector along the axle in the world frame. */
export function axleWorld(s: ArrayLike<number>, out: Vec3): Vec3 {
  const w = s[3], x = s[4], y = s[5], z = s[6];
  out[0] = 2 * (x * z + w * y);
  out[1] = 2 * (y * z - w * x);
  out[2] = 1 - 2 * (x * x + y * y);
  return out;
}

/** Total energy: rotational kinetic plus gravitational potential m g l cos(theta). */
export function energy(p: TopParams, s: ArrayLike<number>): number {
  const cz = 1 - 2 * (s[4] * s[4] + s[5] * s[5]);
  return 0.5 * (p.I1 * (s[0] * s[0] + s[1] * s[1]) + p.I3 * s[2] * s[2]) + p.m * p.g * p.l * cz;
}

/** World angular momentum about the pivot. */
export function angMomWorld(p: TopParams, s: ArrayLike<number>, out: Vec3): Vec3 {
  return toWorld(s, p.I1 * s[0], p.I1 * s[1], p.I3 * s[2], out);
}

/** Vertical component of angular momentum L_z (conserved: gravity torque is horizontal). */
export function Lz(p: TopParams, s: ArrayLike<number>): number {
  const w = s[3], x = s[4], y = s[5], z = s[6];
  const r20 = 2 * (x * z - w * y);
  const r21 = 2 * (y * z + w * x);
  const r22 = 1 - 2 * (x * x + y * y);
  return r20 * p.I1 * s[0] + r21 * p.I1 * s[1] + r22 * p.I3 * s[2];
}

/** Angular momentum along the axle L_3 = I3 w3 (conserved: torque is perpendicular to the axle). */
export const L3 = (p: TopParams, s: ArrayLike<number>): number => p.I3 * s[2];

/** Tilt of the axle from the upward vertical (rad). */
export function tilt(s: ArrayLike<number>): number {
  const cz = 1 - 2 * (s[4] * s[4] + s[5] * s[5]);
  return Math.acos(Math.max(-1, Math.min(1, cz)));
}

/** Azimuth rate of the axle, d(phi)/dt, counterclockwise about +z seen from above (rad/s). */
export function precessionRate(s: ArrayLike<number>): number {
  const w = s[3], x = s[4], y = s[5], z = s[6];
  const ex = 2 * (x * z + w * y);
  const ey = 2 * (y * z - w * x);
  const rho2 = ex * ex + ey * ey;
  if (rho2 < 1e-14) return 0;
  // de3/dt = omega_world x e3, and omega x e3 in the body frame is (w2, -w1, 0).
  // Rotate that body vector into the world frame for the axle velocity.
  const bx = s[1], by = -s[0];
  const tx = 2 * (-z * by);
  const ty = 2 * (z * bx);
  const tz = 2 * (x * by - y * bx);
  const dx = bx + w * tx + (y * tz - z * ty);
  const dy = by + w * ty + (z * tx - x * tz);
  return (ex * dy - ey * dx) / rho2;
}

/** Fast-top precession rate Omega = m g l / (I3 w3). */
export function fastPrecession(p: TopParams, w3: number): number {
  return (p.m * p.g * p.l) / (p.I3 * w3);
}

/**
 * Exact slow steady-precession rate at tilt theta and axial spin w3:
 * the smaller root of I1 cos(theta) phi'^2 - I3 w3 phi' + m g l = 0.
 * Written in a form that stays finite at theta = 90 degrees. NaN if none exists.
 */
export function steadyPrecession(p: TopParams, w3: number, theta: number): number {
  const mgl = p.m * p.g * p.l;
  const b = p.I3 * w3;
  const D = b * b - 4 * p.I1 * mgl * Math.cos(theta);
  if (D < 0) return NaN;
  const den = b + Math.sign(b || 1) * Math.sqrt(D);
  return den === 0 ? NaN : (2 * mgl) / den;
}

/** Sleeping-top threshold: an upright top is stable when w3^2 > 4 I1 m g l / I3^2. Returns the critical w3. */
export function sleepingThreshold(p: TopParams): number {
  return (2 * Math.sqrt(p.I1 * p.m * p.g * p.l)) / p.I3;
}

/** Fast-top nutation angular frequency I3 w3 / I1. */
export const nutationRate = (p: TopParams, w3: number): number => (p.I3 * Math.abs(w3)) / p.I1;

/**
 * Initial state at tilt theta (from vertical), azimuth 0, no tilt rate,
 * precession rate phiDot and axial spin w3 (the conserved component along the axle).
 * Attitude uses z-x-z Euler angles (phi, theta, psi) = (0, theta, 0).
 */
export function initialState(theta: number, phiDot: number, w3: number, out: State): State {
  out[0] = 0;
  out[1] = phiDot * Math.sin(theta);
  out[2] = w3;
  out[3] = Math.cos(theta / 2);
  out[4] = Math.sin(theta / 2);
  out[5] = 0;
  out[6] = 0;
  return out;
}
