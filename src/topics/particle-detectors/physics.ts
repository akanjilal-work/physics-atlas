// Pure physics for the collider-detector topic. No DOM, no Three.js.
// Units: GeV for energy and momentum, tesla for field, metres for length.

/** p [GeV/c] = C_GEV · B [T] · R [m] for a unit charge. C_GEV = c / 1e9 in SI. */
export const C_GEV = 0.299792458;
/** Operating field of the CMS solenoid. */
export const B_CMS = 3.8;

// PDG masses and widths (GeV).
export const M_Z = 91.1876;
export const G_Z = 2.4952;
export const M_W = 80.369;
export const G_W = 2.085;
export const M_H = 125.2;
export const M_MU = 0.1056584;
export const M_E = 0.000511;
export const M_PI = 0.13957;

/** Lead tungstate (PbWO4), the CMS ECAL crystal. PDG: X0 = 0.8903 cm, Ec = 9.64 MeV. */
export const PBWO4 = { X0cm: 0.8903, EcGeV: 0.00964 };

// ---------------------------------------------------------------------------
// Curvature

export function pTFromRadius(B: number, R: number): number {
  return C_GEV * Math.abs(B) * R;
}

export function radiusFromPT(pT: number, B: number): number {
  const b = Math.abs(B);
  return b < 1e-9 ? Infinity : pT / (C_GEV * b);
}

/** Sagitta of a circular arc of radius R over a chord L (both in m). */
export function sagitta(R: number, L: number): number {
  if (!Number.isFinite(R)) return 0;
  return R - Math.sqrt(Math.max(0, R * R - (L * L) / 4));
}

// ---------------------------------------------------------------------------
// Heitler toy model of an electromagnetic shower.
// One split per radiation length: after t X0 there are 2^t particles of energy E0/2^t.
// Multiplication stops when the energy per particle reaches Ec.

export function heitlerN(t: number): number {
  return Math.pow(2, t);
}
export function heitlerTmax(E0: number, Ec: number): number {
  return E0 <= Ec ? 0 : Math.log(E0 / Ec) / Math.LN2;
}
export function heitlerNmax(E0: number, Ec: number): number {
  return Math.max(1, E0 / Ec);
}
/** PDG longitudinal-profile estimate of shower maximum for an incident electron, in X0. */
export function pdgTmaxElectron(E0: number, Ec: number): number {
  return Math.log(E0 / Ec) - 0.5;
}

// ---------------------------------------------------------------------------
// Four-vectors

export interface P4 { E: number; px: number; py: number; pz: number }

export function p4(px: number, py: number, pz: number, m: number): P4 {
  return { E: Math.sqrt(px * px + py * py + pz * pz + m * m), px, py, pz };
}

export function invMass(a: P4, b: P4): number {
  const E = a.E + b.E;
  const x = a.px + b.px;
  const y = a.py + b.py;
  const z = a.pz + b.pz;
  return Math.sqrt(Math.max(0, E * E - x * x - y * y - z * z));
}

export function massOf(list: P4[]): number {
  let E = 0, x = 0, y = 0, z = 0;
  for (const q of list) { E += q.E; x += q.px; y += q.py; z += q.pz; }
  return Math.sqrt(Math.max(0, E * E - x * x - y * y - z * z));
}

export const pT = (q: { px: number; py: number }) => Math.hypot(q.px, q.py);

export function eta(q: P4): number {
  const t = pT(q);
  if (t < 1e-12) return q.pz >= 0 ? 10 : -10;
  return Math.asinh(q.pz / t);
}

/** Boost a four-vector by velocity (bx, by, bz). */
export function boost(q: P4, bx: number, by: number, bz: number): P4 {
  const b2 = bx * bx + by * by + bz * bz;
  if (b2 < 1e-16) return { ...q };
  const g = 1 / Math.sqrt(1 - b2);
  const bp = bx * q.px + by * q.py + bz * q.pz;
  const g2 = (g - 1) / b2;
  return {
    E: g * (q.E + bp),
    px: q.px + g2 * bp * bx + g * bx * q.E,
    py: q.py + g2 * bp * by + g * by * q.E,
    pz: q.pz + g2 * bp * bz + g * bz * q.E,
  };
}

