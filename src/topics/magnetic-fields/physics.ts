// Charged particles in magnetic fields: Lorentz force, Boris pusher, and the
// four field models (uniform B, crossed E and B, two-coil mirror, dipole).
// Pure math. No DOM, no Three.js. All quantities are in scaled units.

export type FieldKind = 'uniform' | 'crossed' | 'mirror' | 'dipole';

export interface FieldModel {
  kind: FieldKind;
  /** Uniform electric field (zero except in the crossed view). */
  E: Float64Array;
  /** Write B at (x, y, z) into out[0..2]. */
  b(x: number, y: number, z: number, out: Float64Array): void;
}

/** A particle: s = [x, y, z, vx, vy, vz], charge-to-mass ratio qm, own clock t. */
export interface Particle {
  s: Float64Array;
  qm: number;
  t: number;
  alive: boolean;
}

export function makeParticle(qm: number): Particle {
  return { s: new Float64Array(6), qm, t: 0, alive: true };
}

// ---------------------------------------------------------------- fields

export function uniformField(B: number, E = 0): FieldModel {
  const Ev = new Float64Array([0, E, 0]);
  return {
    kind: E !== 0 ? 'crossed' : 'uniform',
    E: Ev,
    b(_x, _y, _z, out) {
      out[0] = 0;
      out[1] = 0;
      out[2] = B;
    },
  };
}

/** Complete elliptic integrals K(m) and E(m), parameter m = k², by the AGM. */
export function ellipKE(m: number, out: Float64Array): void {
  let a = 1;
  let b = Math.sqrt(1 - m);
  let c = Math.sqrt(m);
  let pow = 0.5;
  let sum = pow * c * c;
  for (let i = 0; i < 40; i++) {
    const an = 0.5 * (a + b);
    const bn = Math.sqrt(a * b);
    c = 0.5 * (a - b);
    a = an;
    b = bn;
    pow *= 2;
    sum += pow * c * c;
    if (Math.abs(c) < 1e-17) break;
  }
  const K = Math.PI / (2 * a);
  out[0] = K;
  out[1] = K * (1 - sum);
}

const ke = new Float64Array(2);

/**
 * Field of a circular current loop of radius a centred on the z axis at height z0.
 * Units: mu0 I / pi = 1. Writes [B_rho, B_z] into out.
 */
export function loopField(a: number, z0: number, rho: number, z: number, out: Float64Array): void {
  const zz = z - z0;
  const r2 = rho * rho + zz * zz;
  const alpha2 = a * a + r2 - 2 * a * rho;
  const beta2 = a * a + r2 + 2 * a * rho;
  const beta = Math.sqrt(beta2);
  const m = 1 - alpha2 / beta2;
  ellipKE(m, ke);
  const K = ke[0];
  const E = ke[1];
  out[1] = ((a * a - r2) * E + alpha2 * K) / (2 * alpha2 * beta);
  out[0] = rho < 1e-12 ? 0 : (zz * ((a * a + r2) * E - alpha2 * K)) / (2 * alpha2 * beta * rho);
}

/** On-axis field of one loop in the same units. */
export function loopAxis(a: number, z: number): number {
  return (Math.PI * a * a) / (2 * Math.pow(a * a + z * z, 1.5));
}

export interface MirrorField extends FieldModel {
  /** Coil radius. */
  a: number;
  /** Coil half-separation: coils sit at z = ±d. */
  d: number;
  Bmin: number;
  Bmax: number;
  /** z of the on-axis field maximum (just inside each coil). */
  zMax: number;
  ratio: number;
  /** Loss-cone half-angle at the centre, radians. */
  lossCone: number;
  /** On-axis |B| at height z. */
  axis(z: number): number;
}

function mirrorAxisRaw(a: number, d: number, z: number): number {
  return loopAxis(a, z - d) + loopAxis(a, z + d);
}

function mirrorPeak(a: number, d: number): { z: number; B: number } {
  // Coarse scan then golden-section refine for the on-axis maximum with z >= 0.
  let bestZ = 0;
  let best = mirrorAxisRaw(a, d, 0);
  const zEnd = d + 2 * a;
  for (let i = 1; i <= 400; i++) {
    const z = (zEnd * i) / 400;
    const B = mirrorAxisRaw(a, d, z);
    if (B > best) {
      best = B;
      bestZ = z;
    }
  }
  let lo = Math.max(0, bestZ - zEnd / 400);
  let hi = bestZ + zEnd / 400;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 80; i++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (mirrorAxisRaw(a, d, m1) > mirrorAxisRaw(a, d, m2)) hi = m2;
    else lo = m1;
  }
  const z = 0.5 * (lo + hi);
  const B = Math.max(best, mirrorAxisRaw(a, d, z));
  return { z, B };
}

