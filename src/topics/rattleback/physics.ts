// Rattleback (celt): a rigid semi-ellipsoid rolling without slipping on a
// horizontal table. Full nonlinear nonholonomic model, in the Newton-Euler form
// used by Kane and Levinson (1982) and Lindberg and Longman (1983): the contact
// force is eliminated between Newton's law for the centre of mass and Euler's
// law about it, with the no-slip condition v_cm = r x w.
// Pure module: no DOM, no Three.js. Hot paths allocate nothing.
//
// Conventions
// - Body frame is attached at the centre of mass G. Body x runs along the
//   length (semi-axis a), y across the width (semi-axis b), z up through the
//   flat top (the curved bottom has semi-axis c).
// - The flat top's centre O sits hc = 3c/8 above G (solid semi-ellipsoid).
// - The inertia principal axes are turned by the skew angle delta about body z
//   relative to the geometric (curvature) axes x, y.
// - World frame is z-up and the table is z = 0.
// - State s = [wx, wy, wz, qw, qx, qy, qz, X, Y, Z]: body angular velocity,
//   the unit quaternion taking body vectors to world, and the world position of G.

export type Vec3 = [number, number, number];
export type State = Float64Array;
export const NS = 10;

export interface RBParams {
  /** Half length (m). */
  a: number;
  /** Half width (m). */
  b: number;
  /** Depth of the curved bottom (m). */
  c: number;
  /** Mass (kg). */
  m: number;
  /** Gravity (m/s^2). */
  g: number;
  /** Skew angle between inertia axes and curvature axes (rad). */
  delta: number;
  /** Viscous resistance coefficient for a friction-like couple -mu w (N m s). 0 = conservative. */
  mu: number;
}

export interface Body {
  p: RBParams;
  /** Inertia about G in the body frame, row-major 3x3. */
  I: Float64Array;
  /** Principal moments before skewing: about x, y, z. */
  A: number;
  B: number;
  C: number;
  /** Height of the flat-top centre above G. */
  hc: number;
  /** Height of G above the table at rest. */
  h0: number;
  /** Radii of curvature at the bottom point: along the length, across the width. */
  R1: number;
  R2: number;
}

export const DEFAULT: RBParams = { a: 0.1, b: 0.02, c: 0.016, m: 0.2, g: 9.81, delta: 0.1, mu: 0 };

/** Build inertia and geometry for a solid semi-ellipsoid with a skewed inertia tensor. */
export function makeBody(p: RBParams): Body {
  const { a, b, c, m, delta } = p;
  const hc = (3 * c) / 8;
  // Solid semi-ellipsoid: moments about the flat-face centre equal those of the full ellipsoid.
  const A = (m * (b * b + c * c)) / 5 - m * hc * hc;
  const B = (m * (a * a + c * c)) / 5 - m * hc * hc;
  const C = (m * (a * a + b * b)) / 5;
  const cs = Math.cos(delta), sn = Math.sin(delta);
  // Principal axis 1 (moment A) sits at angle delta from body x, in the table plane.
  const Ixx = A * cs * cs + B * sn * sn;
  const Iyy = A * sn * sn + B * cs * cs;
  const Ixy = (A - B) * sn * cs;
  const I = new Float64Array([Ixx, Ixy, 0, Ixy, Iyy, 0, 0, 0, C]);
  return { p, I, A, B, C, hc, h0: c - hc, R1: (a * a) / c, R2: (b * b) / c };
}

/**
 * Vector from G to the contact point, in body axes, given the world up vector gm in body axes.
 * The ellipsoid point with outward normal -gm is O - D gm / sqrt(gm . D gm), D = diag(a^2, b^2, c^2).
 */
export function contactVec(body: Body, gx: number, gy: number, gz: number, out: Float64Array | number[]): void {
  const { a, b, c } = body.p;
  const dx = a * a * gx, dy = b * b * gy, dz = c * c * gz;
  const s = Math.sqrt(gx * dx + gy * dy + gz * dz);
  out[0] = -dx / s;
  out[1] = -dy / s;
  out[2] = body.hc - dz / s;
}