/** Two-body decay of a parent (lab four-vector P, mass M) into masses m1, m2 along unit direction (ux,uy,uz) in the rest frame. */
export function twoBody(P: P4, M: number, m1: number, m2: number, ux: number, uy: number, uz: number): [P4, P4] {
  const pstar = Math.sqrt(Math.max(0, (M * M - (m1 + m2) ** 2) * (M * M - (m1 - m2) ** 2))) / (2 * M);
  const a = p4(pstar * ux, pstar * uy, pstar * uz, m1);
  const b = p4(-pstar * ux, -pstar * uy, -pstar * uz, m2);
  const bx = P.px / P.E, by = P.py / P.E, bz = P.pz / P.E;
  return [boost(a, bx, by, bz), boost(b, bx, by, bz)];
}

/** Missing transverse momentum: minus the vector sum of visible transverse momenta. */
export function missingET(list: { px: number; py: number }[]): { mex: number; mey: number; met: number; phi: number } {
  let x = 0, y = 0;
  for (const q of list) { x += q.px; y += q.py; }
  const mex = -x, mey = -y;
  return { mex, mey, met: Math.hypot(mex, mey), phi: Math.atan2(mey, mex) };
}

/** Transverse mass of a lepton and missing momentum. Has a sharp edge at the parent mass. */
export function transverseMass(pt1: number, phi1: number, pt2: number, phi2: number): number {
  return Math.sqrt(Math.max(0, 2 * pt1 * pt2 * (1 - Math.cos(phi1 - phi2))));
}

// ---------------------------------------------------------------------------
// Random numbers (seeded, reproducible)

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(r: Rng): number {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
/** Relativistic-enough Breit-Wigner (Cauchy) sample, truncated to [lo, hi]. */
export function breitWigner(r: Rng, M: number, G: number, lo: number, hi: number): number {
  for (let k = 0; k < 100; k++) {
    const m = M + (G / 2) * Math.tan(Math.PI * (r() - 0.5));
    if (m > lo && m < hi) return m;
  }
  return M;
}
function isoDir(r: Rng): [number, number, number] {
  const c = 2 * r() - 1;
  const s = Math.sqrt(1 - c * c);
  const f = 2 * Math.PI * r();
  return [s * Math.cos(f), s * Math.sin(f), c];
}

// ---------------------------------------------------------------------------
// Detector geometry (generic, CMS-like proportions, metres). A layer is entered
// when a particle leaves the box r < rIn and |z| < zIn.

export const GEO = {
  beam: 0.03,
  tracker: { rIn: 0.04, rOut: 1.1, zOut: 2.8 },
  ecal: { rIn: 1.29, rOut: 1.55, zIn: 3.15, zOut: 3.45 },
  hcal: { rIn: 1.77, rOut: 2.9, zIn: 3.9, zOut: 5.0 },
  coil: { rIn: 2.98, rOut: 3.4, zOut: 3.9 },
  yoke: { rIn: 3.5, rOut: 5.9, zOut: 5.4 },
  muonStations: [3.8, 4.4, 5.0, 5.6],
  muonDisks: [5.7, 6.2, 6.7],
  outer: { r: 5.9, z: 7.0 },
  trackerLayers: [0.044, 0.073, 0.102, 0.16, 0.255, 0.339, 0.418, 0.498, 0.608, 0.692, 0.78, 0.868, 0.965, 1.08],
};

/** Axial field Bz at radius r, height z. Uniform inside the coil, returned about half as strong and reversed in the iron yoke. */
export function fieldAt(B: number, r: number, z: number): number {
  const az = Math.abs(z);
  if (r < GEO.coil.rIn && az < GEO.coil.zOut) return B;
  if (r >= GEO.yoke.rIn && r < GEO.yoke.rOut && az < GEO.yoke.zOut) return -0.5 * B;
  return 0;
}

// ---------------------------------------------------------------------------
// Particles and events

export type Kind = 'e' | 'mu' | 'gamma' | 'hpm' | 'h0' | 'nu';
export type EventType = 'zmm' | 'zee' | 'hgg' | 'wen' | 'jets';

export interface Particle {
  kind: Kind;
  q: number; // charge in units of e
  p: P4; // true four-momentum
  soft: boolean;
}

export interface GenEvent {
  type: EventType;
  /** For H → γγ: true when the photons came from a Higgs, false for continuum background. */
  signal: boolean;
  particles: Particle[];
}

const ETA_MAX = 2.4;

function softRecoil(r: Rng, list: Particle[], targetX: number, targetY: number): void {
  // Soft charged pions whose summed pT equals (targetX, targetY): the recoil that balances the hard system.
  const n = 6 + Math.floor(r() * 5);
  const tmp: [number, number, number][] = [];
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const pt = 0.35 + 1.4 * r();
    const f = 2 * Math.PI * r();
    const et = (2 * r() - 1) * ETA_MAX;
    const px = pt * Math.cos(f), py = pt * Math.sin(f);
    tmp.push([px, py, pt * Math.sinh(et)]);
    sx += px; sy += py;
  }
  const dx = (targetX - sx) / n, dy = (targetY - sy) / n;
  for (let i = 0; i < n; i++) {
    const [px, py, pz] = tmp[i];
    list.push({ kind: 'hpm', q: r() < 0.5 ? 1 : -1, p: p4(px + dx, py + dy, pz, M_PI), soft: true });
  }
}

