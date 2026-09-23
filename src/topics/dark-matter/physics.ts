// Galaxy rotation curves and a schematic Bullet Cluster collision.
// Pure math. Units: kpc, km/s, solar masses, Myr.

/** Newton's G in kpc (km/s)^2 / Msun. */
export const G = 4.30091e-6;
/** MOND acceleration a0 = 1.2e-10 m/s^2 expressed in (km/s)^2 / kpc. */
export const A0_SI = 1.2e-10;
export const KPC_M = 3.0857e19;
export const A0 = A0_SI / (1e6 / KPC_M);
/** 1 kpc / (km/s) in Myr. */
export const KPC_PER_KMS_MYR = 977.79;
/** Critical density for h = 0.7, in Msun / kpc^3 (277.5 h^2 Msun/kpc^3). */
export const RHO_CRIT = 277.5 * 0.7 * 0.7;

// ---------------------------------------------------------------------------
// Modified Bessel functions (Abramowitz & Stegun 9.8.1 to 9.8.8, |error| < 2e-7 relative).

export function besselI0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    return 1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))));
  }
  const y = 3.75 / ax;
  return (Math.exp(ax) / Math.sqrt(ax)) * (0.39894228 + y * (0.01328592 + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))));
}

export function besselI1(x: number): number {
  const ax = Math.abs(x);
  let r: number;
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    r = ax * (0.5 + y * (0.87890594 + y * (0.51498869 + y * (0.15084934 + y * (0.02658733 + y * (0.00301532 + y * 0.00032411))))));
  } else {
    const y = 3.75 / ax;
    r = 0.02282967 + y * (-0.02895312 + y * (0.01787654 - y * 0.00420059));
    r = 0.39894228 + y * (-0.03988024 + y * (-0.00362018 + y * (0.00163801 + y * (-0.01031555 + y * r))));
    r *= Math.exp(ax) / Math.sqrt(ax);
  }
  return x < 0 ? -r : r;
}

export function besselK0(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return -Math.log(x / 2) * besselI0(x) + (-0.57721566 + y * (0.4227842 + y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074))))));
  }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 + y * (-0.0025154 + y * 0.00053208))))));
}

export function besselK1(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return Math.log(x / 2) * besselI1(x) + (1 / x) * (1 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 + y * -0.00004686))))));
  }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 + y * -0.00068245))))));
}

// ---------------------------------------------------------------------------
// Mass components

/**
 * Freeman (1970) exponential disk, exact thin-disk circular speed squared:
 * v^2 = 4 pi G Sigma0 Rd y^2 [I0(y)K0(y) - I1(y)K1(y)], y = R / (2 Rd).
 * Beyond y = 12 the difference of two nearly equal products loses precision,
 * so the asymptotic series from the Hankel expansions of I_n K_n is used:
 * v^2 = GM/R (1 + 9/(8 y^2) + 675/(128 y^4) + ...). The tests check the joint.
 */
export function vDisk2(R: number, Md: number, Rd: number): number {
  if (R <= 0 || Md <= 0) return 0;
  const y = R / (2 * Rd);
  if (y > 12) {
    const q = 1 / (y * y);
    return ((G * Md) / R) * (1 + q * (9 / 8 + (675 / 128) * q));
  }
  const bracket = besselI0(y) * besselK0(y) - besselI1(y) * besselK1(y);
  return ((2 * G * Md) / Rd) * y * y * bracket;
}

/** Mass of an exponential disk inside cylinder radius R (used for the spherical estimate and MOND). */
export function diskEnclosed(R: number, Md: number, Rd: number): number {
  const x = R / Rd;
  return Md * (1 - (1 + x) * Math.exp(-x));
}

/** Hernquist bulge: M(<r) = Mb r^2 / (r + a)^2. */
export function bulgeEnclosed(r: number, Mb: number, a: number): number {
  return (Mb * r * r) / ((r + a) * (r + a));
}

/** Point mass: v = sqrt(GM/r). */
export function vPoint(r: number, M: number): number {
  return Math.sqrt((G * M) / r);
}

/** NFW shape function m(x) = ln(1 + x) - x / (1 + x). */
export function nfwShape(x: number): number {
  return Math.log1p(x) - x / (1 + x);
}

