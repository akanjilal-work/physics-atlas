// Foucault pendulum: a spherical pendulum in the rotating frame of the Earth.
// Local frame: x east, y north, z up. The pivot is the origin and the bob
// stays at distance L. Forces per unit mass in the rotating frame:
//   gravity (0,0,-g), Coriolis -2 Ω×v, centrifugal -Ω×(Ω×r), wire tension λ r.
// The tension multiplier λ is solved each evaluation so that d²|r|²/dt² = 0.
// Integrated with classical RK4 on scratch buffers (no allocations per step).
// Pure module: no DOM, no Three.js.

/** Earth's sidereal rotation rate (rad/s). */
export const OMEGA_EARTH = 7.2921e-5;
/** One sidereal day in hours, 2π/Ω. */
export const SIDEREAL_HOURS = 23.934;
export const G = 9.81;

const DEG = Math.PI / 180;

export interface FPParams {
  /** Wire length (m). */
  L: number;
  /** Gravitational acceleration (m/s²). */
  g: number;
  /** Latitude in degrees, positive north. */
  latDeg: number;
  /** Rotation rate used in the simulation (rad/s): OMEGA_EARTH times the exaggeration factor. */
  omega: number;
}

/** Predicted precession rate of the swing plane in the Earth frame (rad/s). Negative = clockwise seen from above. */
export function precessionRate(omega: number, latDeg: number): number {
  return -omega * Math.sin(latDeg * DEG);
}

/** Predicted precession period in hours (Infinity at the equator). */
export function precessionPeriodHours(latDeg: number, factor = 1): number {
  const s = Math.abs(Math.sin(latDeg * DEG));
  return s < 1e-12 ? Infinity : SIDEREAL_HOURS / (s * factor);
}

/** Small-swing period of the pendulum (s). */
export const swingPeriod = (L: number, g = G) => 2 * Math.PI * Math.sqrt(L / g);

export class FoucaultSim {
  /** State [x, y, z, vx, vy, vz] in the Earth frame. */
  readonly s = new Float64Array(6);
  t = 0;
  p: FPParams;
  /** Earth's spin vector in local coordinates. */
  readonly W = new Float64Array(3);
  private k1 = new Float64Array(6);
  private k2 = new Float64Array(6);
  private k3 = new Float64Array(6);
  private k4 = new Float64Array(6);
  private tmp = new Float64Array(6);

  constructor(p: FPParams) {
    this.p = { ...p };
    this.setParams(p);
  }

  setParams(p: FPParams): void {
    this.p = { ...p };
    const phi = p.latDeg * DEG;
    this.W[0] = 0;
    this.W[1] = p.omega * Math.cos(phi);
    this.W[2] = p.omega * Math.sin(phi);
  }

  /** Release from rest (in the Earth frame) at angle amp (rad) from vertical, toward azimuth az (rad, counterclockwise from east). */
  release(amp: number, az = 0): void {
    const { L } = this.p;
    const h = L * Math.sin(amp);
    this.s[0] = h * Math.cos(az);
    this.s[1] = h * Math.sin(az);
    this.s[2] = -L * Math.cos(amp);
    this.s[3] = this.s[4] = this.s[5] = 0;
    this.t = 0;
  }

  /** Time derivative of state u, written into out. */
  deriv(u: Float64Array, out: Float64Array): void {
    const [wx, wy, wz] = this.W;
    const g = this.p.g;
    const x = u[0], y = u[1], z = u[2], vx = u[3], vy = u[4], vz = u[5];
    // Coriolis: -2 W×v
    let ax = -2 * (wy * vz - wz * vy);
    let ay = -2 * (wz * vx - wx * vz);
    let az = -2 * (wx * vy - wy * vx) - g;
    // Centrifugal: -W×(W×r) = W² r - W (W·r)
    const w2 = wx * wx + wy * wy + wz * wz;
    const wr = wx * x + wy * y + wz * z;
    ax += w2 * x - wx * wr;
    ay += w2 * y - wy * wr;
    az += w2 * z - wz * wr;
    // Wire tension: pick λ so that v·v + r·a = 0 (keeps |r| fixed).
    const rr = x * x + y * y + z * z;
    const lam = -(vx * vx + vy * vy + vz * vz + x * ax + y * ay + z * az) / rr;
    out[0] = vx;
    out[1] = vy;
    out[2] = vz;
    out[3] = ax + lam * x;
    out[4] = ay + lam * y;
    out[5] = az + lam * z;
  }

