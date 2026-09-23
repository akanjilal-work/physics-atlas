// Korteweg-de Vries equation u_t + 6 u u_x + u_xxx = 0 on a periodic domain.
// Pseudo-spectral in space, integrating factor for the stiff u_xxx term,
// classical RK4 for the rest (Trefethen, Spectral Methods in MATLAB, p27).
// Pure module: no DOM, no Three.js.

/** Grid used by the live scene. */
export const GRID_N = 512;
export const GRID_L = 100;
export const DT = 0.004;

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

// ---------------------------------------------------------------- closed forms

/** Soliton speed from its peak height: c = 2A. */
export const speedOf = (A: number): number => 2 * A;

/** Wrap a displacement into [-L/2, L/2). */
export function wrap(d: number, L: number): number {
  return d - L * Math.floor(d / L + 0.5);
}

/** Exact one-soliton on the infinite line: u = (c/2) sech^2( sqrt(c)/2 (x - x0 - c t) ). */
export function oneSoliton(x: number, t: number, A: number, x0: number): number {
  const c = 2 * A;
  const s = 1 / Math.cosh((Math.sqrt(c) / 2) * (x - x0 - c * t));
  return A * s * s;
}

/** One soliton plus its periodic images, for a periodic domain of length L. */
export function periodicSoliton(x: number, t: number, A: number, x0: number, L: number): number {
  if (A <= 0) return 0;
  const xc = x0 + 2 * A * t;
  const d = wrap(x - xc, L);
  let u = 0;
  for (let m = -2; m <= 2; m++) u += oneSoliton(d + m * L, 0, A, 0);
  return u;
}

/**
 * Asymptotic position shifts from a two-soliton collision (A1 > A2).
 * The taller one jumps forward by 2/k1 ln((k1+k2)/(k1-k2)), the smaller one
 * falls back by 2/k2 ln((k1+k2)/(k1-k2)), with k = sqrt(c) = sqrt(2A).
 */
export function phaseShifts(Abig: number, Asmall: number): [number, number] {
  const k1 = Math.sqrt(2 * Abig);
  const k2 = Math.sqrt(2 * Asmall);
  if (!(k1 > k2) || k2 <= 0) return [0, 0];
  const lr = Math.log((k1 + k2) / (k1 - k2));
  return [(2 / k1) * lr, -(2 / k2) * lr];
}

/**
 * Exact Hirota two-soliton solution on the infinite line.
 * u = 2 (ln F)_xx, F = 1 + e^{h1} + e^{h2} + a12 e^{h1+h2},
 * h_i = k_i (x - x_i) - k_i^3 t, a12 = ((k1-k2)/(k1+k2))^2.
 * Evaluated as a weighted variance so it never overflows.
 * Soliton i sits at x_i + k_i^2 t while it is on its "own" side of the collision.
 */
export function twoSoliton(x: number, t: number, A1: number, x1: number, A2: number, x2: number): number {
  const k1 = Math.sqrt(2 * A1);
  const k2 = Math.sqrt(2 * A2);
  const h1 = k1 * (x - x1) - k1 * k1 * k1 * t;
  const h2 = k2 * (x - x2) - k2 * k2 * k2 * t;
  const la = 2 * Math.log(Math.abs(k1 - k2) / (k1 + k2));
  const th0 = 0;
  const th3 = h1 + h2 + la;
  const m = Math.max(th0, h1, h2, th3);
  const w0 = Math.exp(th0 - m);
  const w1 = Math.exp(h1 - m);
  const w2 = Math.exp(h2 - m);
  const w3 = Number.isFinite(th3) ? Math.exp(th3 - m) : 0;
  const W = w0 + w1 + w2 + w3;
  const p3 = k1 + k2;
  const mean = (w1 * k1 + w2 * k2 + w3 * p3) / W;
  const sq = (w1 * k1 * k1 + w2 * k2 * k2 + w3 * p3 * p3) / W;
  return 2 * (sq - mean * mean);
}

// ---------------------------------------------------------------- real FFT

