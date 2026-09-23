// Torque-free rigid body (Euler's equations in the body frame) with a
// quaternion attitude, integrated together with classical RK4.
// Pure module: no DOM, no Three.js. Hot paths allocate nothing.
//
// Conventions
// - Body axes 1, 2, 3 are principal axes sorted so that I1 <= I2 <= I3.
// - State s = [w1, w2, w3, qw, qx, qy, qz]: body-frame angular velocity (rad/s)
//   and the unit quaternion that rotates body vectors into the world frame.

export type Vec3 = [number, number, number];
/** Principal moments [I1, I2, I3], sorted ascending. */
export type Inertia = Vec3;
export type State = Float64Array;

export const newState = (): State => new Float64Array(7);

/** Time derivative of the state. Writes into out. */
export function derivatives(I: Inertia, s: ArrayLike<number>, out: Float64Array): void {
  const w1 = s[0], w2 = s[1], w3 = s[2];
  const qw = s[3], qx = s[4], qy = s[5], qz = s[6];
  // Euler: I1 w1' = (I2 - I3) w2 w3, and cyclic.
  out[0] = ((I[1] - I[2]) * w2 * w3) / I[0];
  out[1] = ((I[2] - I[0]) * w3 * w1) / I[1];
  out[2] = ((I[0] - I[1]) * w1 * w2) / I[2];
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

  I: Inertia;

  constructor(I: Inertia) {
    this.I = I;
  }

  /** Advance s in place by h seconds, then renormalize the quaternion. */
  step(s: State, h: number): void {
    const { I, k1, k2, k3, k4, tmp } = this;
    derivatives(I, s, k1);
    for (let i = 0; i < 7; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
    derivatives(I, tmp, k2);
    for (let i = 0; i < 7; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
    derivatives(I, tmp, k3);
    for (let i = 0; i < 7; i++) tmp[i] = s[i] + h * k3[i];
    derivatives(I, tmp, k4);
    for (let i = 0; i < 7; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    const n = Math.hypot(s[3], s[4], s[5], s[6]);
    s[3] /= n; s[4] /= n; s[5] /= n; s[6] /= n;
  }
}

/** Rotational kinetic energy E = 1/2 sum I_i w_i^2. */
export function energy(I: Inertia, s: ArrayLike<number>): number {
  return 0.5 * (I[0] * s[0] * s[0] + I[1] * s[1] * s[1] + I[2] * s[2] * s[2]);
}

/** Body-frame angular momentum L_i = I_i w_i. */
export function angMomBody(I: Inertia, s: ArrayLike<number>, out: Vec3): Vec3 {
  out[0] = I[0] * s[0];
  out[1] = I[1] * s[1];
  out[2] = I[2] * s[2];
  return out;
}

/** |L|, identical in body and world frames. */
export function angMomMag(I: Inertia, s: ArrayLike<number>): number {
  return Math.hypot(I[0] * s[0], I[1] * s[1], I[2] * s[2]);
}

/** Rotate body vector v into the world frame with the state's quaternion. */
export function toWorld(s: ArrayLike<number>, vx: number, vy: number, vz: number, out: Vec3): Vec3 {
  const w = s[3], x = s[4], y = s[5], z = s[6];
  // v' = v + 2 w (u x v) + 2 u x (u x v), u = (x, y, z)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  out[0] = vx + w * tx + (y * tz - z * ty);
  out[1] = vy + w * ty + (z * tx - x * tz);
  out[2] = vz + w * tz + (x * ty - y * tx);
  return out;
}

/** World-frame angular momentum. Constant for a torque-free body. */
export function angMomWorld(I: Inertia, s: ArrayLike<number>, out: Vec3): Vec3 {
  return toWorld(s, I[0] * s[0], I[1] * s[1], I[2] * s[2], out);
}

/** World-frame angular velocity. */
export function omegaWorld(s: ArrayLike<number>, out: Vec3): Vec3 {
  return toWorld(s, s[0], s[1], s[2], out);
}

/**
 * Linearized behaviour of a small perturbation about steady spin Omega about
 * body axis k (0-based index). The perturbation obeys
 *   eps'' = Omega^2 (I_k - I_i)(I_j - I_k) / (I_i I_j) eps.
 * Returns the coefficient c / Omega^2. Positive means exponential growth.
 */
export function linearCoefficient(I: Inertia, axis: 0 | 1 | 2): number {
  const i = (axis + 1) % 3;
  const j = (axis + 2) % 3;
  return ((I[axis] - I[i]) * (I[j] - I[axis])) / (I[i] * I[j]);
}

/** Growth rate sigma = Omega sqrt((I2 - I1)(I3 - I2) / (I1 I3)) for the intermediate axis. */
export function sigma(I: Inertia, Omega: number): number {
  return Math.abs(Omega) * Math.sqrt(Math.max(0, ((I[1] - I[0]) * (I[2] - I[1])) / (I[0] * I[2])));
}

/** Wobble angular frequency for a stable axis (0 or 2), from the same linearization. */
export function wobbleRate(I: Inertia, axis: 0 | 1 | 2, Omega: number): number {
  return Math.abs(Omega) * Math.sqrt(Math.max(0, -linearCoefficient(I, axis)));
}

/** Complete elliptic integral of the first kind, K(k), from k' = sqrt(1 - k^2), via the AGM. */
export function ellipticKFromComplement(kp: number): number {
  let a = 1;
  let b = kp;
  for (let n = 0; n < 40 && Math.abs(a - b) > 1e-15 * a; n++) {
    const an = 0.5 * (a + b);
    b = Math.sqrt(a * b);
    a = an;
  }
  return Math.PI / (2 * a);
}

/**
 * Exact time between successive sign reversals of w2 (the "flips") for the
 * torque-free Euler top, from the Jacobi elliptic solution: T = 2 K(k) / p.
 * Requires I1 < I2 < I3. Returns Infinity on the separatrix.
 */
export function flipInterval(I: Inertia, s: ArrayLike<number>): number {
  const [I1, I2, I3] = I;
  const w1 = s[0], w2 = s[1], w3 = s[2];
  // Differences formed term by term to avoid cancellation near the separatrix.
  const L2m2EI1 = I2 * (I2 - I1) * w2 * w2 + I3 * (I3 - I1) * w3 * w3; // L^2 - 2E I1
  const twoEI3mL2 = I1 * (I3 - I1) * w1 * w1 + I2 * (I3 - I2) * w2 * w2; // 2E I3 - L^2
  const L2m2EI2 = I1 * (I1 - I2) * w1 * w1 + I3 * (I3 - I2) * w3 * w3; // L^2 - 2E I2
  let p: number;
  let kp2: number;
  if (L2m2EI2 > 0) {
    // Polhode circles axis 3.
    p = Math.sqrt(((I3 - I2) * L2m2EI1) / (I1 * I2 * I3));
    kp2 = ((I3 - I1) * L2m2EI2) / ((I3 - I2) * L2m2EI1);
  } else if (L2m2EI2 < 0) {
    // Polhode circles axis 1.
    p = Math.sqrt(((I2 - I1) * twoEI3mL2) / (I1 * I2 * I3));
    kp2 = ((I3 - I1) * -L2m2EI2) / ((I2 - I1) * twoEI3mL2);
  } else return Infinity;
  if (!(p > 0) || !(kp2 > 0)) return Infinity;
  return (2 * ellipticKFromComplement(Math.sqrt(Math.min(1, kp2)))) / p;
}

/**
 * Initial state: spin Omega about body axis k (0-based), with a perturbation
 * eps * Omega added to both other body components. The attitude is chosen so
 * that the world angular momentum points along world +y.
 */
export function initialState(I: Inertia, axis: 0 | 1 | 2, Omega: number, eps: number, out: State): State {
  out[0] = out[1] = out[2] = eps * Omega;
  out[axis] = Omega;
  const Lx = I[0] * out[0], Ly = I[1] * out[1], Lz = I[2] * out[2];
  const n = Math.hypot(Lx, Ly, Lz);
  // Shortest rotation taking unit vector a = L/|L| to b = (0, 1, 0).
  const ax = Lx / n, ay = Ly / n, az = Lz / n;
  // q = (1 + a.b, a x b) normalized
  let qw = 1 + ay;
  let qx = -az; // a x b = (ay*0 - az*1, az*0 - ax*0, ax*1 - ay*0)
  let qy = 0;
  let qz = ax;
  if (qw < 1e-9) { qw = 0; qx = 1; qy = 0; qz = 0; } // a = -y: half turn about x
  const qn = Math.hypot(qw, qx, qy, qz);
  out[3] = qw / qn; out[4] = qx / qn; out[5] = qy / qn; out[6] = qz / qn;
  return out;
}

// ---------------------------------------------------------------------------
// Inertia from shape: bodies built from simple solid parts.

export type Part =
  | { kind: 'box'; m: number; c: Vec3; size: Vec3; color?: number }
  | { kind: 'cyl'; m: number; c: Vec3; axis: 0 | 1 | 2; r: number; len: number; color?: number }
  /** Thin elliptical hoop in the xy plane, uniform mass per unit length. */
  | { kind: 'hoop'; m: number; c: Vec3; ax: number; ay: number; tube: number; color?: number }
  /** Thin uniform elliptical sheet in the xy plane (racket strings). */
  | { kind: 'sheet'; m: number; c: Vec3; ax: number; ay: number; color?: number };

export interface MassProps {
  mass: number;
  com: Vec3;
  /** Full inertia tensor about the COM, row-major 3x3. */
  tensor: number[];
  /** Diagonal moments in the shape frame. */
  diag: Vec3;
  /** Shape-frame axis index for body axis 1, 2, 3 (ascending moment). */
  order: [number, number, number];
  /** Principal moments sorted ascending, i.e. [I1, I2, I3]. */
  I: Inertia;
}

/** Second moments <x^2>, <y^2> of a uniform elliptical hoop, weighting by arc length. */
export function hoopMoments(ax: number, ay: number, n = 720): [number, number] {
  let wsum = 0, xx = 0, yy = 0;
  for (let k = 0; k < n; k++) {
    const th = ((k + 0.5) / n) * 2 * Math.PI;
    const x = ax * Math.cos(th);
    const y = ay * Math.sin(th);
    const w = Math.hypot(ax * Math.sin(th), ay * Math.cos(th)); // ds/dtheta
    wsum += w; xx += w * x * x; yy += w * y * y;
  }
  return [xx / wsum, yy / wsum];
}

/** Inertia tensor of one part about its own centre, shape axes. Diagonal for these shapes. */
export function partDiag(p: Part): Vec3 {
  switch (p.kind) {
    case 'box': {
      const [a, b, c] = p.size;
      return [(p.m * (b * b + c * c)) / 12, (p.m * (a * a + c * c)) / 12, (p.m * (a * a + b * b)) / 12];
    }
    case 'cyl': {
      const ax = (p.m * p.r * p.r) / 2;
      const perp = (p.m * (3 * p.r * p.r + p.len * p.len)) / 12;
      const d: Vec3 = [perp, perp, perp];
      d[p.axis] = ax;
      return d;
    }
    case 'hoop': {
      const [xx, yy] = hoopMoments(p.ax, p.ay);
      return [p.m * yy, p.m * xx, p.m * (xx + yy)];
    }
    case 'sheet': {
      const xx = (p.ax * p.ax) / 4;
      const yy = (p.ay * p.ay) / 4;
      return [p.m * yy, p.m * xx, p.m * (xx + yy)];
    }
  }
}

/** Mass, centre of mass and inertia tensor of a body made of parts (parallel-axis theorem). */
export function massProps(parts: Part[]): MassProps {
  let M = 0;
  const com: Vec3 = [0, 0, 0];
  for (const p of parts) {
    M += p.m;
    for (let i = 0; i < 3; i++) com[i] += p.m * p.c[i];
  }
  for (let i = 0; i < 3; i++) com[i] /= M;
  const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of parts) {
    const d = partDiag(p);
    const r = [p.c[0] - com[0], p.c[1] - com[1], p.c[2] - com[2]];
    const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        T[i * 3 + j] += (i === j ? d[i] + p.m * r2 : 0) - p.m * r[i] * r[j];
      }
    }
  }
  const diag: Vec3 = [T[0], T[4], T[8]];
  const order = [0, 1, 2].sort((a, b) => diag[a] - diag[b]) as [number, number, number];
  return { mass: M, com, tensor: T, diag, order, I: [diag[order[0]], diag[order[1]], diag[order[2]]] };
}