// Scratch for the hot path.
const R = new Float64Array(3);
const M = new Float64Array(9);
const RHS = new Float64Array(3);

/** Solve the symmetric 3x3 system M x = b (Cramer). Writes x into b. */
function solve3(m: Float64Array, b: Float64Array): void {
  const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[3], a11 = m[4], a12 = m[5], a20 = m[6], a21 = m[7], a22 = m[8];
  const c00 = a11 * a22 - a12 * a21;
  const c01 = a12 * a20 - a10 * a22;
  const c02 = a10 * a21 - a11 * a20;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  const b0 = b[0], b1 = b[1], b2 = b[2];
  b[0] = (b0 * c00 + b1 * (a02 * a21 - a01 * a22) + b2 * (a01 * a12 - a02 * a11)) / det;
  b[1] = (b0 * c01 + b1 * (a00 * a22 - a02 * a20) + b2 * (a02 * a10 - a00 * a12)) / det;
  b[2] = (b0 * c02 + b1 * (a01 * a20 - a00 * a21) + b2 * (a00 * a11 - a01 * a10)) / det;
}

/** World up expressed in body axes, from the quaternion in s. */
export function upInBody(s: ArrayLike<number>, out: Float64Array | number[]): void {
  const qw = s[3], qx = s[4], qy = s[5], qz = s[6];
  out[0] = 2 * (qx * qz - qw * qy);
  out[1] = 2 * (qy * qz + qw * qx);
  out[2] = 1 - 2 * (qx * qx + qy * qy);
}

const GM = new Float64Array(3);

/**
 * Angular acceleration for body rate w and up vector gm (both body axes). Writes into out.
 * M(r) w' = -w x I w + m r x (r' x w + w x (r x w) + g gm) - mu w,  M = I + m(|r|^2 1 - r r^T).
 */
export function angAccel(body: Body, wx: number, wy: number, wz: number, gx: number, gy: number, gz: number, out: Float64Array): void {
  const { m, g, mu, a, b, c } = body.p;
  const I = body.I;
  contactVec(body, gx, gy, gz, R);
  const rx = R[0], ry = R[1], rz = R[2];
  // gm' = gm x w
  const gdx = gy * wz - gz * wy;
  const gdy = gz * wx - gx * wz;
  const gdz = gx * wy - gy * wx;
  // r' = -(D gm')/s + (D gm)(gm . D gm')/s^3
  const Dx = a * a, Dy = b * b, Dz = c * c;
  const s2 = gx * Dx * gx + gy * Dy * gy + gz * Dz * gz;
  const s = Math.sqrt(s2);
  const k = (gx * Dx * gdx + gy * Dy * gdy + gz * Dz * gdz) / (s2 * s);
  const rdx = (-Dx * gdx) / s + Dx * gx * k;
  const rdy = (-Dy * gdy) / s + Dy * gy * k;
  const rdz = (-Dz * gdz) / s + Dz * gz * k;
  // I w
  const Lx = I[0] * wx + I[1] * wy + I[2] * wz;
  const Ly = I[3] * wx + I[4] * wy + I[5] * wz;
  const Lz = I[6] * wx + I[7] * wy + I[8] * wz;
  // v = r x w (velocity of G)
  const vx = ry * wz - rz * wy;
  const vy = rz * wx - rx * wz;
  const vz = rx * wy - ry * wx;
  // u = r' x w + w x v + g gm
  const ux = rdy * wz - rdz * wy + (wy * vz - wz * vy) + g * gx;
  const uy = rdz * wx - rdx * wz + (wz * vx - wx * vz) + g * gy;
  const uz = rdx * wy - rdy * wx + (wx * vy - wy * vx) + g * gz;
  RHS[0] = -(wy * Lz - wz * Ly) + m * (ry * uz - rz * uy) - mu * wx;
  RHS[1] = -(wz * Lx - wx * Lz) + m * (rz * ux - rx * uz) - mu * wy;
  RHS[2] = -(wx * Ly - wy * Lx) + m * (rx * uy - ry * ux) - mu * wz;
  const r2 = rx * rx + ry * ry + rz * rz;
  M[0] = I[0] + m * (r2 - rx * rx); M[1] = I[1] - m * rx * ry; M[2] = I[2] - m * rx * rz;
  M[3] = I[3] - m * ry * rx; M[4] = I[4] + m * (r2 - ry * ry); M[5] = I[5] - m * ry * rz;
  M[6] = I[6] - m * rz * rx; M[7] = I[7] - m * rz * ry; M[8] = I[8] + m * (r2 - rz * rz);
  solve3(M, RHS);
  out[0] = RHS[0];
  out[1] = RHS[1];
  out[2] = RHS[2];
}