interface RPlan {
  wr: Float64Array; // cos(2 pi k / n)
  wi: Float64Array; // -sin(2 pi k / n)
  zr: Float64Array;
  zi: Float64Array;
}
const rplans = new Map<number, RPlan>();
function rplan(n: number): RPlan {
  let p = rplans.get(n);
  if (p) return p;
  const m = n >> 1;
  const wr = new Float64Array(m);
  const wi = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    wr[k] = Math.cos((2 * Math.PI * k) / n);
    wi[k] = -Math.sin((2 * Math.PI * k) / n);
  }
  p = { wr, wi, zr: new Float64Array(m), zi: new Float64Array(m) };
  rplans.set(n, p);
  return p;
}

/**
 * Forward FFT of a real signal of even length n through one complex FFT of length n/2.
 * Writes X_k for k = 0..n/2 into outR/outI (length n/2 + 1).
 */
export function rfft(x: Float64Array, outR: Float64Array, outI: Float64Array): void {
  const n = x.length;
  const m = n >> 1;
  const { wr, wi, zr, zi } = rplan(n);
  for (let j = 0; j < m; j++) {
    zr[j] = x[2 * j];
    zi[j] = x[2 * j + 1];
  }
  fft(zr, zi);
  for (let k = 0; k < m; k++) {
    const q = k === 0 ? 0 : m - k;
    const ar = zr[k], ai = zi[k], br = zr[q], bi = -zi[q]; // Z_k, conj(Z_{m-k})
    const er = 0.5 * (ar + br), ei = 0.5 * (ai + bi); // even part
    const dr = 0.5 * (ai - bi), di = -0.5 * (ar - br); // odd part (Z_k - conj Z_{m-k}) / 2i
    outR[k] = er + wr[k] * dr - wi[k] * di;
    outI[k] = ei + wr[k] * di + wi[k] * dr;
    if (k === 0) {
      outR[m] = er - dr;
      outI[m] = ei - di;
    }
  }
}

/** Inverse of rfft: half spectrum (length n/2 + 1) to a real signal of length n. */
export function irfft(inR: Float64Array, inI: Float64Array, x: Float64Array): void {
  const n = x.length;
  const m = n >> 1;
  const { wr, wi, zr, zi } = rplan(n);
  for (let k = 0; k < m; k++) {
    const ar = inR[k], ai = inI[k], br = inR[m - k], bi = -inI[m - k]; // X_k, conj(X_{m-k})
    const er = 0.5 * (ar + br), ei = 0.5 * (ai + bi);
    const tr = 0.5 * (ar - br), ti = 0.5 * (ai - bi);
    // odd part = t * W^{-k}, W^{-k} = (wr, -wi)
    const or = tr * wr[k] + ti * wi[k];
    const oi = ti * wr[k] - tr * wi[k];
    // Z = even + i odd
    zr[k] = er - oi;
    zi[k] = ei + or;
  }
  fft(zr, zi, true);
  for (let j = 0; j < m; j++) {
    x[2 * j] = zr[j];
    x[2 * j + 1] = zi[j];
  }
}

// ---------------------------------------------------------------- solver

export class KdV {
  readonly n: number;
  readonly L: number;
  readonly dx: number;
  readonly dt: number;
  readonly x: Float64Array;
  /** Real-space field, valid after sync(). */
  readonly u: Float64Array;
  /** Spectral state u-hat for k = 0..n/2 (u is real). */
  readonly vr: Float64Array;
  readonly vi: Float64Array;
  t = 0;
  /** true: drop the 6 u u_x term and solve u_t + u_xxx = 0 exactly. */
  linear = false;

  private readonly h: number;
  private readonly k: Float64Array;
  private readonly g: Float64Array; // -3 k dt, zero outside the 2/3 band
  private readonly er: Float64Array; // e^{i k^3 dt/2}
  private readonly ei: Float64Array;
  private readonly e2r: Float64Array; // e^{i k^3 dt}
  private readonly e2i: Float64Array;
  private readonly ar: Float64Array;
  private readonly ai: Float64Array;
  private readonly br: Float64Array;
  private readonly bi: Float64Array;
  private readonly cr: Float64Array;
  private readonly ci: Float64Array;
  private readonly dr: Float64Array;
  private readonly di: Float64Array;
  private readonly wr: Float64Array;
  private readonly wi: Float64Array;
  private readonly sr: Float64Array;
  private readonly si: Float64Array;
  private readonly tmp: Float64Array;