/**
 * Two coaxial loops at z = ±d, with radius chosen so the on-axis mirror ratio
 * Bmax / Bmin equals `ratio`. The field is scaled so |B(0)| = Bc.
 */
export function mirrorField(ratio: number, d: number, Bc: number): MirrorField {
  const R = Math.max(1.05, ratio);
  const ratioOf = (s: number) => {
    const a = d / s;
    return mirrorPeak(a, d).B / mirrorAxisRaw(a, d, 0);
  };
  let lo = 0.5;
  let hi = 8;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (ratioOf(mid) < R) lo = mid;
    else hi = mid;
  }
  const a = d / (0.5 * (lo + hi));
  const raw0 = mirrorAxisRaw(a, d, 0);
  const k = Bc / raw0;
  const peak = mirrorPeak(a, d);
  const Bmin = Bc;
  const Bmax = peak.B * k;
  const tmp = new Float64Array(2);
  return {
    kind: 'mirror',
    E: new Float64Array(3),
    a,
    d,
    Bmin,
    Bmax,
    zMax: peak.z,
    ratio: Bmax / Bmin,
    lossCone: Math.asin(Math.sqrt(Bmin / Bmax)),
    axis: (z) => k * mirrorAxisRaw(a, d, z),
    b(x, y, z, out) {
      const rho = Math.sqrt(x * x + y * y);
      loopField(a, d, rho, z, tmp);
      let br = tmp[0];
      let bz = tmp[1];
      loopField(a, -d, rho, z, tmp);
      br = (br + tmp[0]) * k;
      bz = (bz + tmp[1]) * k;
      if (rho > 1e-12) {
        out[0] = (br * x) / rho;
        out[1] = (br * y) / rho;
      } else {
        out[0] = 0;
        out[1] = 0;
      }
      out[2] = bz;
    },
  };
}

export interface DipoleField extends FieldModel {
  /** Planet radius in simulation units. */
  RE: number;
  /** Launch shell, in planet radii. */
  L: number;
  /** k = B_eq(r) r³. */
  k: number;
  lossCone: number;
  /** Magnetic latitude where the launch shell meets the surface, radians. */
  footLat: number;
}

/** Equatorial loss-cone angle for a dipole shell L, measured at the surface r = 1. */
export function dipoleLossCone(L: number): number {
  return Math.asin(Math.sqrt(1 / (L * L * L * Math.sqrt(4 - 3 / L))));
}

/** Latitude where the dipole shell L meets the surface: cos²λ = 1/L. */
export function dipoleFootLat(L: number): number {
  return Math.acos(Math.sqrt(1 / L));
}

/**
 * Earth-like dipole with the moment pointing along -z, so field lines leave the
 * southern hemisphere and enter the northern one. Bref is |B| at the equator of shell L.
 */
export function dipoleField(RE: number, L: number, Bref: number): DipoleField {
  const r0 = L * RE;
  const k = Bref * r0 * r0 * r0;
  return {
    kind: 'dipole',
    E: new Float64Array(3),
    RE,
    L,
    k,
    lossCone: dipoleLossCone(L),
    footLat: dipoleFootLat(L),
    b(x, y, z, out) {
      const r2 = x * x + y * y + z * z;
      const r = Math.sqrt(r2);
      const f = k / (r2 * r2 * r);
      out[0] = -3 * z * x * f;
      out[1] = -3 * z * y * f;
      out[2] = (r2 - 3 * z * z) * f;
    },
  };
}

// ---------------------------------------------------------------- integrator

const Bs = new Float64Array(3);

/**
 * One Boris step: half electric kick, exact-norm magnetic rotation, half kick, drift.
 * B must be the field at the current position. In a pure B field |v| is preserved to round-off.
 */