const AA = new Float64Array(3);

/** Time derivative of the full state. Writes into out. */
export function derivatives(body: Body, s: ArrayLike<number>, out: Float64Array): void {
  const wx = s[0], wy = s[1], wz = s[2];
  const qw = s[3], qx = s[4], qy = s[5], qz = s[6];
  upInBody(s, GM);
  angAccel(body, wx, wy, wz, GM[0], GM[1], GM[2], AA);
  out[0] = AA[0];
  out[1] = AA[1];
  out[2] = AA[2];
  out[3] = 0.5 * (-qx * wx - qy * wy - qz * wz);
  out[4] = 0.5 * (qw * wx + qy * wz - qz * wy);
  out[5] = 0.5 * (qw * wy + qz * wx - qx * wz);
  out[6] = 0.5 * (qw * wz + qx * wy - qy * wx);
  // v_G = r x w in body axes (contactVec was left in R by angAccel), rotated to world.
  const vx = R[1] * wz - R[2] * wy;
  const vy = R[2] * wx - R[0] * wz;
  const vz = R[0] * wy - R[1] * wx;
  rotate(qw, qx, qy, qz, vx, vy, vz, out, 7);
}

/** Rotate body vector v by the quaternion into world axes; write to out[o..o+2]. */
function rotate(qw: number, qx: number, qy: number, qz: number, vx: number, vy: number, vz: number, out: Float64Array | number[], o: number): void {
  out[o] = (1 - 2 * (qy * qy + qz * qz)) * vx + 2 * (qx * qy - qw * qz) * vy + 2 * (qx * qz + qw * qy) * vz;
  out[o + 1] = 2 * (qx * qy + qw * qz) * vx + (1 - 2 * (qx * qx + qz * qz)) * vy + 2 * (qy * qz - qw * qx) * vz;
  out[o + 2] = 2 * (qx * qz - qw * qy) * vx + 2 * (qy * qz + qw * qx) * vy + (1 - 2 * (qx * qx + qy * qy)) * vz;
}

export function toWorld(s: ArrayLike<number>, vx: number, vy: number, vz: number, out: Float64Array | number[]): void {
  rotate(s[3], s[4], s[5], s[6], vx, vy, vz, out, 0);
}

/** RK4 stepper with preallocated scratch buffers. */
export class Integrator {
  private k1 = new Float64Array(NS);
  private k2 = new Float64Array(NS);
  private k3 = new Float64Array(NS);
  private k4 = new Float64Array(NS);
  private tmp = new Float64Array(NS);
  renormalize = true;
  body: Body;
  constructor(body: Body) {
    this.body = body;
  }