  constructor(n = GRID_N, L = GRID_L, dt = DT) {
    this.n = n;
    this.L = L;
    this.dt = dt;
    this.dx = L / n;
    const H = (this.h = n / 2 + 1);
    const f = () => new Float64Array(H);
    this.x = new Float64Array(n);
    this.u = new Float64Array(n);
    this.tmp = new Float64Array(n);
    this.vr = f(); this.vi = f();
    this.k = f(); this.g = f();
    this.er = f(); this.ei = f(); this.e2r = f(); this.e2i = f();
    this.ar = f(); this.ai = f(); this.br = f(); this.bi = f();
    this.cr = f(); this.ci = f(); this.dr = f(); this.di = f();
    this.wr = f(); this.wi = f(); this.sr = f(); this.si = f();
    for (let j = 0; j < n; j++) this.x[j] = -L / 2 + j * this.dx;
    for (let j = 0; j < H; j++) {
      const k = j === n / 2 ? 0 : (2 * Math.PI * j) / L;
      this.k[j] = k;
      // 2/3-rule dealiasing on the nonlinear term.
      this.g[j] = j < n / 3 ? -3 * k * dt : 0;
      const ph = k * k * k * dt;
      this.er[j] = Math.cos(ph / 2);
      this.ei[j] = Math.sin(ph / 2);
      this.e2r[j] = Math.cos(ph);
      this.e2i[j] = Math.sin(ph);
    }
  }

  /** Load a real-space profile. */
  setField(u0: ArrayLike<number>): void {
    for (let j = 0; j < this.n; j++) this.tmp[j] = u0[j];
    rfft(this.tmp, this.vr, this.vi);
    this.t = 0;
    this.sync();
  }

  /** Load a sum of periodic sech^2 solitons (A = 0 entries are skipped). */
  setSolitons(list: { A: number; x0: number }[]): void {
    for (let j = 0; j < this.n; j++) {
      let s = 0;
      for (const q of list) s += periodicSoliton(this.x[j], 0, q.A, q.x0, this.L);
      this.tmp[j] = s;
    }
    this.setField(this.tmp);
  }

  /** out = (-3 i k dt) * FFT( IFFT(in)^2 ), dealiased. */
  private nonlin(inR: Float64Array, inI: Float64Array, outR: Float64Array, outI: Float64Array): void {
    const { tmp, g, n, h } = this;
    irfft(inR, inI, tmp);
    for (let j = 0; j < n; j++) tmp[j] *= tmp[j];
    rfft(tmp, this.sr, this.si);
    const { sr, si } = this;
    for (let j = 0; j < h; j++) {
      // (i g) * (a + i b) = -g b + i g a
      outR[j] = -g[j] * si[j];
      outI[j] = g[j] * sr[j];
    }
  }

  /** Advance `steps` fixed steps of size dt. */
  step(steps = 1): void {
    const n = this.h;
    const { vr, vi, er, ei, e2r, e2i, ar, ai, br, bi, cr, ci, dr, di, wr, wi } = this;
    for (let s = 0; s < steps; s++) {
      if (this.linear) {
        for (let j = 0; j < n; j++) {
          const a = vr[j], b = vi[j];
          vr[j] = a * e2r[j] - b * e2i[j];
          vi[j] = a * e2i[j] + b * e2r[j];
        }
        this.t += this.dt;
        continue;
      }
      // a = g N(v)
      this.nonlin(vr, vi, ar, ai);
      // b = g N(E (v + a/2))
      for (let j = 0; j < n; j++) {
        const x = vr[j] + ar[j] / 2, y = vi[j] + ai[j] / 2;
        wr[j] = er[j] * x - ei[j] * y;
        wi[j] = er[j] * y + ei[j] * x;
      }
      this.nonlin(wr, wi, br, bi);
      // c = g N(E v + b/2)
      for (let j = 0; j < n; j++) {
        wr[j] = er[j] * vr[j] - ei[j] * vi[j] + br[j] / 2;
        wi[j] = er[j] * vi[j] + ei[j] * vr[j] + bi[j] / 2;
      }
      this.nonlin(wr, wi, cr, ci);
      // d = g N(E2 v + E c)
      for (let j = 0; j < n; j++) {
        wr[j] = e2r[j] * vr[j] - e2i[j] * vi[j] + er[j] * cr[j] - ei[j] * ci[j];
        wi[j] = e2r[j] * vi[j] + e2i[j] * vr[j] + er[j] * ci[j] + ei[j] * cr[j];
      }
      this.nonlin(wr, wi, dr, di);
      // v = E2 v + (E2 a + 2 E (b + c) + d) / 6
      for (let j = 0; j < n; j++) {
        const pr = e2r[j] * ar[j] - e2i[j] * ai[j];
        const pi = e2r[j] * ai[j] + e2i[j] * ar[j];
        const qr0 = br[j] + cr[j], qi0 = bi[j] + ci[j];
        const qr = 2 * (er[j] * qr0 - ei[j] * qi0);
        const qi = 2 * (er[j] * qi0 + ei[j] * qr0);
        const nr = e2r[j] * vr[j] - e2i[j] * vi[j] + (pr + qr + dr[j]) / 6;
        const ni = e2r[j] * vi[j] + e2i[j] * vr[j] + (pi + qi + di[j]) / 6;
        vr[j] = nr;
        vi[j] = ni;
      }
      this.t += this.dt;
    }
  }