export function borisPush(p: Particle, E: Float64Array, B: Float64Array, dt: number): void {
  const s = p.s;
  const h = 0.5 * p.qm * dt;
  const vmx = s[3] + h * E[0];
  const vmy = s[4] + h * E[1];
  const vmz = s[5] + h * E[2];
  const tx = h * B[0];
  const ty = h * B[1];
  const tz = h * B[2];
  const f = 2 / (1 + tx * tx + ty * ty + tz * tz);
  const sx = f * tx;
  const sy = f * ty;
  const sz = f * tz;
  const px = vmx + (vmy * tz - vmz * ty);
  const py = vmy + (vmz * tx - vmx * tz);
  const pz = vmz + (vmx * ty - vmy * tx);
  const vx = vmx + (py * sz - pz * sy) + h * E[0];
  const vy = vmy + (pz * sx - px * sz) + h * E[1];
  const vz = vmz + (px * sy - py * sx) + h * E[2];
  s[3] = vx;
  s[4] = vy;
  s[5] = vz;
  s[0] += vx * dt;
  s[1] += vy * dt;
  s[2] += vz * dt;
  p.t += dt;
}

/** One Boris step of fixed size dt, evaluating B at the particle. */
export function stepFixed(p: Particle, f: FieldModel, dt: number): void {
  const s = p.s;
  f.b(s[0], s[1], s[2], Bs);
  borisPush(p, f.E, Bs, dt);
}

/**
 * Fixed step giving `stepsPerTurn` steps per gyration at the strongest field the
 * particle will meet, Btop. A fixed step keeps the leapfrog time-symmetric. Changing
 * dt from step to step breaks that symmetry and makes μ drift secularly.
 */
export function fixedDt(qm: number, Btop: number, stepsPerTurn: number): number {
  return (2 * Math.PI) / (Math.abs(qm) * Btop * stepsPerTurn);
}

/**
 * Advance one Boris step with dt = (local gyroperiod) / stepsPerTurn, capped at dtMax.
 * Handy for exploring, but see fixedDt: the scene uses fixed steps.
 * Returns the step used.
 */
export function step(p: Particle, f: FieldModel, stepsPerTurn: number, dtMax = Infinity): number {
  const s = p.s;
  f.b(s[0], s[1], s[2], Bs);
  const Bm = Math.hypot(Bs[0], Bs[1], Bs[2]);
  const w = Math.abs(p.qm) * Bm;
  const dt = w > 0 ? Math.min(dtMax, (2 * Math.PI) / (w * stepsPerTurn)) : dtMax;
  borisPush(p, f.E, Bs, dt);
  return dt;
}

// ---------------------------------------------------------------- formulas

/** Gyroradius r = m v⊥ / (|q| B), with qm = q/m. */
export const gyroRadius = (vPerp: number, qm: number, B: number) => vPerp / (Math.abs(qm) * B);
/** Gyroperiod T = 2π m / (|q| B). */
export const gyroPeriod = (qm: number, B: number) => (2 * Math.PI) / (Math.abs(qm) * B);

const bb = new Float64Array(3);
const bb2 = new Float64Array(3);

/** Magnetic moment per unit mass, μ/m = v⊥² / (2B), at the particle. */
export function magneticMoment(p: Particle, f: FieldModel): number {
  const s = p.s;
  f.b(s[0], s[1], s[2], bb);
  const B2 = bb[0] * bb[0] + bb[1] * bb[1] + bb[2] * bb[2];
  const B = Math.sqrt(B2);
  const vpar = (s[3] * bb[0] + s[4] * bb[1] + s[5] * bb[2]) / B;
  const v2 = s[3] * s[3] + s[4] * s[4] + s[5] * s[5];
  return (v2 - vpar * vpar) / (2 * B);
}

/** Velocity component along B at the particle. */
export function vParallel(p: Particle, f: FieldModel): number {
  const s = p.s;
  f.b(s[0], s[1], s[2], bb);
  const B = Math.hypot(bb[0], bb[1], bb[2]);
  return (s[3] * bb[0] + s[4] * bb[1] + s[5] * bb[2]) / B;
}

/**
 * Place a particle so its guiding centre is at gc. The velocity has speed `speed`,
 * pitch angle `pitch` to B, and its perpendicular part points along the unit
 * vector obtained by rotating e1 (projected perpendicular to B) by `phase` about B.
 */
