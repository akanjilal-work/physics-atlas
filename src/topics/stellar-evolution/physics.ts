// Stellar evolution: main-sequence scaling laws, Stefan–Boltzmann, endpoints,
// and simplified schematic tracks on the Hertzsprung–Russell diagram.
// Pure functions, no DOM. Solar units unless a name says otherwise.

/** IAU 2015 nominal solar luminosity (W). */
export const L_SUN = 3.828e26;
/** IAU 2015 nominal solar radius (m). */
export const R_SUN = 6.957e8;
/** IAU 2015 nominal solar effective temperature (K). */
export const T_SUN = 5772;
/** Stefan–Boltzmann constant (W m^-2 K^-4). */
export const SIGMA = 5.670374419e-8;
/** Chandrasekhar limit used in the text (solar masses). */
export const M_CH = 1.4;
/** Chandrasekhar mass for a C/O composition (mu_e = 2), used in the white dwarf radius fit. */
export const M_CH_CO = 1.44;
/** Approximate initial-mass boundaries between endpoints (solar masses). */
export const M_WD_MAX = 8;
export const M_BH_MIN = 25;
/** Main-sequence lifetime of the Sun in this model (Gyr). */
export const T_MS_SUN = 10;

export type Endpoint = 'white dwarf' | 'neutron star' | 'black hole';

/** Piecewise main-sequence mass–luminosity relation (L in L_sun, M in M_sun). */
export function msLuminosity(M: number): number {
  if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
  if (M < 2) return Math.pow(M, 4);
  if (M < 55) return 1.4 * Math.pow(M, 3.5);
  return 32000 * M;
}

/** Main-sequence radius, R ∝ M^0.8 (R_sun). */
export function msRadius(M: number): number {
  return Math.pow(M, 0.8);
}

/** Effective temperature from L and R in solar units: L = R² (T/T_sun)⁴. */
export function teff(L: number, R: number): number {
  return T_SUN * Math.pow(L / (R * R), 0.25);
}

/** Radius (R_sun) from L (L_sun) and T (K). */
export function radiusFrom(L: number, T: number): number {
  const x = T_SUN / T;
  return Math.sqrt(L) * x * x;
}

/** Stefan–Boltzmann in SI: L = 4π R² σ T⁴ (W), R in metres. */
export function luminositySI(Rm: number, T: number): number {
  return 4 * Math.PI * Rm * Rm * SIGMA * T * T * T * T;
}

/** Main-sequence lifetime t ≈ 10 Gyr (M/M_sun)^-2.5. */
export function msLifetime(M: number): number {
  return T_MS_SUN * Math.pow(M, -2.5);
}

/** Approximate endpoint by initial mass. Boundaries are uncertain in reality. */
export function endpoint(M: number): Endpoint {
  if (M < M_WD_MAX) return 'white dwarf';
  if (M < M_BH_MIN) return 'neutron star';
  return 'black hole';
}

/** Initial–final mass relation for white dwarfs (Kalirai et al. 2008). */
export function wdMass(M: number): number {
  return 0.109 * M + 0.394;
}

/** White dwarf radius (R_sun) from Nauenberg's (1972) fit to the Chandrasekhar relation. */
export function wdRadius(Mwd: number): number {
  const x = Math.min(Mwd / M_CH_CO, 0.999);
  const a = Math.pow(x, 2 / 3);
  return 0.0112 * Math.sqrt(1 / a - a);
}

/** Tanner Helland's fit to blackbody colour (sRGB, 0..1), valid for roughly 1000 K to 40 000 K. */
export function blackbodyRGB(T: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, T)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  out[0] = c(r);
  out[1] = c(g);
  out[2] = c(b);
  return out;
}

// ---------------------------------------------------------------------------
// Schematic evolutionary tracks.
//
// Keypoints (index: meaning)
//  0 ZAMS, start of core hydrogen burning (from the scaling laws)
//  1 end of the main sequence (TAMS)
//  2 base of the red giant branch (end of subgiant / Hertzsprung gap)
//  3 helium ignition (tip of the red giant branch for low masses)
//  4 start of core helium burning (horizontal branch / red clump, or loop start)
//  5 hottest point of core helium burning (blue loop)
//  6 end of core helium burning (base of the AGB)
//  7 end of nuclear burning (AGB tip, or pre-supernova)
//  8 post-AGB star crossing to the left, planetary nebula (white dwarf path only)
//  9 hot young white dwarf
// 10 cooled white dwarf
//
// Positions after the main sequence are hand-placed approximations to the
// shapes of published solar-metallicity tracks (e.g. Schaller et al. 1992,
// MIST). They are schematic, not model output.