/** Virial radius r200 where the mean density is 200 rho_crit. */
export function r200(M200: number): number {
  return Math.cbrt((3 * M200) / (4 * Math.PI * 200 * RHO_CRIT));
}

/** NFW characteristic density rho_s so that M(<r200) = M200 for scale radius rs. */
export function nfwRhoS(M200: number, rs: number): number {
  const c = r200(M200) / rs;
  return M200 / (4 * Math.PI * rs ** 3 * nfwShape(c));
}

/** NFW enclosed mass: M(<r) = 4 pi rho_s rs^3 m(r / rs). */
export function nfwEnclosed(r: number, rhoS: number, rs: number): number {
  return 4 * Math.PI * rhoS * rs ** 3 * nfwShape(r / rs);
}

/** Pseudo-isothermal sphere: rho = rho0 / (1 + (r/rc)^2), M(<r) = 4 pi rho0 rc^3 (x - atan x). */
export function isoEnclosed(r: number, rho0: number, rc: number): number {
  const x = r / rc;
  return 4 * Math.PI * rho0 * rc ** 3 * (x - Math.atan(x));
}

/** Asymptotic flat speed of the pseudo-isothermal sphere, sqrt(4 pi G rho0 rc^2). */
export function isoVinf(rho0: number, rc: number): number {
  return Math.sqrt(4 * Math.PI * G * rho0 * rc * rc);
}

/** rho0 such that the cored halo holds M200 inside r200 (same r200 as NFW). */
export function isoRho0(M200: number, rc: number): number {
  const R = r200(M200);
  return M200 / (4 * Math.PI * rc ** 3 * (R / rc - Math.atan(R / rc)));
}

// ---------------------------------------------------------------------------
// MOND

/**
 * Simple interpolating function mu(x) = x / (1 + x). Solving g mu(g/a0) = gN gives
 * g = gN/2 + sqrt(gN^2/4 + gN a0).
 */
export function mondAccel(gN: number, a0 = A0): number {
  if (gN <= 0) return 0;
  return gN / 2 + Math.sqrt((gN * gN) / 4 + gN * a0);
}

// ---------------------------------------------------------------------------
// Galaxy model

export type Model = 'newton' | 'nfw' | 'iso' | 'mond';

export interface GalaxyParams {
  Md: number; // disk mass, Msun
  Rd: number; // disk scale length, kpc
  Mb: number; // bulge mass
  ab: number; // bulge Hernquist scale, kpc
  M200: number; // halo mass inside r200
  rs: number; // halo scale radius (NFW) or core radius (cored), kpc
}

export const MW: GalaxyParams = { Md: 5e10, Rd: 2.6, Mb: 1e10, ab: 0.6, M200: 1e12, rs: 20 };

export interface Curve {
  bulge: number;
  disk: number;
  halo: number;
  visible: number;
  total: number;
}

/** Circular speed components at radius r (kpc). Writes into out and returns it. */
export function rotation(r: number, p: GalaxyParams, model: Model, out: Curve): Curve {
  const vb2 = r > 0 ? (G * bulgeEnclosed(r, p.Mb, p.ab)) / r : 0;
  const vd2 = vDisk2(r, p.Md, p.Rd);
  let vh2 = 0;
  if (model === 'nfw') vh2 = (G * nfwEnclosed(r, nfwRhoS(p.M200, p.rs), p.rs)) / r;
  else if (model === 'iso') vh2 = (G * isoEnclosed(r, isoRho0(p.M200, p.rs), p.rs)) / r;
  const vis2 = vb2 + vd2;
  out.bulge = Math.sqrt(vb2);
  out.disk = Math.sqrt(vd2);
  out.halo = Math.sqrt(vh2);
  out.visible = Math.sqrt(vis2);
  if (model === 'mond') {
    // MOND is applied to the Newtonian acceleration of the baryons.
    const gN = vis2 / r;
    out.total = Math.sqrt(mondAccel(gN) * r);
  } else {
    out.total = Math.sqrt(vis2 + vh2);
  }
  return out;
}

/** Baryonic mass inside radius r (spherical estimate). */
export function baryonEnclosed(r: number, p: GalaxyParams): number {
  return bulgeEnclosed(r, p.Mb, p.ab) + diskEnclosed(r, p.Md, p.Rd);
}