/** Uniform box whose principal moments are I (needs I3 <= I1 + I2). Returns edge lengths along axes 1, 2, 3 for unit mass. */
export function boxForInertia(I: Inertia): Vec3 {
  const [I1, I2, I3] = I;
  return [
    Math.sqrt(Math.max(0, 6 * (I2 + I3 - I1))),
    Math.sqrt(Math.max(0, 6 * (I1 + I3 - I2))),
    Math.sqrt(Math.max(0, 6 * (I1 + I2 - I3))),
  ];
}

// Preset shapes, in metres and kilograms (steel for the metal parts).
const STEEL = 7850;
const cylMass = (r: number, len: number, rho: number) => Math.PI * r * r * len * rho;

export type PresetId = 'thandle' | 'wingnut' | 'phone' | 'racket' | 'custom';

export function presetParts(id: Exclude<PresetId, 'custom'>): Part[] {
  switch (id) {
    case 'thandle': {
      // Crossbar along x, short stem along -y hanging from its middle.
      const r = 0.006;
      const bar = { len: 0.16 };
      const stem = { len: 0.06, r: 0.008 };
      return [
        { kind: 'cyl', m: cylMass(r, bar.len, STEEL), c: [0, 0, 0], axis: 0, r, len: bar.len, color: 0xc9d3e6 },
        { kind: 'cyl', m: cylMass(stem.r, stem.len, STEEL), c: [0, -r - stem.len / 2, 0], axis: 1, r: stem.r, len: stem.len, color: 0x8a96b0 },
      ];
    }
    case 'wingnut': {
      // Round hub along y with two flat wings in the xy plane.
      const hub = { r: 0.007, len: 0.012 };
      const wing: Vec3 = [0.013, 0.011, 0.0022];
      const wm = wing[0] * wing[1] * wing[2] * STEEL;
      const wx = hub.r + wing[0] / 2 - 0.001;
      return [
        { kind: 'cyl', m: cylMass(hub.r, hub.len, STEEL), c: [0, 0, 0], axis: 1, r: hub.r, len: hub.len, color: 0x8a96b0 },
        { kind: 'box', m: wm, c: [wx, 0.002, 0], size: wing, color: 0xc9d3e6 },
        { kind: 'box', m: wm, c: [-wx, 0.002, 0], size: wing, color: 0xc9d3e6 },
      ];
    }
    case 'phone':
      // A 147 x 71.5 x 7.8 mm slab, uniform density.
      return [{ kind: 'box', m: 0.17, c: [0, 0, 0], size: [0.0715, 0.147, 0.0078], color: 0x2a3348 }];
    case 'racket':
      // 300 g racket: handle, throat, head frame and strings.
      return [
        { kind: 'cyl', m: 0.1, c: [0, -0.2, 0], axis: 1, r: 0.015, len: 0.2, color: 0x3a4660 },
        { kind: 'cyl', m: 0.04, c: [0, -0.04, 0], axis: 1, r: 0.008, len: 0.12, color: 0xc9d3e6 },
        { kind: 'hoop', m: 0.14, c: [0, 0.18, 0], ax: 0.125, ay: 0.16, tube: 0.008, color: 0xf472b6 },
        { kind: 'sheet', m: 0.02, c: [0, 0.18, 0], ax: 0.12, ay: 0.155, color: 0xdfe6f3 },
      ];
  }
}

/** Custom moments: I1 = 1, I3 = r3 (<= 2 keeps a real box possible), I2 at fraction f between them. */
export function customInertia(r3: number, f: number): Inertia {
  return [1, 1 + f * (r3 - 1), r3];
}