  /** Refresh the real-space field u from the spectral state. */
  sync(): void {
    irfft(this.vr, this.vi, this.u);
  }

  /** Mass, the integral of u. Exact from the zero mode. */
  mass(): number {
    return (this.vr[0] / this.n) * this.L;
  }

  /** Energy, the integral of u^2 (uses u, so call sync() first). */
  energy(): number {
    let s = 0;
    for (let j = 0; j < this.n; j++) s += this.u[j] * this.u[j];
    return s * this.dx;
  }

  /** Hamiltonian-type invariant, integral of (u^3 - u_x^2 / 2). Allocates, for tests only. */
  hamiltonian(): number {
    const dr = new Float64Array(this.h);
    const di = new Float64Array(this.h);
    for (let j = 0; j < this.h; j++) {
      dr[j] = -this.k[j] * this.vi[j];
      di[j] = this.k[j] * this.vr[j];
    }
    const ux = new Float64Array(this.n);
    irfft(dr, di, ux);
    let s = 0;
    for (let j = 0; j < this.n; j++) s += this.u[j] ** 3 - 0.5 * ux[j] * ux[j];
    return s * this.dx;
  }

  /** Largest value of u. */
  maxU(): number {
    let m = -Infinity;
    for (let j = 0; j < this.n; j++) if (this.u[j] > m) m = this.u[j];
    return m;
  }

  /**
   * Find the two highest local maxima above `thresh`, refined by a parabola.
   * Writes [x, height] pairs into out (length 4) and returns how many were found.
   * Maxima closer than `minSep` to a higher one are ignored.
   */
  peaks(thresh: number, minSep: number, out: Float64Array): number {
    let x0 = 0, h0 = -Infinity, x1 = 0, h1 = -Infinity;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < this.n; j++) {
        if (!this.refine(j, thresh)) continue;
        const x = this.px, h = this.ph;
        if (pass === 0) {
          if (h > h0) { x0 = x; h0 = h; }
        } else if (h > h1 && Math.abs(wrap(x - x0, this.L)) >= minSep) {
          x1 = x; h1 = h;
        }
      }
      if (h0 === -Infinity) break;
    }
    out[0] = x0; out[1] = h0; out[2] = x1; out[3] = h1;
    return h0 === -Infinity ? 0 : h1 === -Infinity ? 1 : 2;
  }

  private px = 0;
  private ph = 0;
  private refine(j: number, thresh: number): boolean {
    const { u, n } = this;
    const a = u[(j - 1 + n) % n];
    const b = u[j];
    const c = u[(j + 1) % n];
    if (!(b > a && b >= c && b > thresh)) return false;
    const den = a - 2 * b + c;
    const off = den < 0 ? (0.5 * (a - c)) / den : 0;
    this.px = wrap(this.x[j] + off * this.dx, this.L);
    this.ph = b - 0.25 * (a - c) * off;
    return true;
  }
}
