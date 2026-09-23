// 1D time-dependent Schrodinger equation with hbar = m = 1, solved by the
// split-step Fourier method. Pure module: no DOM, no Three.js.

export type PotentialKind = 'barrier' | 'double' | 'step' | 'well';

/** Grid used by the live scene. */
export const GRID_N = 2048;
export const GRID_L = 240;

/** Gap between the two barriers of the double barrier. */
export const DOUBLE_GAP = 4;

// ---------------------------------------------------------------- FFT

interface FFTPlan {
  cos: Float64Array;
  sin: Float64Array;
  rev: Uint32Array;
}
const plans = new Map<number, FFTPlan>();

function plan(n: number): FFTPlan {
  let p = plans.get(n);
  if (p) return p;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size ${n} is not a power of two`);
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let j = 0; j < half; j++) {
    cos[j] = Math.cos((2 * Math.PI * j) / n);
    sin[j] = -Math.sin((2 * Math.PI * j) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  p = { cos, sin, rev };
  plans.set(n, p);
  return p;
}

/**
 * In-place iterative radix-2 complex FFT.
 * Forward: X_k = sum_j x_j e^{-2 pi i jk/n}. Inverse includes the 1/n factor.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const sgn = inverse ? -1 : 1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const wr = cos[j * step];
        const wi = sgn * sin[j * step];
        const a = start + j;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  if (inverse) {
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= s;
      im[i] *= s;
    }
  }
}

/** Naive O(n^2) DFT, used only to check the FFT. */
export function dft(re: Float64Array, im: Float64Array): [Float64Array, Float64Array] {
  const n = re.length;
  const or = new Float64Array(n);
  const oi = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let j = 0; j < n; j++) {
      const ph = (-2 * Math.PI * j * k) / n;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      sr += re[j] * c - im[j] * s;
      si += re[j] * s + im[j] * c;
    }
    or[k] = sr;
    oi[k] = si;
  }
  return [or, oi];
}

// ---------------------------------------------------------------- potentials

export interface Segment {
  x0: number;
  x1: number;
  V: number;
}

/** Piecewise-constant potential as a list of non-zero segments (V = 0 elsewhere). */
export function segments(kind: PotentialKind, V0: number, a: number, xMax = GRID_L / 2): Segment[] {
  switch (kind) {
    case 'barrier':
      return [{ x0: -a / 2, x1: a / 2, V: V0 }];
    case 'double':
      return [
        { x0: -DOUBLE_GAP / 2 - a, x1: -DOUBLE_GAP / 2, V: V0 },
        { x0: DOUBLE_GAP / 2, x1: DOUBLE_GAP / 2 + a, V: V0 },
      ];
    case 'step':
      return [{ x0: 0, x1: xMax, V: V0 }];
    case 'well':
      return [{ x0: -a / 2, x1: a / 2, V: -V0 }];
  }
}

/** The x range that counts as "inside" the potential. Left of it is reflection, right is transmission. */
export function region(kind: PotentialKind, a: number): [number, number] {
  switch (kind) {
    case 'barrier':
    case 'well':
      return [-a / 2, a / 2];
    case 'double':
      return [-DOUBLE_GAP / 2 - a, DOUBLE_GAP / 2 + a];
    case 'step':
      return [0, 0];
  }
}

// ---------------------------------------------------------------- analytic results

/** Plane-wave transmission through a rectangular barrier of height V0 and width a, energy E. */
export function barrierT(E: number, V0: number, a: number): number {
  if (E <= 0) return 0;
  if (Math.abs(E - V0) < 1e-12) return 1 / (1 + (V0 * a * a) / 2);
  if (E < V0) {
    const kappa = Math.sqrt(2 * (V0 - E));
    const s = Math.sinh(kappa * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
  }
  const kp = Math.sqrt(2 * (E - V0));
  const s = Math.sin(kp * a);
  return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
}

/** Thick-barrier approximation T ~ 16 (E/V0)(1 - E/V0) e^{-2 kappa a}, valid for kappa a >> 1. */
export function thickBarrierT(E: number, V0: number, a: number): number {
  if (E <= 0 || E >= V0) return NaN;
  const kappa = Math.sqrt(2 * (V0 - E));
  const r = E / V0;
  return 16 * r * (1 - r) * Math.exp(-2 * kappa * a);
}

/**
 * Plane-wave transmission probability through any piecewise-constant potential,
 * by the transfer-matrix method. Segments must be sorted and non-overlapping.
 * A segment that runs to +infinity (a step) is given with a very large x1 and is
 * treated as the final region.
 */
export function transferT(E: number, segs: Segment[]): number {
  if (E <= 0) return 0;
  // Build regions: potential values and the boundaries between them.
  const Vs: number[] = [0];
  const bs: number[] = [];
  const open = segs.length > 0 && segs[segs.length - 1].x1 >= 1e5;
  let xPrev = -Infinity;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.x0 > xPrev && Vs[Vs.length - 1] !== 0) {
      bs.push(xPrev);
      Vs.push(0);
    }
    bs.push(s.x0);
    Vs.push(s.V);
    xPrev = s.x1;
    if (!(open && i === segs.length - 1)) {
      bs.push(s.x1);
      Vs.push(0);
    }
  }
  // Wave number in each region, as complex (kr, ki). E == V is nudged to avoid k = 0.
  const kr: number[] = [];
  const ki: number[] = [];
  for (const V of Vs) {
    let d = 2 * (E - V);
    if (Math.abs(d) < 1e-12) d = 1e-12;
    if (d > 0) { kr.push(Math.sqrt(d)); ki.push(0); } else { kr.push(0); ki.push(Math.sqrt(-d)); }
  }
  const last = Vs.length - 1;
  if (kr[last] === 0) return 0; // evanescent in the final region: no transmission
  // Start in the final region with A = 1, B = 0 and march left.
  let Ar = 1, Ai = 0, Br = 0, Bi = 0;
  for (let j = last; j >= 1; j--) {
    const b = bs[j - 1];
    // u = A e^{i k2 b}, v = B e^{-i k2 b}
    const [e2r, e2i] = cexp(-ki[j] * b, kr[j] * b);
    const ur = Ar * e2r - Ai * e2i, ui = Ar * e2i + Ai * e2r;
    const [f2r, f2i] = cexp(ki[j] * b, -kr[j] * b);
    const vr = Br * f2r - Bi * f2i, vi = Br * f2i + Bi * f2r;
    // r = k2 / k1
    const den = kr[j - 1] * kr[j - 1] + ki[j - 1] * ki[j - 1];
    const rr = (kr[j] * kr[j - 1] + ki[j] * ki[j - 1]) / den;
    const ri = (ki[j] * kr[j - 1] - kr[j] * ki[j - 1]) / den;
    // u1 = (s + r d)/2, v1 = (s - r d)/2 with s = u + v, d = u - v
    const sr = ur + vr, si = ui + vi;
    const dr = ur - vr, di = ui - vi;
    const rdr = rr * dr - ri * di, rdi = rr * di + ri * dr;
    const u1r = 0.5 * (sr + rdr), u1i = 0.5 * (si + rdi);
    const v1r = 0.5 * (sr - rdr), v1i = 0.5 * (si - rdi);
    // back to amplitudes in region j-1
    const [g1r, g1i] = cexp(ki[j - 1] * b, -kr[j - 1] * b);
    Ar = u1r * g1r - u1i * g1i; Ai = u1r * g1i + u1i * g1r;
    const [h1r, h1i] = cexp(-ki[j - 1] * b, kr[j - 1] * b);
    Br = v1r * h1r - v1i * h1i; Bi = v1r * h1i + v1i * h1r;
  }
  const a2 = Ar * Ar + Ai * Ai;
  return (kr[last] / kr[0]) / a2;
}

function cexp(re: number, im: number): [number, number] {
  const m = Math.exp(re);
  return [m * Math.cos(im), m * Math.sin(im)];
}

/**
 * Transmission averaged over the momentum distribution of a Gaussian packet
 * with mean momentum k0 and position width sigma (momentum width 1/(2 sigma)).
 * Components with k <= 0 move away from the potential and count as reflected.
 */
export function packetT(k0: number, sigma: number, segs: Segment[], samples = 801): number {
  const sk = 1 / (2 * sigma);
  const lo = Math.max(1e-6, k0 - 7 * sk);
  const hi = k0 + 7 * sk;
  if (hi <= lo) return 0;
  const h = (hi - lo) / (samples - 1);
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const k = lo + i * h;
    const w = i === 0 || i === samples - 1 ? 1 : i % 2 ? 4 : 2; // Simpson
    const g = Math.exp(-((k - k0) ** 2) / (2 * sk * sk));
    sum += w * g * transferT(0.5 * k * k, segs);
  }
  return ((sum * h) / 3) / (Math.sqrt(2 * Math.PI) * sk);
}

/** Mean kinetic energy of the Gaussian packet: k0^2/2 + 1/(8 sigma^2). */
export function packetEnergy(k0: number, sigma: number): number {
  return 0.5 * k0 * k0 + 1 / (8 * sigma * sigma);
}

// ---------------------------------------------------------------- simulation

export interface SimParams {
  kind: PotentialKind;
  V0: number;
  /** Barrier or well width. */
  a: number;
  x0: number;
  k0: number;
  sigma: number;
  dt: number;
  /** Complex absorbing potential near both edges. */
  absorb: boolean;
}

export interface Observables {
  /** Probability right of the potential region, including what the right absorber took. */
  T: number;
  /** Probability left of the potential region, including what the left absorber took. */
  R: number;
  /**
   * Reflected probability: the left absorber's share plus the part left of the
   * potential that moves left (negative momentum). Near 0 before the collision,
   * equal to R once the scattering is over.
   */
  Rout: number;
  /** Probability inside the potential region. */
  inside: number;
  /** Total taken by both absorbers. */
  absorbed: number;
  /** Probability still on the grid. */
  onGrid: number;
  /** onGrid + absorbed. Should stay 1. */
  norm: number;
}

export class TunnelSim {
  readonly n: number;
  readonly L: number;
  readonly dx: number;
  readonly x: Float64Array;
  readonly V: Float64Array;
  readonly re: Float64Array;
  readonly im: Float64Array;
  /** Absorbing mask applied once per step: exp(-W dt). */
  readonly mask: Float64Array;
  private readonly vr: Float64Array;
  private readonly vi: Float64Array;
  private readonly kr: Float64Array;
  private readonly ki: Float64Array;
  private readonly sr: Float64Array;
  private readonly si: Float64Array;
  p: SimParams;
  t = 0;
  absorbedL = 0;
  absorbedR = 0;
  xL = 0;
  xR = 0;
  /** Width of each absorbing layer. */
  readonly absorbWidth: number;
  readonly out: Observables = { T: 0, R: 0, Rout: 0, inside: 0, absorbed: 0, onGrid: 1, norm: 1 };

  constructor(p: SimParams, n = GRID_N, L = GRID_L) {
    this.n = n;
    this.L = L;
    this.dx = L / n;
    this.absorbWidth = L / 8;
    this.x = new Float64Array(n);
    for (let i = 0; i < n; i++) this.x[i] = -L / 2 + i * this.dx;
    this.V = new Float64Array(n);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.mask = new Float64Array(n);
    this.vr = new Float64Array(n);
    this.vi = new Float64Array(n);
    this.kr = new Float64Array(n);
    this.ki = new Float64Array(n);
    this.sr = new Float64Array(n);
    this.si = new Float64Array(n);
    this.p = { ...p };
    this.configure(p);
  }

  /** Rebuild propagators and restart from the Gaussian packet. */
  configure(p: SimParams): void {
    this.p = { ...p };
    const { n, dx, L } = this;
    const dt = p.dt;
    // Potential, with each cell weighted by its overlap with each segment so thin barriers keep their area.
    const segs = segments(p.kind, p.V0, p.a, L);
    this.V.fill(0);
    for (let i = 0; i < n; i++) {
      const c0 = this.x[i] - dx / 2;
      const c1 = this.x[i] + dx / 2;
      let v = 0;
      for (const s of segs) {
        const o = Math.min(c1, s.x1) - Math.max(c0, s.x0);
        if (o > 0) v += (s.V * o) / dx;
      }
      this.V[i] = v;
    }
    [this.xL, this.xR] = region(p.kind, p.a);
    // Half-step potential phase e^{-i V dt / 2}
    for (let i = 0; i < n; i++) {
      this.vr[i] = Math.cos((-this.V[i] * dt) / 2);
      this.vi[i] = Math.sin((-this.V[i] * dt) / 2);
    }
    // Kinetic phase e^{-i k^2 dt / 2} in FFT order
    for (let j = 0; j < n; j++) {
      const k = ((j < n / 2 ? j : j - n) * 2 * Math.PI) / L;
      this.kr[j] = Math.cos((-k * k * dt) / 2);
      this.ki[j] = Math.sin((-k * k * dt) / 2);
    }
    // Absorbing layer: W(x) = W0 s^2 over the outer strip, s from 0 to 1.
    const w = this.absorbWidth;
    const W0 = 0.6;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(this.x[i]) - (L / 2 - w);
      if (!p.absorb || d <= 0) this.mask[i] = 1;
      else {
        const s = d / w;
        this.mask[i] = Math.exp(-W0 * s * s * dt);
      }
    }
    this.setGaussian(p.x0, p.k0, p.sigma);
  }

  /** Replace psi with a normalized Gaussian. Resets time and the absorber tallies. */
  setGaussian(x0: number, k0: number, sigma: number, resetTime = true): void {
    const { n } = this;
    const amp = Math.pow(2 * Math.PI * sigma * sigma, -0.25);
    for (let i = 0; i < n; i++) {
      const d = this.x[i] - x0;
      const g = amp * Math.exp(-(d * d) / (4 * sigma * sigma));
      this.re[i] = g * Math.cos(k0 * this.x[i]);
      this.im[i] = g * Math.sin(k0 * this.x[i]);
    }
    // Normalize on the grid
    let s = 0;
    for (let i = 0; i < n; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    const f = 1 / Math.sqrt(s * this.dx);
    for (let i = 0; i < n; i++) {
      this.re[i] *= f;
      this.im[i] *= f;
    }
    if (resetTime) this.t = 0;
    this.absorbedL = 0;
    this.absorbedR = 0;
  }

  /** Advance by `steps` Strang split steps: V/2, T, V/2, then the absorber. */
  step(steps = 1): void {
    const { n, re, im, vr, vi, kr, ki, mask, dx } = this;
    const half = n >> 1;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        const a = re[i], b = im[i];
        re[i] = a * vr[i] - b * vi[i];
        im[i] = a * vi[i] + b * vr[i];
      }
      fft(re, im, false);
      for (let j = 0; j < n; j++) {
        const a = re[j], b = im[j];
        re[j] = a * kr[j] - b * ki[j];
        im[j] = a * ki[j] + b * kr[j];
      }
      fft(re, im, true);
      let lossL = 0;
      let lossR = 0;
      for (let i = 0; i < n; i++) {
        const a = re[i], b = im[i];
        let c = a * vr[i] - b * vi[i];
        let d = a * vi[i] + b * vr[i];
        const m = mask[i];
        if (m !== 1) {
          const p2 = c * c + d * d;
          c *= m;
          d *= m;
          const lost = p2 - (c * c + d * d);
          if (i < half) lossL += lost;
          else lossR += lost;
        }
        re[i] = c;
        im[i] = d;
      }
      this.absorbedL += lossL * dx;
      this.absorbedR += lossR * dx;
      this.t += this.p.dt;
    }
  }

  /** Fill and return `out` with T, R, absorbed, and norm. No allocation. */
  observe(): Observables {
    const { n, re, im, x, dx, xL, xR } = this;
    let left = 0;
    let right = 0;
    let mid = 0;
    for (let i = 0; i < n; i++) {
      const p = re[i] * re[i] + im[i] * im[i];
      if (x[i] < xL) left += p;
      else if (x[i] >= xR) right += p;
      else mid += p;
    }
    const o = this.out;
    o.R = left * dx + this.absorbedL;
    // Momentum split of the left part, by FFT into scratch arrays.
    const { sr, si } = this;
    for (let i = 0; i < n; i++) {
      const keep = x[i] < xL ? 1 : 0;
      sr[i] = re[i] * keep;
      si[i] = im[i] * keep;
    }
    fft(sr, si, false);
    let neg = 0;
    let all = 0;
    for (let j = 0; j < n; j++) {
      const p = sr[j] * sr[j] + si[j] * si[j];
      all += p;
      if (j > n / 2) neg += p;
      else if (j === n / 2) neg += p / 2;
    }
    o.Rout = this.absorbedL + (all > 0 ? (left * dx * neg) / all : 0);
    o.T = right * dx + this.absorbedR;
    o.inside = mid * dx;
    o.absorbed = this.absorbedL + this.absorbedR;
    o.onGrid = (left + right + mid) * dx;
    o.norm = o.onGrid + o.absorbed;
    return o;
  }

  /** Position expectation and standard deviation of |psi|^2 on the grid. */
  moments(): [number, number] {
    const { n, re, im, x } = this;
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      const p = re[i] * re[i] + im[i] * im[i];
      s0 += p;
      s1 += p * x[i];
      s2 += p * x[i] * x[i];
    }
    const m = s1 / s0;
    return [m, Math.sqrt(Math.max(0, s2 / s0 - m * m))];
  }

  /**
   * Born-rule position measurement. Draws x from |psi|^2 using the uniform number
   * u in [0, 1), then collapses psi to a narrow Gaussian there. Probability already
   * taken by an absorber counts too: landing there returns -Infinity or +Infinity,
   * and the state collapses onto that absorber (psi = 0 on the grid).
   */
  measure(u: number, width = 0.8): number {
    const { n, re, im, x, dx } = this;
    let total = 0;
    for (let i = 0; i < n; i++) total += re[i] * re[i] + im[i] * im[i];
    const target = u * (total * dx + this.absorbedL + this.absorbedR);
    if (target < this.absorbedL || target >= total * dx + this.absorbedL) {
      const left = target < this.absorbedL;
      re.fill(0);
      im.fill(0);
      this.absorbedL = left ? 1 : 0;
      this.absorbedR = left ? 0 : 1;
      return left ? -Infinity : Infinity;
    }
    const gridTarget = (target - this.absorbedL) / dx;
    let acc = 0;
    let idx = n - 1;
    for (let i = 0; i < n; i++) {
      acc += re[i] * re[i] + im[i] * im[i];
      if (acc >= gridTarget) {
        idx = i;
        break;
      }
    }
    const xm = x[idx];
    this.setGaussian(xm, this.p.k0, width, false);
    return xm;
  }
}
