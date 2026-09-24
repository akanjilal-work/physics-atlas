// Plasma confinement: plasma parameters, D-T reactivity, the Lawson criterion and
// fusion gain, an analytic large-aspect-ratio tokamak field, field-line tracing,
// and a Boris pusher for guiding-centre drifts. Pure math. No DOM, no Three.js.
//
// Geometry convention (shared with the scene): y is vertical, the torus axis is
// the y axis. R = sqrt(x² + z²) is the major radius, φ = atan2(z, x).

// ---------------------------------------------------------------- constants

export const EPS0 = 8.8541878128e-12; // F/m
export const MU0 = 1.25663706212e-6; // N/A²
export const QE = 1.602176634e-19; // C
export const ME = 9.1093837015e-31; // kg
/** Alpha particle energy from D + T → ⁴He (3.52 MeV) + n (14.07 MeV), in keV. */
export const E_ALPHA_KEV = 3520;
/** Total energy per D-T reaction, keV. */
export const E_FUS_KEV = 17590;

// ---------------------------------------------------------------- plasma basics

/** Electron Debye length in metres. n in m⁻³, Te in eV. */
export function debyeLength(n: number, TeV: number): number {
  return Math.sqrt((EPS0 * TeV * QE) / (n * QE * QE));
}

/** Electron plasma angular frequency in rad/s. n in m⁻³. */
export function plasmaOmega(n: number): number {
  return Math.sqrt((n * QE * QE) / (EPS0 * ME));
}

/** Number of electrons inside a Debye sphere. Large means collective behaviour. */
export function debyeNumber(n: number, TeV: number): number {
  const l = debyeLength(n, TeV);
  return (4 / 3) * Math.PI * n * l * l * l;
}

// ---------------------------------------------------------------- reactivity and Lawson

/**
 * D-T thermal reactivity <σv> in m³/s, Bosch & Hale, Nucl. Fusion 32 (1992) 611.
 * T in keV, valid from 0.2 to 100 keV.
 */
export function sigmaVDT(T: number): number {
  const BG = 34.3827;
  const mrc2 = 1124656;
  const C1 = 1.17302e-9, C2 = 1.51361e-2, C3 = 7.51886e-2, C4 = 4.60643e-3, C5 = 1.35e-2, C6 = -1.0675e-4, C7 = 1.366e-5;
  const theta = T / (1 - (T * (C2 + T * (C4 + T * C6))) / (1 + T * (C3 + T * (C5 + T * C7))));
  const xi = Math.cbrt((BG * BG) / (4 * theta));
  const cm3 = C1 * theta * Math.sqrt(xi / (mrc2 * T * T * T)) * Math.exp(-3 * xi);
  return cm3 * 1e-6;
}

/**
 * Ignition requirement on n τ_E (m⁻³ s) at temperature T (keV), for a 50:50 D-T
 * plasma with n electrons per m³ and Te = Ti = T. Alpha heating ¼ n² <σv> E_α must
 * match the loss 3 n T / τ_E. Bremsstrahlung and impurities are ignored.
 */
export function ignitionNTau(T: number): number {
  return (12 * T) / (E_ALPHA_KEV * sigmaVDT(T));
}

/** Ignition requirement on the triple product n T τ_E (keV s m⁻³). */
export const ignitionTriple = (T: number): number => T * ignitionNTau(T);

/** Minimum of the ignition triple product over temperature. Returns [T, nTτ]. */
export function minIgnitionTriple(): [number, number] {
  let bestT = 1;
  let best = Infinity;
  for (let T = 2; T <= 60; T += 0.01) {
    const v = ignitionTriple(T);
    if (v < best) {
      best = v;
      bestT = T;
    }
  }
  return [bestT, best];
}

/** Ratio of fusion power to alpha heating power. */
export const FUS_PER_ALPHA = E_FUS_KEV / E_ALPHA_KEV;

/**
 * Steady-state gain Q = P_fus / P_heat. External heating tops up whatever alpha
 * heating does not cover: P_heat = P_loss - P_α. With f = nτ / nτ_ign,
 * Q = 5 f / (1 - f). f ≥ 1 is ignition (Q infinite).
 */
export function gainQ(nTau: number, T: number): number {
  const f = nTau / ignitionNTau(T);
  if (f >= 1) return Infinity;
  return (FUS_PER_ALPHA * f) / (1 - f);
}

/** n τ_E needed for a given Q at temperature T. */
export function nTauForQ(Q: number, T: number): number {
  const f = Number.isFinite(Q) ? Q / (Q + FUS_PER_ALPHA) : 1;
  return f * ignitionNTau(T);
}