/** Halo mass inside r for the current model (0 for Newton and MOND). */
export function haloEnclosed(r: number, p: GalaxyParams, model: Model): number {
  if (model === 'nfw') return nfwEnclosed(r, nfwRhoS(p.M200, p.rs), p.rs);
  if (model === 'iso') return isoEnclosed(r, isoRho0(p.M200, p.rs), p.rs);
  return 0;
}

/** Radius where the baryons' Newtonian acceleration equals a0. */
export function mondRadius(p: GalaxyParams): number {
  let lo = 0.1;
  let hi = 500;
  const c: Curve = { bulge: 0, disk: 0, halo: 0, visible: 0, total: 0 };
  for (let i = 0; i < 60; i++) {
    const m = Math.sqrt(lo * hi);
    rotation(m, p, 'newton', c);
    if ((c.visible * c.visible) / m > A0) lo = m;
    else hi = m;
  }
  return Math.sqrt(lo * hi);
}

/** Logarithmic slope d ln v / d ln r of the total curve at radius r. */
export function logSlope(r: number, p: GalaxyParams, model: Model): number {
  const c: Curve = { bulge: 0, disk: 0, halo: 0, visible: 0, total: 0 };
  const h = 0.01;
  const v1 = rotation(r * Math.exp(h), p, model, c).total;
  const v0 = rotation(r * Math.exp(-h), p, model, c).total;
  return (Math.log(v1) - Math.log(v0)) / (2 * h);
}

// ---------------------------------------------------------------------------
// Illustrative data set. NOT real measurements: generated from a hidden
// bulge + disk + NFW model with fixed scatter, so the reader has something to fit.

export interface DataPoint {
  r: number;
  v: number;
  err: number;
}

export const DATA_TRUTH: GalaxyParams = { Md: 6e10, Rd: 2.6, Mb: 1e10, ab: 0.6, M200: 1.5e12, rs: 25 };
const SCATTER = [0.4, -0.9, 0.3, 0.8, -0.5, -0.2, 1.0, -0.7, 0.1, 0.6, -1.1, 0.2, -0.3, 0.7, -0.6, 0.5, -0.1, -0.8];

export function illustrativeData(): DataPoint[] {
  const c: Curve = { bulge: 0, disk: 0, halo: 0, visible: 0, total: 0 };
  const pts: DataPoint[] = [];
  for (let i = 0; i < SCATTER.length; i++) {
    const r = 1.5 + i * 2;
    const err = 3 + 0.25 * r;
    const v = rotation(r, DATA_TRUTH, 'nfw', c).total + SCATTER[i] * err;
    pts.push({ r, v, err });
  }
  return pts;
}

/** Reduced chi-square of a model against data (divided by the number of points). */
export function chi2(data: DataPoint[], p: GalaxyParams, model: Model): number {
  const c: Curve = { bulge: 0, disk: 0, halo: 0, visible: 0, total: 0 };
  let s = 0;
  for (const d of data) {
    const v = rotation(d.r, p, model, c).total;
    s += ((v - d.v) / d.err) ** 2;
  }
  return s / data.length;
}

/** Flatness: max/min - 1 of the total curve over [r0, r1]. */
export function flatness(p: GalaxyParams, model: Model, r0 = 8, r1 = 35): number {
  const c: Curve = { bulge: 0, disk: 0, halo: 0, visible: 0, total: 0 };
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i <= 40; i++) {
    const v = rotation(r0 + ((r1 - r0) * i) / 40, p, model, c).total;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi / lo - 1;
}

// ---------------------------------------------------------------------------
// Schematic Bullet Cluster collision (1D along the line of motion).
// Dark matter and galaxies are collisionless and pass straight through.
// Gas clouds feel a mutual drag while they overlap (ram pressure) and a weak
// pull back toward their own halo. Momentum-conserving drag, fixed step.

export interface BulletState {
  t: number; // Myr since start
  X: [number, number]; // dark matter centres (kpc): main, bullet
  V: [number, number]; // kpc / Myr
  x: [number, number]; // gas centres
  v: [number, number];
}

export const BULLET = {
  M: [4, 1] as [number, number], // relative masses: main, bullet
  sig: [260, 130] as [number, number], // DM Gaussian widths (kpc)
  gasSig: [300, 140] as [number, number],
  drag: 0.004, // 1/Myr at full overlap
  spring: 1.2e-5, // 1/Myr^2 pull of gas toward its halo
  start: 1100, // initial half separation (kpc)
  vrel: 4.1, // closing speed, kpc/Myr (about 4000 km/s)
};