  step(s: Float64Array, h: number): void {
    const { k1, k2, k3, k4, tmp, body } = this;
    derivatives(body, s, k1);
    for (let i = 0; i < NS; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
    derivatives(body, tmp, k2);
    for (let i = 0; i < NS; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
    derivatives(body, tmp, k3);
    for (let i = 0; i < NS; i++) tmp[i] = s[i] + h * k3[i];
    derivatives(body, tmp, k4);
    for (let i = 0; i < NS; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    if (this.renormalize) {
      const n = Math.hypot(s[3], s[4], s[5], s[6]);
      s[3] /= n; s[4] /= n; s[5] /= n; s[6] /= n;
    }
  }
}

export const newState = (): State => new Float64Array(NS);

const G2 = new Float64Array(3);
const R2v = new Float64Array(3);

/** Total mechanical energy (kinetic + gravitational, table level = 0). */
export function energy(body: Body, s: ArrayLike<number>): number {
  const { m, g } = body.p;
  const I = body.I;
  const wx = s[0], wy = s[1], wz = s[2];
  upInBody(s, G2);
  contactVec(body, G2[0], G2[1], G2[2], R2v);
  const rx = R2v[0], ry = R2v[1], rz = R2v[2];
  const vx = ry * wz - rz * wy, vy = rz * wx - rx * wz, vz = rx * wy - ry * wx;
  const rot = 0.5 * (wx * (I[0] * wx + I[1] * wy) + wy * (I[3] * wx + I[4] * wy) + I[8] * wz * wz);
  const height = -(rx * G2[0] + ry * G2[1] + rz * G2[2]);
  return rot + 0.5 * m * (vx * vx + vy * vy + vz * vz) + m * g * height;
}

/** Height of G above the table implied by the attitude alone (the holonomic part of the contact). */
export function heightFromAttitude(body: Body, s: ArrayLike<number>): number {
  upInBody(s, G2);
  contactVec(body, G2[0], G2[1], G2[2], R2v);
  return -(R2v[0] * G2[0] + R2v[1] * G2[1] + R2v[2] * G2[2]);
}

/** Spin about the world vertical, w . up (rad/s). Positive = counterclockwise seen from above. */
export function spin(s: ArrayLike<number>): number {
  upInBody(s, G2);
  return s[0] * G2[0] + s[1] * G2[1] + s[2] * G2[2];
}

/**
 * Pitch and roll angles (rad) of the body, from the up vector.
 * Pitch: rotation that lifts the ends (about the width axis). Roll: side-to-side rocking (about the length).
 */
export function pitchRoll(s: ArrayLike<number>, out: Float64Array | number[]): void {
  upInBody(s, G2);
  out[0] = Math.asin(Math.max(-1, Math.min(1, -G2[0])));
  out[1] = Math.asin(Math.max(-1, Math.min(1, G2[1])));
}

/** Heading of the body x axis in the table plane (rad). */
export function heading(s: ArrayLike<number>): number {
  const qw = s[3], qx = s[4], qy = s[5], qz = s[6];
  return Math.atan2(2 * (qx * qy + qw * qz), 1 - 2 * (qy * qy + qz * qz));
}

/**
 * Start resting on the table, spinning at n about the vertical, with a small wobble:
 * body rates wp (pitch, about y) and wr (roll, about x) added.
 */
export function initialState(body: Body, n: number, wp: number, wr: number, out: State): State {
  out[0] = wr;
  out[1] = wp;
  out[2] = n;
  out[3] = 1; out[4] = 0; out[5] = 0; out[6] = 0;
  out[7] = 0; out[8] = 0; out[9] = body.h0;
  return out;
}

// ---------- Linear stability of steady spin ----------

const JAC = new Float64Array(16);
const OUTP = new Float64Array(3);
const OUTM = new Float64Array(3);

/**
 * 4x4 linearization about steady spin n (state [wx, wy, gx, gy]), built by central differences
 * of the full equations. Row-major in out.
 */
export function linearize(body: Body, n: number, out: Float64Array = JAC): Float64Array {
  const e = 1e-7;
  for (let j = 0; j < 4; j++) {
    const d = [0, 0, 0, 0];
    d[j] = e;
    const wx = d[0], wy = d[1], gx = d[2], gy = d[3];
    angAccel(body, wx, wy, n, gx, gy, 1, OUTP);
    angAccel(body, -wx, -wy, n, -gx, -gy, 1, OUTM);
    out[0 * 4 + j] = (OUTP[0] - OUTM[0]) / (2 * e);
    out[1 * 4 + j] = (OUTP[1] - OUTM[1]) / (2 * e);
    // gm' = gm x w, linear part with gm = (gx, gy, 1), w = (wx, wy, n)
    // gx' = gy n - wy, gy' = wx - gx n
    out[2 * 4 + j] = gy * n / e - wy / e;
    out[3 * 4 + j] = wx / e - gx * n / e;
  }
  return out;
}

export interface Mode {
  re: number;
  im: number;
}

/** Eigenvalues of a real 4x4 matrix (Faddeev-LeVerrier + Durand-Kerner). */
export function eig4(A: Float64Array): Mode[] {
  // Characteristic polynomial lambda^4 + c1 lambda^3 + ... + c4.
  const n = 4;
  let Mk = new Float64Array(16);
  const c = [1, 0, 0, 0, 0];
  const AM = new Float64Array(16);
  for (let k = 1; k <= n; k++) {
    // Mk = A M_{k-1} + c_{k-1} I, with M_0 = 0
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let l = 0; l < 4; l++) sum += A[i * 4 + l] * Mk[l * 4 + j];
      AM[i * 4 + j] = sum + (i === j ? c[k - 1] : 0);
    }
    Mk = Float64Array.from(AM);
    let tr = 0;
    for (let i = 0; i < 4; i++) {
      let sum = 0;
      for (let l = 0; l < 4; l++) sum += A[i * 4 + l] * Mk[l * 4 + i];
      tr += sum;
    }
    c[k] = -tr / k;
  }
  // Durand-Kerner on the monic quartic.
  const scale = Math.max(1, ...c.slice(1).map((x, i) => Math.pow(Math.abs(x), 1 / (i + 1))));
  const zr = [0, 0, 0, 0], zi = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const th = (2 * Math.PI * i) / 4 + 0.4;
    zr[i] = scale * Math.cos(th);
    zi[i] = scale * Math.sin(th);
  }
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    for (let i = 0; i < 4; i++) {
      // p(z)
      let pr = 1, pi = 0;
      for (let k = 1; k <= 4; k++) {
        const nr = pr * zr[i] - pi * zi[i] + c[k];
        const ni = pr * zi[i] + pi * zr[i];
        pr = nr; pi = ni;
      }
      let qr = 1, qi = 0;
      for (let j = 0; j < 4; j++) {
        if (j === i) continue;
        const dr = zr[i] - zr[j], di = zi[i] - zi[j];
        const nr = qr * dr - qi * di;
        const ni = qr * di + qi * dr;
        qr = nr; qi = ni;
      }
      const den = qr * qr + qi * qi;
      const wr = (pr * qr + pi * qi) / den;
      const wi = (pi * qr - pr * qi) / den;
      zr[i] -= wr;
      zi[i] -= wi;
      moved = Math.max(moved, Math.hypot(wr, wi));
    }
    if (moved < 1e-13 * scale) break;
  }
  return zr.map((r, i) => ({ re: r, im: zi[i] }));
}