// ---------------------------------------------------------------- tokamak field

/** Cylindrical edge safety factor q_a = 2π a² B_φ / (μ0 R0 I_p). SI units, I in A. */
export function edgeQ(B0: number, Ip: number, R0: number, a: number): number {
  if (Ip <= 0) return Infinity;
  return (2 * Math.PI * a * a * B0) / (MU0 * R0 * Ip);
}

/** Toroidal field of N coils each carrying I, from Ampère's law: μ0 N I / (2π R). */
export const toroidalField = (N: number, I: number, R: number): number => (MU0 * N * I) / (2 * Math.PI * R);

/**
 * Field of N circular coils (radius c, centred on R0 in the vertical plane at
 * angle φ_k) by Biot-Savart with `seg` straight segments per coil. SI units.
 * Writes B at (x, y, z) into out.
 */
export function coilSetField(N: number, R0: number, c: number, I: number, seg: number, x: number, y: number, z: number, out: Float64Array): void {
  let bx = 0, by = 0, bz = 0;
  const k = (MU0 * I) / (4 * Math.PI);
  for (let j = 0; j < N; j++) {
    const phi = (2 * Math.PI * (j + 0.5)) / N;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    for (let s = 0; s < seg; s++) {
      const t0 = (2 * Math.PI * s) / seg;
      const t1 = (2 * Math.PI * (s + 1)) / seg;
      // Coil point: R = R0 + c cos t, y = c sin t. Positive current runs so the field inside points along +φ.
      const Ra = R0 + c * Math.cos(t0), ya = c * Math.sin(t0);
      const Rb = R0 + c * Math.cos(t1), yb = c * Math.sin(t1);
      const ax = Ra * cp, az = Ra * sp, bxp = Rb * cp, bzp = Rb * sp;
      const dlx = bxp - ax, dly = yb - ya, dlz = bzp - az;
      const mx = 0.5 * (ax + bxp) - x, my = 0.5 * (ya + yb) - y, mz = 0.5 * (az + bzp) - z;
      // dB = k dl × r̂ / r², with r from the source to the field point = -m
      const rx = -mx, ry = -my, rz = -mz;
      const r2 = rx * rx + ry * ry + rz * rz;
      const f = k / (r2 * Math.sqrt(r2));
      bx += f * (dly * rz - dlz * ry);
      by += f * (dlz * rx - dlx * rz);
      bz += f * (dlx * ry - dly * rx);
    }
  }
  out[0] = bx;
  out[1] = by;
  out[2] = bz;
}

/**
 * Analytic large-aspect-ratio tokamak with circular, concentric flux surfaces.
 * B_φ = -B0 R0 / R (the minus sign sets the direction so ions drift upward).
 * B_θ = B_θc(r) R0 / R, where B_θc comes from a parabolic current profile
 * j ∝ 1 - r²/a². The R0/R factor keeps ∇·B = 0 exactly and makes every
 * circle r = const an exact flux surface.
 */
export interface Tokamak {
  R0: number;
  a: number;
  /** Toroidal field at R0 (sim units). */
  B0: number;
  /** 1 / q_a in the cylindrical sense. Zero means no plasma current. */
  iota: number;
}

/** Cylindrical safety factor on the surface r: q_a / (2 - x²) inside, q_a x² outside. */
export function qCyl(tk: Tokamak, r: number): number {
  if (tk.iota <= 0) return Infinity;
  const x = r / tk.a;
  const qa = 1 / tk.iota;
  return x <= 1 ? qa / (2 - x * x) : qa * x * x;
}

/**
 * Exact q of the model field: q = q_cyl(r) / sqrt(1 - ε²), with ε = r / R0.
 * The toroidal factor comes from averaging dφ/dθ ∝ 1/R around the surface.
 */
export function qExact(tk: Tokamak, r: number): number {
  const e = r / tk.R0;
  return qCyl(tk, r) / Math.sqrt(1 - e * e);
}

/** B at (x, y, z) written into out. */
export function tokamakB(tk: Tokamak, x: number, y: number, z: number, out: Float64Array): void {
  const R = Math.sqrt(x * x + z * z);
  const cp = x / R, sp = z / R;
  const dR = R - tk.R0;
  const r = Math.sqrt(dR * dR + y * y);
  const Bphi = (-tk.B0 * tk.R0) / R;
  let bR = 0, bY = 0;
  if (tk.iota > 0 && r > 1e-12) {
    const xx = r / tk.a;
    const g = xx <= 1 ? 2 * xx - xx * xx * xx : 1 / xx;
    const Bth = ((tk.B0 * tk.a * tk.iota) / tk.R0) * g * (tk.R0 / R);
    // θ̂ = -sinθ R̂ + cosθ ŷ with cosθ = dR / r, sinθ = y / r
    bR = (-Bth * y) / r;
    bY = (Bth * dR) / r;
  }
  // R̂ = (cp, 0, sp), φ̂ = (-sp, 0, cp)
  out[0] = bR * cp - Bphi * sp;
  out[1] = bY;
  out[2] = bR * sp + Bphi * cp;
}