function bosonP4(r: Rng, M: number, ptMean: number, yMax: number): P4 {
  const pt = -ptMean * Math.log(Math.max(1e-9, r()));
  const f = 2 * Math.PI * r();
  const y = (2 * r() - 1) * yMax;
  const mt = Math.sqrt(M * M + pt * pt);
  return { E: mt * Math.cosh(y), px: pt * Math.cos(f), py: pt * Math.sin(f), pz: mt * Math.sinh(y) };
}

function twoBodyEvent(r: Rng, M: number, m1: number, m2: number, ptMean: number): [P4, P4, P4] {
  for (let k = 0; k < 200; k++) {
    const P = bosonP4(r, M, ptMean, 1.2);
    const [ux, uy, uz] = isoDir(r);
    const [a, b] = twoBody(P, M, m1, m2, ux, uy, uz);
    if (Math.abs(eta(a)) < ETA_MAX && Math.abs(eta(b)) < ETA_MAX && pT(a) > 10 && pT(b) > 10) return [P, a, b];
  }
  const P = p4(0, 0, 0, M);
  const [a, b] = twoBody(P, M, m1, m2, 1, 0, 0);
  return [P, a, b];
}

function fragment(r: Rng, list: Particle[], ptJ: number, etaJ: number, phiJ: number): void {
  const n = 7 + Math.floor(r() * 9);
  const w: number[] = [];
  let sw = 0;
  for (let i = 0; i < n; i++) { const x = -Math.log(Math.max(1e-9, r())); w.push(x); sw += x; }
  for (let i = 0; i < n; i++) {
    const pt = (ptJ * w[i]) / sw;
    const et = etaJ + 0.09 * gauss(r);
    const f = phiJ + 0.09 * gauss(r);
    const u = r();
    const kind: Kind = u < 0.6 ? 'hpm' : u < 0.85 ? 'gamma' : 'h0';
    const m = kind === 'hpm' ? M_PI : kind === 'h0' ? 0.4976 : 0;
    list.push({ kind, q: kind === 'hpm' ? (r() < 0.5 ? 1 : -1) : 0, p: p4(pt * Math.cos(f), pt * Math.sin(f), pt * Math.sinh(et), m), soft: false });
  }
}

export function generateEvent(type: EventType, r: Rng, hggSignalFraction = 0.14): GenEvent {
  const particles: Particle[] = [];
  let signal = true;
  if (type === 'zmm' || type === 'zee') {
    const M = breitWigner(r, M_Z, G_Z, 60, 120);
    const ml = type === 'zmm' ? M_MU : M_E;
    const [P, a, b] = twoBodyEvent(r, M, ml, ml, 6);
    const kind: Kind = type === 'zmm' ? 'mu' : 'e';
    const s = r() < 0.5 ? 1 : -1;
    particles.push({ kind, q: s, p: a, soft: false }, { kind, q: -s, p: b, soft: false });
    softRecoil(r, particles, -P.px, -P.py);
  } else if (type === 'hgg') {
    signal = r() < hggSignalFraction;
    // Continuum diphoton background falls roughly exponentially with mass.
    const M = signal ? M_H : 100 - 30 * Math.log(1 - r() * (1 - Math.exp(-60 / 30)));
    const [P, a, b] = twoBodyEvent(r, M, 0, 0, signal ? 12 : 8);
    particles.push({ kind: 'gamma', q: 0, p: a, soft: false }, { kind: 'gamma', q: 0, p: b, soft: false });
    softRecoil(r, particles, -P.px, -P.py);
  } else if (type === 'wen') {
    const M = breitWigner(r, M_W, G_W, 50, 110);
    const [P, a, b] = twoBodyEvent(r, M, M_E, 0, 5);
    const q = r() < 0.5 ? 1 : -1;
    particles.push({ kind: 'e', q, p: a, soft: false }, { kind: 'nu', q: 0, p: b, soft: false });
    softRecoil(r, particles, -P.px, -P.py);
  } else {
    const pt1 = 40 - 40 * Math.log(Math.max(1e-9, r()));
    const f1 = 2 * Math.PI * r();
    const f2 = f1 + Math.PI + 0.12 * gauss(r);
    const pt2 = pt1 * (0.85 + 0.15 * r());
    fragment(r, particles, pt1, (2 * r() - 1) * 2.0, f1);
    fragment(r, particles, pt2, (2 * r() - 1) * 2.0, f2);
    let sx = 0, sy = 0;
    for (const q of particles) { sx += q.p.px; sy += q.p.py; }
    softRecoil(r, particles, -sx, -sy);
  }
  return { type, signal, particles };
}