/** Small-oscillation frequencies (rad/s) with no spin: pitch-like (higher) and roll-like, from det(K - w^2 J) = 0. */
export function restFrequencies(body: Body): { pitch: number; roll: number } {
  const { m, g } = body.p;
  const J1 = body.I[0] + m * body.h0 * body.h0;
  const J2 = body.I[4] + m * body.h0 * body.h0;
  const Jxy = body.I[1];
  const k2 = m * g * (body.R2 - body.h0); // roll stiffness (rocking about the length)
  const k1 = m * g * (body.R1 - body.h0); // pitch stiffness (rocking about the width)
  // (k2 - x J1)(k1 - x J2) - x^2 Jxy^2 = 0, x = w^2
  const qa = J1 * J2 - Jxy * Jxy;
  const qb = -(k2 * J2 + k1 * J1);
  const qc = k1 * k2;
  const disc = Math.sqrt(qb * qb - 4 * qa * qc);
  const x1 = (-qb + disc) / (2 * qa);
  const x2 = (-qb - disc) / (2 * qa);
  const uncoupledPitch = k1 / J2;
  const uncoupledRoll = k2 / J1;
  // Assign by closeness to the uncoupled values.
  const pitchFirst = Math.abs(x1 - uncoupledPitch) + Math.abs(x2 - uncoupledRoll) < Math.abs(x2 - uncoupledPitch) + Math.abs(x1 - uncoupledRoll);
  return pitchFirst ? { pitch: Math.sqrt(x1), roll: Math.sqrt(x2) } : { pitch: Math.sqrt(x2), roll: Math.sqrt(x1) };
}

