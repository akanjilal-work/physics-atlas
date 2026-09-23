// Cherenkov radiation: pure math, no DOM.
// Angles in radians, energies in MeV, wavelengths in nm unless noted.

export type Medium = 'water' | 'glass' | 'air';
export type Particle = 'electron' | 'muon';

/** Refractive indices used by the scene (visible light, dispersion ignored). */
export const MEDIA: Record<Medium, number> = { water: 1.33, glass: 1.5, air: 1.0003 };

/** Rest energies m c² in MeV (CODATA 2018). */
export const MASS_MEV: Record<Particle, number> = { electron: 0.51099895, muon: 105.6583755 };

/** Fine-structure constant (CODATA 2018). */
export const ALPHA = 7.2973525693e-3;
/** ħc in eV·cm (CODATA 2018). */
export const HBARC_EV_CM = 1.973269804e-5;

export const thresholdBeta = (n: number): number => 1 / n;
export const isAbove = (n: number, beta: number): boolean => n * beta > 1;

/** cos θ = 1/(nβ). Only meaningful when nβ > 1. */
export const cherenkovCos = (n: number, beta: number): number => 1 / (n * beta);

/** Emission angle θ between the track and the light. Zero at or below threshold. */
export function cherenkovAngle(n: number, beta: number): number {
  if (!isAbove(n, beta)) return 0;
  return Math.acos(cherenkovCos(n, beta));
}

/** Largest possible angle, reached as β → 1. */
export const maxAngle = (n: number): number => Math.acos(1 / n);

/** Half-angle of the conical wavefront (the envelope of wavelets): sin φ = 1/(nβ), φ = 90° − θ. */
export function wavefrontHalfAngle(n: number, beta: number): number {
  if (!isAbove(n, beta)) return NaN;
  return Math.asin(1 / (n * beta));
}

/** sin²θ = 1 − 1/(n²β²), the factor that sets the photon yield. Zero below threshold. */
export function sin2Theta(n: number, beta: number): number {
  return isAbove(n, beta) ? 1 - 1 / (n * n * beta * beta) : 0;
}

export const gammaOf = (beta: number): number => 1 / Math.sqrt(1 - beta * beta);
export const kineticMeV = (beta: number, m: number): number => (gammaOf(beta) - 1) * m;
export function betaFromKinetic(T: number, m: number): number {
  const g = 1 + T / m;
  return Math.sqrt(1 - 1 / (g * g));
}
/** Kinetic energy at which a particle of mass m (MeV) starts to radiate in a medium of index n. */
export const thresholdKinetic = (n: number, m: number): number => kineticMeV(1 / n, m);

/**
 * Frank–Tamm spectrum per unit path and wavelength for a unit charge:
 * d²N/dx dλ = 2πα sin²θ / λ². Returned in photons per cm per nm.
 */
export function frankTammPerNm(n: number, beta: number, lambdaNm: number): number {
  const lamCm = lambdaNm * 1e-7;
  return ((2 * Math.PI * ALPHA * sin2Theta(n, beta)) / (lamCm * lamCm)) * 1e-7;
}

/** Photons per cm emitted between two wavelengths (nm): 2πα sin²θ (1/λ₁ − 1/λ₂). */
export function photonsPerCm(n: number, beta: number, l1Nm: number, l2Nm: number): number {
  return 2 * Math.PI * ALPHA * sin2Theta(n, beta) * (1 / (l1Nm * 1e-7) - 1 / (l2Nm * 1e-7));
}

/** Frank–Tamm per unit photon energy: d²N/dx dE = (α/ħc) sin²θ, in photons per eV per cm. */
export const frankTammPerEV = (n: number, beta: number): number => (ALPHA / HBARC_EV_CM) * sin2Theta(n, beta);

/** Mach cone half-angle, sin α = 1/M. NaN when subsonic. */
export const machAngle = (M: number): number => (M > 1 ? Math.asin(1 / M) : NaN);

/**
 * Geometric Huygens construction. Given wavelets (centre xs[i] on the axis, radius rs[i]) and an apex
 * at apexX, measure the envelope radius ρ(s) = max_i sqrt(r_i² − (apexX − s − x_i)²) at distances s
 * behind the apex, fit a straight line to the samples and return the envelope
 * half-angle atan(dρ/ds). No allocation. Returns NaN if too few samples lie on the cone.
 */
export function envelopeHalfAngle(
  apexX: number, xs: ArrayLike<number>, rs: ArrayLike<number>, count: number,
  s1: number, s2: number, samples = 24,
): number {
  // The oldest wavelet caps the envelope. Samples it wins are on its sphere, not on the cone, so skip them.
  let oldest = -1;
  let rMax = -1;
  for (let i = 0; i < count; i++) if (rs[i] > rMax) { rMax = rs[i]; oldest = i; }
  let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0;
  for (let j = 0; j < samples; j++) {
    const s = s1 + ((s2 - s1) * j) / (samples - 1);
    const x = apexX - s;
    let best = -1;
    let arg = -1;
    for (let i = 0; i < count; i++) {
      const dx = x - xs[i];
      const q = rs[i] * rs[i] - dx * dx;
      if (q >= 0) {
        const rho = Math.sqrt(q);
        if (rho > best) { best = rho; arg = i; }
      }
    }
    if (best < 0 || arg === oldest) continue;
    sx += s; sy += best; sxx += s * s; sxy += s * best; k++;
  }
  if (k < 4) return NaN;
  const slope = (k * sxy - sx * sy) / (k * sxx - sx * sx);
  return Math.atan(slope);
}

/**
 * Build wavelets for a source moving at speed u that emitted every dt since t = 0 while waves travel
 * at speed w, then measure the envelope angle at time T. Used by the tests.
 */
export function simulateEnvelope(u: number, w: number, dt: number, T: number): number {
  const N = Math.floor(T / dt) + 1;
  const xs = new Float64Array(N);
  const rs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const te = i * dt;
    xs[i] = u * te;
    rs[i] = w * (T - te);
  }
  const L = u * T;
  // Skip the few scallops right at the apex. The oldest wavelet is excluded inside.
  return envelopeHalfAngle(u * T, xs, rs, N, 4 * u * dt, L, 60);
}