// ---------------------------------------------------------------------------
// Reconstruction with CMS-like resolutions.

/** Relative pT resolution of a track. Both terms scale as 1/B: a weaker field means a smaller sagitta. */
export function trackResolution(pt: number, B: number): number {
  const b = Math.abs(B);
  if (b < 0.05) return Infinity;
  const s = B_CMS / b;
  return Math.hypot(1.5e-4 * pt * s, 0.008 * s);
}
/** ECAL: 2.8%/sqrt(E) ⊕ 12%/E ⊕ 0.3%. */
export function ecalResolution(E: number): number {
  return Math.hypot(0.028 / Math.sqrt(E), 0.12 / E, 0.003);
}
/** HCAL: about 100%/sqrt(E) ⊕ 5%. */
export function hcalResolution(E: number): number {
  return Math.hypot(1 / Math.sqrt(E), 0.05);
}

export interface RecoParticle {
  kind: Kind;
  /** Measured four-momentum, or null when this detector could not measure it (a muon with B = 0). */
  p: P4 | null;
  /** Energy deposited in ECAL or HCAL (GeV), for drawing. */
  ecal: number;
  hcal: number;
}

export interface RecoEvent {
  reco: RecoParticle[];
  mex: number;
  mey: number;
  met: number;
  metPhi: number;
  /** The quantity histogrammed for this event type: M(ll), M(γγ), mT(eν) or M(jj). NaN when not measurable. */
  mass: number;
  massKind: 'M' | 'mT';
}

function scaled(q: P4, f: number, m: number): P4 {
  return p4(q.px * f, q.py * f, q.pz * f, m);
}

export function reconstruct(ev: GenEvent, B: number, r: Rng, smear = true): RecoEvent {
  const reco: RecoParticle[] = [];
  const g = () => (smear ? gauss(r) : 0);
  const useTracks = Math.abs(B) >= 0.05;
  for (const pa of ev.particles) {
    const E = pa.p.E;
    let p: P4 | null = null;
    let ecal = 0, hcal = 0;
    switch (pa.kind) {
      case 'mu':
        if (useTracks) p = scaled(pa.p, 1 + trackResolution(pT(pa.p), B) * g(), M_MU);
        break;
      case 'e':
      case 'gamma':
        ecal = E * Math.max(0.05, 1 + ecalResolution(E) * g());
        p = scaled(pa.p, ecal / E, 0);
        break;
      case 'hpm':
        if (!useTracks || E > 200) {
          hcal = E * Math.max(0.05, 1 + hcalResolution(E) * g());
          p = scaled(pa.p, hcal / E, M_PI);
        } else {
          p = scaled(pa.p, 1 + trackResolution(pT(pa.p), B) * g(), M_PI);
          hcal = E;
        }
        break;
      case 'h0':
        hcal = E * Math.max(0.05, 1 + hcalResolution(E) * g());
        p = scaled(pa.p, hcal / E, 0);
        break;
      case 'nu':
        break;
    }
    reco.push({ kind: pa.kind, p, ecal, hcal });
  }
  const vis: P4[] = [];
  for (const x of reco) if (x.p) vis.push(x.p);
  const m = missingET(vis);
  let mass = NaN;
  let massKind: 'M' | 'mT' = 'M';
  const lead = (k: Kind) => reco.filter((x) => x.kind === k && x.p).sort((a, b) => pT(b.p!) - pT(a.p!));
  if (ev.type === 'zmm' || ev.type === 'zee') {
    const l = lead(ev.type === 'zmm' ? 'mu' : 'e');
    if (l.length >= 2) mass = invMass(l[0].p!, l[1].p!);
  } else if (ev.type === 'hgg') {
    const l = lead('gamma');
    if (l.length >= 2) mass = invMass(l[0].p!, l[1].p!);
  } else if (ev.type === 'wen') {
    massKind = 'mT';
    const l = lead('e');
    if (l.length) mass = transverseMass(pT(l[0].p!), Math.atan2(l[0].p!.py, l[0].p!.px), m.met, m.phi);
  } else {
    mass = massOf(reco.filter((x) => x.p && !ev.particles[reco.indexOf(x)].soft).map((x) => x.p!));
  }
  return { reco, mex: m.mex, mey: m.mey, met: m.met, metPhi: m.phi, mass, massKind };
}