/**
 * Growth rates (1/s) of the pitch-like and roll-like modes for steady spin n.
 * Positive means that mode grows and feeds on the spin.
 */
export function growthRates(body: Body, n: number): { pitch: number; roll: number; wPitch: number; wRoll: number } {
  const ev = eig4(linearize(body, n));
  const f = restFrequencies(body);
  // Take the eigenvalues with positive imaginary part.
  const pos = ev.filter((e) => e.im > 0).sort((u, v) => u.im - v.im);
  if (pos.length < 2) return { pitch: 0, roll: 0, wPitch: f.pitch, wRoll: f.roll };
  const lo = pos[0], hi = pos[pos.length - 1];
  const pitchIsHi = f.pitch > f.roll;
  const P = pitchIsHi ? hi : lo;
  const Rr = pitchIsHi ? lo : hi;
  return { pitch: P.re, roll: Rr.re, wPitch: P.im, wRoll: Rr.im };
}

/** Result of a headless run: the first spin reversal time (Infinity if none). */
export function reversalTime(body: Body, n0: number, wp: number, wr: number, tMax: number, h = 5e-4): { t: number; finalSpin: number; minSpin: number; maxSpin: number } {
  const s = initialState(body, n0, wp, wr, newState());
  const integ = new Integrator(body);
  const det = new ReversalDetector();
  det.reset(n0);
  let t = 0;
  let mn = Infinity, mx = -Infinity;
  while (t < tMax) {
    integ.step(s, h);
    t += h;
    const w = spin(s);
    det.push(w, h, t);
    if (det.smooth < mn) mn = det.smooth;
    if (det.smooth > mx) mx = det.smooth;
    if (det.reversed) break;
  }
  return { t: det.reversed ? det.tReverse : Infinity, finalSpin: det.smooth, minSpin: mn, maxSpin: mx };
}

/**
 * Detects a spin reversal on a low-pass filtered spin signal (the raw spin also wobbles at
 * the rocking frequency). Reversal = smoothed spin crosses zero and then reaches
 * 20% of the starting spin with the opposite sign. The recorded time is the zero crossing.
 */
export class ReversalDetector {
  smooth = 0;
  sign0 = 0;
  n0 = 0;
  reversed = false;
  tReverse = 0;
  private tCross = -1;
  tau = 0.15;
  reset(n0: number): void {
    this.smooth = n0;
    this.n0 = n0;
    this.sign0 = Math.sign(n0);
    this.reversed = false;
    this.tReverse = 0;
    this.tCross = -1;
  }
  push(w: number, h: number, t: number): void {
    this.smooth += (w - this.smooth) * Math.min(1, h / this.tau);
    if (this.reversed || this.sign0 === 0) return;
    const u = this.smooth * this.sign0;
    if (u <= 0 && this.tCross < 0) this.tCross = t;
    if (u > 0) this.tCross = -1;
    if (this.tCross >= 0 && u < -0.2 * Math.abs(this.n0)) {
      this.reversed = true;
      this.tReverse = this.tCross;
    }
  }
}