  step(h: number): void {
    const { s, k1, k2, k3, k4, tmp } = this;
    this.deriv(s, k1);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
    this.deriv(tmp, k2);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
    this.deriv(tmp, k3);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + h * k3[i];
    this.deriv(tmp, k4);
    for (let i = 0; i < 6; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    this.t += h;
    // Project back onto the constraint (|r| = L, r·v = 0) to stop slow drift.
    const r = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
    const f = this.p.L / r;
    s[0] *= f;
    s[1] *= f;
    s[2] *= f;
    const rv = (s[0] * s[3] + s[1] * s[4] + s[2] * s[5]) / (this.p.L * this.p.L);
    s[3] -= rv * s[0];
    s[4] -= rv * s[1];
    s[5] -= rv * s[2];
  }

  /** Jacobi integral per unit mass: ½v² + g z − ½|Ω×r|². Conserved in the rotating frame. */
  jacobi(): number {
    const [wx, wy, wz] = this.W;
    const s = this.s;
    const cx = wy * s[2] - wz * s[1];
    const cy = wz * s[0] - wx * s[2];
    const cz = wx * s[1] - wy * s[0];
    return 0.5 * (s[3] * s[3] + s[4] * s[4] + s[5] * s[5]) + this.p.g * s[2] - 0.5 * (cx * cx + cy * cy + cz * cz);
  }

  /**
   * Orientation of the swing plane (rad, in (-π/2, π/2], counterclockwise from east).
   * Uses the principal axis of A = ω₀² r r + u u for the horizontal motion, where u is the
   * velocity with the local vertical spin removed. For small swings A is exactly conserved in
   * the frame that does not turn about the vertical, so its axis is a clean instantaneous
   * measure of the plane.
   */
  planeAngle(): number {
    const s = this.s;
    const wz = this.W[2];
    const w02 = this.p.g / this.p.L;
    const ux = s[3] - wz * s[1];
    const uy = s[4] + wz * s[0];
    const axx = w02 * s[0] * s[0] + ux * ux;
    const ayy = w02 * s[1] * s[1] + uy * uy;
    const axy = w02 * s[0] * s[1] + ux * uy;
    return 0.5 * Math.atan2(2 * axy, axx - ayy);
  }
}

/** Unwraps the swing-plane angle (defined modulo π) into a continuous rotation. */
export class PlaneTracker {
  psi0 = 0;
  private prev = 0;
  /** Unwrapped angle change since reset (rad, counterclockwise positive). */
  total = 0;

  reset(psi: number): void {
    this.psi0 = psi;
    this.prev = psi;
    this.total = 0;
  }

  update(psi: number): number {
    let d = psi - this.prev;
    if (d > Math.PI / 2) d -= Math.PI;
    else if (d < -Math.PI / 2) d += Math.PI;
    this.total += d;
    this.prev = psi;
    return this.total;
  }
}

/** Integrate for `seconds` of simulated time and return the measured precession rate (rad/s). */
export function measureRate(p: FPParams, ampRad: number, seconds: number, h: number, az = 0): { rate: number; sim: FoucaultSim } {
  const sim = new FoucaultSim(p);
  sim.release(ampRad, az);
  const tr = new PlaneTracker();
  tr.reset(sim.planeAngle());
  const n = Math.round(seconds / h);
  for (let i = 0; i < n; i++) {
    sim.step(h);
    tr.update(sim.planeAngle());
  }
  return { rate: tr.total / sim.t, sim };
}