export function launch(
  p: Particle,
  f: FieldModel,
  gc: [number, number, number],
  speed: number,
  pitch: number,
  phase: number,
  e1: [number, number, number],
): void {
  f.b(gc[0], gc[1], gc[2], bb);
  const B2 = bb[0] * bb[0] + bb[1] * bb[1] + bb[2] * bb[2];
  const B = Math.sqrt(B2);
  const bx = bb[0] / B;
  const by = bb[1] / B;
  const bz = bb[2] / B;
  // e1 perpendicular to b
  const dot = e1[0] * bx + e1[1] * by + e1[2] * bz;
  let ux = e1[0] - dot * bx;
  let uy = e1[1] - dot * by;
  let uz = e1[2] - dot * bz;
  const un = Math.hypot(ux, uy, uz) || 1;
  ux /= un;
  uy /= un;
  uz /= un;
  // e2 = b × e1
  const wx = by * uz - bz * uy;
  const wy = bz * ux - bx * uz;
  const wz = bx * uy - by * ux;
  const c = Math.cos(phase);
  const sn = Math.sin(phase);
  const px = c * ux + sn * wx;
  const py = c * uy + sn * wy;
  const pz = c * uz + sn * wz;
  const vperp = speed * Math.sin(pitch);
  const vpar = speed * Math.cos(pitch);
  const s = p.s;
  s[3] = vpar * bx + vperp * px;
  s[4] = vpar * by + vperp * py;
  s[5] = vpar * bz + vperp * pz;
  // In a non-uniform field, add the gradient-curvature drift of the guiding centre,
  // v_gc = (v∥² + v⊥²/2) (B × ∇B) / (qm B³) for a curl-free field. Then the pitch
  // angle describes the true gyration, not gyration plus drift.
  const hh = 1e-5 * Math.max(1, Math.hypot(gc[0], gc[1], gc[2]));
  const gB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const q0 = [gc[0], gc[1], gc[2]];
    const q1 = [gc[0], gc[1], gc[2]];
    q0[i] -= hh;
    q1[i] += hh;
    f.b(q1[0], q1[1], q1[2], bb2);
    const Bp = Math.hypot(bb2[0], bb2[1], bb2[2]);
    f.b(q0[0], q0[1], q0[2], bb2);
    const Bm = Math.hypot(bb2[0], bb2[1], bb2[2]);
    gB[i] = (Bp - Bm) / (2 * hh);
  }
  const kd = (vpar * vpar + 0.5 * vperp * vperp) / (p.qm * B2 * B);
  const gcx = kd * (bb[1] * gB[2] - bb[2] * gB[1]);
  const gcy = kd * (bb[2] * gB[0] - bb[0] * gB[2]);
  const gcz = kd * (bb[0] * gB[1] - bb[1] * gB[0]);
  s[3] += gcx;
  s[4] += gcy;
  s[5] += gcz;
  // Drift velocity E×B/B² and the gyration velocity u = v - vD.
  const E = f.E;
  const vdx = (E[1] * bb[2] - E[2] * bb[1]) / B2;
  const vdy = (E[2] * bb[0] - E[0] * bb[2]) / B2;
  const vdz = (E[0] * bb[1] - E[1] * bb[0]) / B2;
  const gx = s[3] - vdx - gcx;
  const gy = s[4] - vdy - gcy;
  const gz = s[5] - vdz - gcz;
  // x = gc - (u × B) / (qm B²)
  const k = 1 / (p.qm * B2);
  s[0] = gc[0] - k * (gy * bb[2] - gz * bb[1]);
  s[1] = gc[1] - k * (gz * bb[0] - gx * bb[2]);
  s[2] = gc[2] - k * (gx * bb[1] - gy * bb[0]);
  p.t = 0;
  p.alive = true;
}

// ---------------------------------------------------------------- meters

/**
 * Measures gyroradius, period and guiding-centre drift for a field along z.
 * Feed it after every step with u = v - vD (the gyration velocity).
 * A cycle ends each time u_x crosses zero going upward.
 */
export class GyroMeter {
  radius = NaN;
  period = NaN;
  drift = NaN;
  cycles = 0;
  private prevUx = NaN;
  private prevT = 0;
  private prevX = 0;
  private prevY = 0;
  private tc = NaN;
  private tFirst = NaN;
  private xFirst = 0;
  private yFirst = 0;
  private ymin = Infinity;
  private ymax = -Infinity;
  private t0 = 0;
  private x0 = 0;
  private y0 = 0;
  private started = false;

  reset(): void {
    this.radius = this.period = this.drift = NaN;
    this.cycles = 0;
    this.prevUx = NaN;
    this.tc = this.tFirst = NaN;
    this.ymin = Infinity;
    this.ymax = -Infinity;
    this.started = false;
  }