interface RefTrack {
  M: number;
  /** TAMS offset from ZAMS: [dlogT, dlogL]. */
  tams: [number, number];
  /** Points 2..7 as [logT, logL]. */
  pts: [number, number][];
  /** Ages of points 2..7 in units of the main-sequence lifetime. */
  ages: number[];
}

const REF: RefTrack[] = [
  { M: 1, tams: [0.005, 0.3], pts: [[3.665, 0.5], [3.49, 3.35], [3.67, 1.65], [3.69, 1.7], [3.655, 1.9], [3.47, 3.65]], ages: [1.07, 1.13, 1.1301, 1.14, 1.148, 1.152] },
  { M: 5, tams: [-0.05, 0.3], pts: [[3.67, 2.85], [3.61, 3.2], [3.66, 3.05], [4.02, 3.15], [3.62, 3.3], [3.51, 4.0]], ages: [1.01, 1.025, 1.03, 1.1, 1.14, 1.155] },
  { M: 15, tams: [-0.1, 0.3], pts: [[3.85, 4.68], [3.62, 4.72], [3.59, 4.78], [3.66, 4.85], [3.56, 4.9], [3.54, 5.0]], ages: [1.004, 1.01, 1.03, 1.08, 1.1, 1.11] },
  { M: 25, tams: [-0.12, 0.28], pts: [[3.95, 5.34], [3.64, 5.36], [3.58, 5.4], [3.63, 5.42], [3.56, 5.45], [3.55, 5.5]], ages: [1.004, 1.01, 1.03, 1.08, 1.1, 1.11] },
  { M: 40, tams: [-0.12, 0.2], pts: [[4.2, 5.97], [3.95, 5.98], [3.85, 5.98], [4.25, 5.95], [4.6, 5.85], [4.9, 5.75]], ages: [1.004, 1.01, 1.03, 1.08, 1.1, 1.11] },
];

/** Reference masses with drawn tracks. */
export const REF_MASSES = REF.map((r) => r.M);

/** Scrubber position of each keypoint. The clock is stretched after the main sequence. */
export const U_KEY = [0, 0.3, 0.38, 0.48, 0.53, 0.6, 0.67, 0.76, 0.82, 0.88, 1];
export const N_KEY = U_KEY.length;
/** Scrubber position where the endpoint (nebula or supernova) begins. */
export const U_END = U_KEY[7];
/** Scrubber position after which the remnant is settled. */
export const U_REMNANT = 0.88;

export interface Track {
  M: number;
  end: Endpoint;
  tMS: number;
  /** Remnant mass (M_sun). For a black hole this is only a rough placeholder. */
  remnant: number;
  logT: Float64Array;
  logL: Float64Array;
  /** Age in Gyr at each keypoint. */
  age: Float64Array;
  /** Number of keypoints used: 11 for white dwarfs, 8 for supernovae. */
  n: number;
}

export function makeTrack(): Track {
  return {
    M: 1, end: 'white dwarf', tMS: 10, remnant: 0.5,
    logT: new Float64Array(N_KEY), logL: new Float64Array(N_KEY), age: new Float64Array(N_KEY), n: N_KEY,
  };
}