// ---------------------------------------------------------------------------
// Tracking through the detector.

export type Stop = 'ecal' | 'hcal' | 'out' | 'loop';

export interface TraceResult {
  n: number;
  stop: Stop;
  /** Unit direction at the end point (for orienting calorimeter towers). */
  dx: number; dy: number; dz: number;
  /** Indices (into the point list) where a muon crossed a muon station. */
  hits: number[];
}

const insideBox = (r: number, z: number, rIn: number, zIn: number) => r < rIn && Math.abs(z) < zIn;

/**
 * Step a particle out from the origin with fixed path length ds, writing positions into out (xyz triples).
 * Charged particles turn in the axial field: dφ = -q Bz ds_T / R with R = pT / (0.3 Bz).
 */
export function trace(pa: Particle, B: number, ds: number, out: Float32Array, maxPts: number): TraceResult {
  const { px, py, pz } = pa.p;
  const p = Math.hypot(px, py, pz);
  const ptot = p;
  const sinT = Math.hypot(px, py) / p;
  // (ux, uy) is the unit transverse direction. Straight along z if pT = 0.
  let ux = sinT > 1e-12 ? px / (p * sinT) : 0;
  let uy = sinT > 1e-12 ? py / (p * sinT) : 0;
  const uz = pz / p;
  let x = 0, y = 0, z = 0;
  let n = 0;
  out[0] = 0; out[1] = 0; out[2] = 0; n = 1;
  const hits: number[] = [];
  let stop: Stop = 'loop';
  const charged = pa.q !== 0;
  const pT0 = ptot * sinT;
  let prevR = 0;
  let prevZ = 0;
  while (n < maxPts) {
    // Split rotation (half, step, half): each step is an exact chord of the circle.
    let c = 1, s = 0;
    if (charged && sinT > 1e-9) {
      const Bz = fieldAt(B, Math.hypot(x, y), z);
      if (Bz !== 0) {
        const half = (-pa.q * C_GEV * Bz * ds * sinT) / pT0 / 2;
        c = Math.cos(half);
        s = Math.sin(half);
      }
    }
    let nx = ux * c - uy * s;
    uy = ux * s + uy * c;
    ux = nx;
    x += ux * ds * sinT; y += uy * ds * sinT; z += uz * ds;
    nx = ux * c - uy * s;
    uy = ux * s + uy * c;
    ux = nx;
    out[n * 3] = x; out[n * 3 + 1] = y; out[n * 3 + 2] = z;
    n++;
    const r = Math.hypot(x, y);
    if (pa.kind === 'mu') {
      const az = Math.abs(z);
      for (const rs of GEO.muonStations) if (prevR < rs && r >= rs && az < GEO.yoke.zOut) hits.push(n - 1);
      for (const zs of GEO.muonDisks) if (Math.abs(prevZ) < zs && az >= zs && r < GEO.outer.r) hits.push(n - 1);
      if (!insideBox(r, z, GEO.outer.r, GEO.outer.z)) { stop = 'out'; break; }
    } else if (pa.kind === 'e' || pa.kind === 'gamma') {
      if (!insideBox(r, z, GEO.ecal.rIn, GEO.ecal.zIn)) { stop = 'ecal'; break; }
    } else {
      if (!insideBox(r, z, GEO.hcal.rIn, GEO.hcal.zIn)) { stop = 'hcal'; break; }
    }
    prevR = r;
    prevZ = z;
  }
  return { n, stop, dx: ux * sinT, dy: uy * sinT, dz: uz, hits };
}

// ---------------------------------------------------------------------------
// Histogram peak estimate: smoothed mode, then the mean of bins within ±w of it.

export function peakEstimate(bins: ArrayLike<number>, lo: number, width: number, w: number): number {
  let best = -1, bi = -1;
  for (let i = 0; i < bins.length; i++) {
    const s = (bins[i - 1] ?? 0) + 2 * bins[i] + (bins[i + 1] ?? 0);
    if (s > best) { best = s; bi = i; }
  }
  if (best <= 0) return NaN;
  const c = lo + (bi + 0.5) * width;
  let sw = 0, sx = 0;
  for (let i = 0; i < bins.length; i++) {
    const x = lo + (i + 0.5) * width;
    if (Math.abs(x - c) <= w) { sw += bins[i]; sx += bins[i] * x; }
  }
  return sw > 0 ? sx / sw : NaN;
}