  /** gyrating=false means the gyration speed is negligible, so drift is measured directly. */
  feed(t: number, x: number, y: number, ux: number, gyrating: boolean): void {
    if (!this.started) {
      this.started = true;
      this.t0 = t;
      this.x0 = x;
      this.y0 = y;
    }
    if (!gyrating) {
      const dt = t - this.t0;
      if (dt > 0) this.drift = Math.hypot(x - this.x0, y - this.y0) / dt;
      this.radius = 0;
      this.prevUx = NaN;
      return;
    }
    if (y < this.ymin) this.ymin = y;
    if (y > this.ymax) this.ymax = y;
    if (this.prevUx < 0 && ux >= 0) {
      const f = this.prevUx / (this.prevUx - ux);
      const tc = this.prevT + f * (t - this.prevT);
      const xc = this.prevX + f * (x - this.prevX);
      const yc = this.prevY + f * (y - this.prevY);
      if (Number.isFinite(this.tc)) {
        this.period = tc - this.tc;
        this.radius = 0.5 * (this.ymax - this.ymin);
        this.cycles++;
        this.drift = Math.hypot(xc - this.xFirst, yc - this.yFirst) / (tc - this.tFirst);
      } else {
        this.tFirst = tc;
        this.xFirst = xc;
        this.yFirst = yc;
      }
      this.tc = tc;
      this.ymin = y;
      this.ymax = y;
    }
    this.prevUx = ux;
    this.prevT = t;
    this.prevX = x;
    this.prevY = y;
  }
}

/** Counts mirror reflections: sign changes of v∥ with hysteresis. */
export class BounceCounter {
  count = 0;
  private sign = 0;
  private threshold: number;
  constructor(threshold: number) {
    this.threshold = threshold;
  }
  reset(threshold: number): void {
    this.count = 0;
    this.sign = 0;
    this.threshold = threshold;
  }
  feed(vpar: number): void {
    if (vpar > this.threshold) {
      if (this.sign < 0) this.count++;
      this.sign = 1;
    } else if (vpar < -this.threshold) {
      if (this.sign > 0) this.count++;
      this.sign = -1;
    }
  }
}

// ---------------------------------------------------------------- field lines

/**
 * Trace a field line from (x, y, z) with RK4 on the unit tangent B/|B|, in both
 * directions, until `stop` returns true or maxSteps is used. Returns a flat xyz array.
 */
export function traceFieldLine(
  f: FieldModel,
  start: [number, number, number],
  ds: number,
  maxSteps: number,
  stop: (x: number, y: number, z: number) => boolean,
): number[] {
  const unit = (x: number, y: number, z: number, o: number[]) => {
    f.b(x, y, z, bb);
    const n = Math.hypot(bb[0], bb[1], bb[2]) || 1;
    o[0] = bb[0] / n;
    o[1] = bb[1] / n;
    o[2] = bb[2] / n;
  };
  const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
  const run = (dir: number): number[] => {
    const pts: number[] = [];
    let [x, y, z] = start;
    const h = dir * ds;
    for (let i = 0; i < maxSteps; i++) {
      unit(x, y, z, k1);
      unit(x + 0.5 * h * k1[0], y + 0.5 * h * k1[1], z + 0.5 * h * k1[2], k2);
      unit(x + 0.5 * h * k2[0], y + 0.5 * h * k2[1], z + 0.5 * h * k2[2], k3);
      unit(x + h * k3[0], y + h * k3[1], z + h * k3[2], k4);
      x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      z += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      pts.push(x, y, z);
      if (stop(x, y, z)) break;
    }
    return pts;
  };
  const back = run(-1);
  const out: number[] = [];
  for (let i = back.length - 3; i >= 0; i -= 3) out.push(back[i], back[i + 1], back[i + 2]);
  out.push(start[0], start[1], start[2]);
  return out.concat(run(1));
}

/**
 * Rough drift period of an equatorially mirroring particle in a dipole, from the
 * gradient drift v_d = 3 m v² / (2 q B r): T_d = 4π q B r² / (3 m v²). Used only to pace the animation.
 */
export function dipoleDriftPeriod(qm: number, Beq: number, r: number, v: number): number {
  return (4 * Math.PI * Math.abs(qm) * Beq * r * r) / (3 * v * v);
}