/** Fill `tr` with the schematic track for initial mass M. */
export function buildTrack(M: number, tr: Track = makeTrack()): Track {
  tr.M = M;
  tr.end = endpoint(M);
  tr.tMS = msLifetime(M);
  const lm = Math.log10(M);
  let i = 0;
  while (i < REF.length - 2 && M > REF[i + 1].M) i++;
  const a = REF[i];
  const b = REF[i + 1];
  const w = Math.min(1, Math.max(0, (lm - Math.log10(a.M)) / (Math.log10(b.M) - Math.log10(a.M))));
  const L0 = msLuminosity(M);
  const R0 = msRadius(M);
  tr.logT[0] = Math.log10(teff(L0, R0));
  tr.logL[0] = Math.log10(L0);
  tr.age[0] = 0;
  tr.logT[1] = tr.logT[0] + a.tams[0] + w * (b.tams[0] - a.tams[0]);
  tr.logL[1] = tr.logL[0] + a.tams[1] + w * (b.tams[1] - a.tams[1]);
  tr.age[1] = tr.tMS;
  for (let k = 0; k < 6; k++) {
    tr.logT[k + 2] = a.pts[k][0] + w * (b.pts[k][0] - a.pts[k][0]);
    tr.logL[k + 2] = a.pts[k][1] + w * (b.pts[k][1] - a.pts[k][1]);
    tr.age[k + 2] = tr.tMS * (a.ages[k] + w * (b.ages[k] - a.ages[k]));
  }
  if (tr.end === 'white dwarf') {
    const mwd = wdMass(M);
    const rwd = wdRadius(mwd);
    tr.remnant = mwd;
    tr.n = N_KEY;
    // Post-AGB: leftward at nearly constant luminosity, then down onto the cooling track.
    tr.logT[8] = 5.05;
    tr.logL[8] = tr.logL[7] - 0.05;
    tr.logT[9] = Math.log10(1.2e5);
    tr.logL[9] = Math.log10(rwd * rwd * Math.pow(1.2e5 / T_SUN, 4));
    tr.logT[10] = Math.log10(1.2e4);
    tr.logL[10] = Math.log10(rwd * rwd * Math.pow(1.2e4 / T_SUN, 4));
    tr.age[8] = tr.age[7] + 1e-5; // ~10 000 yr
    tr.age[9] = tr.age[7] + 5e-5;
    tr.age[10] = tr.age[7] + 0.5; // roughly how long a 0.6 M_sun white dwarf takes to cool to ~12 000 K
  } else {
    tr.remnant = tr.end === 'neutron star' ? 1.4 : 0;
    tr.n = 8;
    for (let k = 8; k < N_KEY; k++) {
      tr.logT[k] = tr.logT[7];
      tr.logL[k] = tr.logL[7];
      tr.age[k] = tr.age[7];
    }
  }
  return tr;
}

export interface TrackPoint {
  logT: number;
  logL: number;
  age: number;
  /** Segment index k: the point lies between keypoints k and k+1 (10 means at the end). */
  seg: number;
  /** Fraction through the segment. */
  f: number;
  /** True once a supernova star has exploded (no longer on the HR diagram). */
  gone: boolean;
}

export function makePoint(): TrackPoint {
  return { logT: 0, logL: 0, age: 0, seg: 0, f: 0, gone: false };
}

/** Position on the track at scrubber value u in [0, 1]. Linear between keypoints. */
export function trackAt(tr: Track, u: number, out: TrackPoint = makePoint()): TrackPoint {
  const uu = Math.min(1, Math.max(0, u));
  let k = 0;
  while (k < N_KEY - 2 && uu >= U_KEY[k + 1]) k++;
  const f = Math.min(1, (uu - U_KEY[k]) / (U_KEY[k + 1] - U_KEY[k]));
  out.seg = uu >= 1 ? N_KEY - 1 : k;
  out.f = uu >= 1 ? 1 : f;
  out.logT = tr.logT[k] + f * (tr.logT[k + 1] - tr.logT[k]);
  out.logL = tr.logL[k] + f * (tr.logL[k + 1] - tr.logL[k]);
  out.age = tr.age[k] + f * (tr.age[k + 1] - tr.age[k]);
  out.gone = tr.end !== 'white dwarf' && uu > U_END;
  return out;
}

/** Plain-language name of the phase at a track point. */
export function phaseName(M: number, seg: number, gone: boolean, end: Endpoint): string {
  const wd = end === 'white dwarf';
  if (gone) return seg >= 8 ? (end === 'neutron star' ? 'neutron star' : 'black hole') : 'core-collapse supernova';
  switch (seg) {
    case 0: return 'main sequence: core H burning';
    case 1: return M < 2 ? 'subgiant: H burning in a shell' : 'crossing the Hertzsprung gap';
    case 2: return M < 8 ? 'red giant branch' : M < 30 ? 'becoming a red supergiant' : 'blue to yellow supergiant';
    case 3: return M < 2 ? 'helium flash' : M < 8 ? 'core He ignition' : 'supergiant: core He burning';
    case 4: return M < 2 ? 'horizontal branch (red clump)' : M < 8 ? 'blue loop: core He burning' : 'supergiant: core He burning';
    case 5: return M < 2 ? 'horizontal branch (red clump)' : M < 8 ? 'blue loop, returning' : M < 30 ? 'red supergiant' : 'stripped star (Wolf–Rayet)';
    case 6: return wd ? 'asymptotic giant branch' : 'burning C, Ne, O, Si in shells';
    case 7: return 'planetary nebula ejected';
    case 8: return 'hot white dwarf';
    default: return 'white dwarf, cooling';
  }
}