const kb = new Float64Array(3);

function unitB(tk: Tokamak, x: number, y: number, z: number, o: Float64Array): void {
  tokamakB(tk, x, y, z, kb);
  const n = Math.hypot(kb[0], kb[1], kb[2]) || 1;
  o[0] = kb[0] / n;
  o[1] = kb[1] / n;
  o[2] = kb[2] / n;
}

const k1 = new Float64Array(3), k2 = new Float64Array(3), k3 = new Float64Array(3), k4 = new Float64Array(3);

/** One RK4 step of length ds along the field line. p is [x, y, z], updated in place. */
export function fieldLineStep(tk: Tokamak, p: Float64Array, ds: number): void {
  const [x, y, z] = [p[0], p[1], p[2]];
  unitB(tk, x, y, z, k1);
  unitB(tk, x + 0.5 * ds * k1[0], y + 0.5 * ds * k1[1], z + 0.5 * ds * k1[2], k2);
  unitB(tk, x + 0.5 * ds * k2[0], y + 0.5 * ds * k2[1], z + 0.5 * ds * k2[2], k3);
  unitB(tk, x + ds * k3[0], y + ds * k3[1], z + ds * k3[2], k4);
  p[0] = x + (ds / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  p[1] = y + (ds / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  p[2] = z + (ds / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
}

/**
 * Trace a field line from the outboard midplane of surface r, starting at
 * poloidal angle θ0 and toroidal angle φ0, for `n` points spaced ds apart.
 * Writes xyz into out (length ≥ 3n).
 */
export function traceFieldLine(tk: Tokamak, r: number, theta0: number, phi0: number, ds: number, n: number, out: Float32Array): void {
  const p = new Float64Array(3);
  const R = tk.R0 + r * Math.cos(theta0);
  p[0] = R * Math.cos(phi0);
  p[1] = r * Math.sin(theta0);
  p[2] = R * Math.sin(phi0);
  for (let i = 0; i < n; i++) {
    out[3 * i] = p[0];
    out[3 * i + 1] = p[1];
    out[3 * i + 2] = p[2];
    fieldLineStep(tk, p, ds);
  }
}

/**
 * Measure q on surface r by tracing a field line numerically until it has gone once
 * around poloidally. Returns toroidal turns per poloidal turn and the largest
 * departure from the starting surface (a flux-surface check).
 */
export function measureQ(tk: Tokamak, r: number, ds = 0.01): { q: number; drift: number } {
  if (tk.iota <= 0) return { q: Infinity, drift: 0 };
  const p = new Float64Array([tk.R0 + r, 0, 0]);
  let th = 0, ph = 0;
  let prevTh = 0, prevPh = 0;
  let drift = 0;
  for (let i = 0; i < 5e6; i++) {
    fieldLineStep(tk, p, ds);
    const R = Math.hypot(p[0], p[2]);
    const t = Math.atan2(p[1], R - tk.R0);
    const f = Math.atan2(p[2], p[0]);
    let dt = t - prevTh;
    if (dt > Math.PI) dt -= 2 * Math.PI;
    if (dt < -Math.PI) dt += 2 * Math.PI;
    let df = f - prevPh;
    if (df > Math.PI) df -= 2 * Math.PI;
    if (df < -Math.PI) df += 2 * Math.PI;
    const thNew = th + dt;
    if (Math.abs(thNew) >= 2 * Math.PI) {
      const frac = (2 * Math.PI - Math.abs(th)) / Math.abs(dt);
      ph += frac * df;
      return { q: Math.abs(ph) / (2 * Math.PI), drift };
    }
    th = thNew;
    ph += df;
    prevTh = t;
    prevPh = f;
    drift = Math.max(drift, Math.abs(Math.hypot(R - tk.R0, p[1]) - r));
  }
  return { q: NaN, drift };
}

// ---------------------------------------------------------------- particles

export interface Particle {
  /** [x, y, z, vx, vy, vz] */
  s: Float64Array;
  qm: number;
  t: number;
  alive: boolean;
}

export function makeParticle(qm: number): Particle {
  return { s: new Float64Array(6), qm, t: 0, alive: true };
}

const Bb = new Float64Array(3);

/**
 * One Boris step in the tokamak field plus a uniform vertical electric field Ey.
 * Half electric kick, exact-norm magnetic rotation, half kick, drift.
 */
export function borisStep(p: Particle, tk: Tokamak, Ey: number, dt: number): void {
  const s = p.s;
  tokamakB(tk, s[0], s[1], s[2], Bb);
  const h = 0.5 * p.qm * dt;
  const vmx = s[3];
  const vmy = s[4] + h * Ey;
  const vmz = s[5];
  const tx = h * Bb[0], ty = h * Bb[1], tz = h * Bb[2];
  const f = 2 / (1 + tx * tx + ty * ty + tz * tz);
  const sx = f * tx, sy = f * ty, sz = f * tz;
  const px = vmx + (vmy * tz - vmz * ty);
  const py = vmy + (vmz * tx - vmx * tz);
  const pz = vmz + (vmx * ty - vmy * tx);
  const vx = vmx + (py * sz - pz * sy);
  const vy = vmy + (pz * sx - px * sz) + h * Ey;
  const vz = vmz + (px * sy - py * sx);
  s[3] = vx;
  s[4] = vy;
  s[5] = vz;
  s[0] += vx * dt;
  s[1] += vy * dt;
  s[2] += vz * dt;
  p.t += dt;
}

/**
 * Guiding-centre vertical drift speed in a 1/R toroidal field (grad-B plus
 * curvature): v_d = (v∥² + v⊥²/2) / (Ω R), Ω = |q/m| B. Signed: +y for positive charge
 * with the field direction used here.
 */
export function verticalDrift(vpar: number, vperp: number, qm: number, B: number, R: number): number {
  return (Math.sign(qm) * (vpar * vpar + 0.5 * vperp * vperp)) / (Math.abs(qm) * B * R);
}

/**
 * Launch a particle with guiding centre at minor radius r, poloidal angle θ,
 * toroidal angle φ, speed v, pitch angle α to B (cos α sets v∥) and gyrophase ψ.
 * The start point is offset from the guiding centre by the gyroradius.
 */
export function launch(p: Particle, tk: Tokamak, r: number, theta: number, phi: number, v: number, pitch: number, psi: number): void {
  const R = tk.R0 + r * Math.cos(theta);
  const gx = R * Math.cos(phi), gy = r * Math.sin(theta), gz = R * Math.sin(phi);
  tokamakB(tk, gx, gy, gz, Bb);
  const B = Math.hypot(Bb[0], Bb[1], Bb[2]);
  const bx = Bb[0] / B, by = Bb[1] / B, bz = Bb[2] / B;
  // e1 = vertical projected perpendicular to b, e2 = b × e1
  let ux = -by * bx, uy = 1 - by * by, uz = -by * bz;
  const un = Math.hypot(ux, uy, uz);
  ux /= un; uy /= un; uz /= un;
  const wx = by * uz - bz * uy, wy = bz * ux - bx * uz, wz = bx * uy - by * ux;
  const c = Math.cos(psi), sn = Math.sin(psi);
  const ex = c * ux + sn * wx, ey = c * uy + sn * wy, ez = c * uz + sn * wz;
  const vpar = v * Math.cos(pitch), vperp = v * Math.sin(pitch);
  const s = p.s;
  s[3] = vpar * bx + vperp * ex;
  s[4] = vpar * by + vperp * ey;
  s[5] = vpar * bz + vperp * ez;
  // x = gc - (u × b) / (qm B) with u the perpendicular velocity
  const ux2 = vperp * ex, uy2 = vperp * ey, uz2 = vperp * ez;
  const k = 1 / (p.qm * B);
  s[0] = gx - k * (uy2 * bz - uz2 * by);
  s[1] = gy - k * (uz2 * bx - ux2 * bz);
  s[2] = gz - k * (ux2 * by - uy2 * bx);
  p.t = 0;
  p.alive = true;
}

/** Minor radius of a point from the magnetic axis. */
export function minorRadius(tk: Tokamak, x: number, y: number, z: number): number {
  const R = Math.hypot(x, z);
  return Math.hypot(R - tk.R0, y);
}

/**
 * Charge-separation field for the drift demo. Treat the plasma as a slab that
 * polarises when ions and electrons drift apart: E_y = -K (ȳ_ion - ȳ_e). K stands
 * for n e / ε0, reduced enormously so the E×B loss is slow enough to watch.
 */
export const polarisationField = (K: number, yIon: number, yEl: number): number => -K * (yIon - yEl);