export function bulletInit(): BulletState {
  const [Mm, Mb] = BULLET.M;
  const Vm = (-BULLET.vrel * Mb) / (Mm + Mb);
  const Vb = (BULLET.vrel * Mm) / (Mm + Mb);
  const Xm = (BULLET.start * 2 * Mb) / (Mm + Mb);
  const Xb = (-BULLET.start * 2 * Mm) / (Mm + Mb);
  return { t: 0, X: [Xm, Xb], V: [Vm, Vb], x: [Xm, Xb], v: [Vm, Vb] };
}

/** Time of closest approach of the two dark matter centres (Myr). */
export function bulletPassage(s0: BulletState): number {
  return (s0.X[0] - s0.X[1]) / (s0.V[1] - s0.V[0]);
}

export function bulletStep(s: BulletState, h: number): void {
  const [Mm, Mb] = BULLET.M;
  s.X[0] += s.V[0] * h;
  s.X[1] += s.V[1] * h;
  const d = s.x[1] - s.x[0];
  const w2 = BULLET.gasSig[0] ** 2 + BULLET.gasSig[1] ** 2;
  const overlap = Math.exp((-d * d) / (2 * w2 * 0.5));
  const dv = s.v[1] - s.v[0];
  // Drag force on the bullet gas, equal and opposite on the main gas.
  const f = -BULLET.drag * overlap * dv * ((Mm * Mb) / (Mm + Mb));
  const a0 = -f / Mm - BULLET.spring * (s.x[0] - s.X[0]);
  const a1 = f / Mb - BULLET.spring * (s.x[1] - s.X[1]);
  s.v[0] += a0 * h;
  s.v[1] += a1 * h;
  s.x[0] += s.v[0] * h;
  s.x[1] += s.v[1] * h;
  s.t += h;
}

function seg(out: Float32Array, n: number, cap: number, x0: number, y0: number, x1: number, y1: number): number {
  if (n >= cap) return n;
  out[4 * n] = x0;
  out[4 * n + 1] = y0;
  out[4 * n + 2] = x1;
  out[4 * n + 3] = y1;
  return n + 1;
}

/**
 * Marching squares for a scalar field on an nx by ny grid (row major).
 * Writes line segments (x0,y0,x1,y1 in grid coordinates) into out and returns the count.
 */
export function contour(field: Float32Array, nx: number, ny: number, level: number, out: Float32Array, start: number): number {
  let n = start;
  const cap = out.length / 4;
  for (let j = 0; j < ny - 1 && n < cap; j++) {
    for (let i = 0; i < nx - 1 && n < cap; i++) {
      const a = field[j * nx + i];
      const b = field[j * nx + i + 1];
      const c = field[(j + 1) * nx + i + 1];
      const d = field[(j + 1) * nx + i];
      const idx = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      // Edge crossing points: bottom (a-b), right (b-c), top (d-c), left (a-d).
      const eb = i + (level - a) / (b - a);
      const er = j + (level - b) / (c - b);
      const et = i + (level - d) / (c - d);
      const el = j + (level - a) / (d - a);
      switch (idx) {
        case 1: case 14: n = seg(out, n, cap, eb, j, i, el); break;
        case 2: case 13: n = seg(out, n, cap, eb, j, i + 1, er); break;
        case 3: case 12: n = seg(out, n, cap, i, el, i + 1, er); break;
        case 4: case 11: n = seg(out, n, cap, i + 1, er, et, j + 1); break;
        case 5: n = seg(out, n, cap, eb, j, i + 1, er); n = seg(out, n, cap, i, el, et, j + 1); break;
        case 6: case 9: n = seg(out, n, cap, eb, j, et, j + 1); break;
        case 7: case 8: n = seg(out, n, cap, i, el, et, j + 1); break;
        case 10: n = seg(out, n, cap, eb, j, i, el); n = seg(out, n, cap, i + 1, er, et, j + 1); break;
      }
    }
  }
  return n - start;
}

/** Cosmic energy budget today, Planck 2018 (TT,TE,EE+lowE+lensing): Omega_b h^2 = 0.0224, Omega_c h^2 = 0.120, h = 0.674. */
export const BUDGET = { ordinary: 0.049, dark: 0.264, darkEnergy: 0.685 };
