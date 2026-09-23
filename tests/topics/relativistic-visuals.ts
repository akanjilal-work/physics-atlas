import { assert, close } from '../assert.ts';
import * as rv from '../../src/topics/relativistic-visuals/physics.ts';

type Suite = () => string | void;

const BETAS = [0.01, 0.3, 0.6, 0.9, 0.99];

export const suites: Record<string, Suite> = {
  'relativistic visuals: aberration round trip returns the starting angle': () => {
    let worst = 0;
    for (const b of BETAS) {
      for (let i = 0; i <= 180; i++) {
        const c = Math.cos(i * rv.DEG);
        const back = rv.deaberrateCos(rv.aberrateCos(c, b), b);
        worst = Math.max(worst, Math.abs(back - c));
        // Two boosts compose by velocity addition: β₁ ⊕ β₂ = (β₁ + β₂)/(1 + β₁β₂).
        const b2 = 0.5;
        const twice = rv.aberrateCos(rv.aberrateCos(c, b), b2);
        const once = rv.aberrateCos(c, (b + b2) / (1 + b * b2));
        worst = Math.max(worst, Math.abs(twice - once));
      }
    }
    assert(worst < 1e-12, `round-trip error ${worst}`);
    return `max error ${worst.toExponential(1)}`;
  },
  'relativistic visuals: D = 1 exactly at cos θ′ = (1 − 1/γ)/β, and both forms of D agree': () => {
    const notes: string[] = [];
    for (const b of BETAS) {
      const c0 = rv.noShiftCos(b);
      close(rv.dopplerObs(c0, b), 1, 1e-12, `D at no-shift angle, β=${b}`);
      for (let i = 0; i <= 18; i++) {
        const c = Math.cos(i * 10 * rv.DEG);
        close(rv.dopplerObs(rv.aberrateCos(c, b), b), rv.dopplerSrc(c, b), 1e-9, 'D(θ′) vs γ(1+β cos θ)');
      }
      if (b === 0.6 || b === 0.9) notes.push(`β=${b}: θ′₀=${(Math.acos(c0) / rv.DEG).toFixed(2)}°`);
    }
    // β = 0.6 gives γ = 5/4, so cos θ′₀ = (1 − 4/5)/0.6 = 1/3.
    close(rv.noShiftCos(0.6), 1 / 3, 1e-12, 'β=0.6 closed form');
    // Ahead and behind: D = √((1±β)/(1∓β)).
    close(rv.dopplerObs(1, 0.6), 2, 1e-12, 'D ahead at β=0.6');
    close(rv.dopplerObs(-1, 0.6), 0.5, 1e-12, 'D behind at β=0.6');
    return notes.join(', ');
  },
  'relativistic visuals: aberration always pulls stars forward (cos θ′ ≥ cos θ)': () => {
    let minGap = Infinity;
    for (const b of BETAS) {
      for (let i = 0; i <= 3600; i++) {
        const c = Math.cos((i / 20) * rv.DEG);
        const gap = rv.aberrateCos(c, b) - c;
        assert(gap >= -1e-15, `cos θ′ < cos θ at β=${b}, θ=${i / 20}°`);
        if (i > 0 && i < 3600) minGap = Math.min(minGap, gap);
      }
    }
    // Exactly half the sky lands inside arccos β. At β = 0.9 that is 25.84°.
    close(rv.fractionInCone(rv.halfSkyAngle(0.9), 0.9), 0.5, 1e-12, 'half sky');
    const f25 = rv.fractionInCone(25 * rv.DEG, 0.9);
    close(f25, 0.4829, 5e-4, 'fraction in 25° at β=0.9');
    return `strict gap > 0 away from the poles (min ${minGap.toExponential(1)}), 25° cone at β=0.9 holds ${(f25 * 100).toFixed(1)}%`;
  },
  'relativistic visuals: solid angle transforms as dΩ′ = dΩ / D²': () => {
    let worst = 0;
    for (const b of BETAS) {
      for (let i = 1; i < 180; i += 7) {
        const c = Math.cos(i * rv.DEG);
        const h = 1e-6;
        const num = (rv.aberrateCos(c + h, b) - rv.aberrateCos(c - h, b)) / (2 * h);
        const D = rv.dopplerSrc(c, b);
        worst = Math.max(worst, Math.abs(num * D * D - 1), Math.abs(rv.solidAngleRatio(c, b) * D * D - 1));
      }
    }
    assert(worst < 1e-6, `relative error ${worst}`);
    // Consequence: star flux D² averaged over the sky gives the energy-density boost γ²(1 + β²/3).
    const b = 0.8;
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const c = -1 + (2 * (i + 0.5)) / N;
      sum += rv.dopplerSrc(c, b) ** rv.STAR_FLUX_POWER;
    }
    close(sum / N, rv.isotropicBoost(b), 1e-6, '<D²> vs γ²(1+β²/3)');
    return `max error ${worst.toExponential(1)}, <D²> at β=0.8 = ${(sum / N).toFixed(4)}`;
  },
  'relativistic visuals: small-β limit gives Bradley aberration (20.5″) and D ≈ 1 + β cos θ': () => {
    // Earth's mean orbital speed 29.786 km/s. IAU constant of aberration κ = 20.49552″.
    const b = 29.786 / 299792.458;
    const c = 0; // star at 90° to the motion
    const shift = (Math.acos(c) - Math.acos(rv.aberrateCos(c, b))) / rv.DEG * 3600;
    close(shift, 20.49552, 0.002, 'aberration in arcsec');
    // The Galilean formula agrees to first order in β.
    const cl = (Math.acos(c) - Math.acos(rv.classicalAberrateCos(c, b))) / rv.DEG * 3600;
    close(cl, shift, 1e-5, 'classical vs relativistic at small β');
    const bs = 1e-4;
    for (const cc of [1, 0.5, 0, -0.7]) close(rv.dopplerSrc(cc, bs), 1 + bs * cc, 1e-8, 'first-order Doppler');
    // The first difference is the transverse Doppler shift: D(90°) = 1/γ ≈ 1 − β²/2.
    close(1 - rv.dopplerObs(0, 0.01), 0.5e-4, 1e-8, 'transverse Doppler');
    return `κ = ${shift.toFixed(3)}″`;
  },
  'relativistic visuals: blackbody at 6500 K sits on the Planckian locus (x=0.3135, y=0.3237)': () => {
    const [x, y] = rv.blackbodyXY(6500);
    close(x, 0.3135, 0.003, 'x');
    close(y, 0.3237, 0.003, 'y');
    const [x2, y2] = rv.blackbodyXY(2856); // CIE illuminant A: x=0.4476, y=0.4074
    close(x2, 0.4476, 0.003, 'illuminant A x');
    close(y2, 0.4074, 0.003, 'illuminant A y');
    const hot = rv.blackbodyRGB(30000);
    const cool = rv.blackbodyRGB(2000);
    assert(hot[2] > hot[0] && cool[0] > cool[2], 'hot is blue, cool is red');
    return `x=${x.toFixed(4)}, y=${y.toFixed(4)}`;
  },
  'relativistic visuals: retarded-time image of a small cube shows faces s/γ and βs (Terrell)': () => {
    const d = 1e4;
    const s = 1;
    const notes: string[] = [];
    for (const b of [0.5, 0.9]) {
      const g = rv.gamma(b);
      const tObs = d; // the centre's light left at t = 0, when it sat straight ahead of the camera
      const see = (x: number, z: number) => {
        const te = rv.emissionTime(x, 0, z, 0, 0, 0, b, tObs);
        const P = rv.apparentPoint(x, 0, z, 0, 0, 0, b, tObs);
        // light-cone check: the image point really is on the past light cone of the camera event
        close(Math.hypot(P[0], P[2]), tObs - te, 1e-6, 'null separation');
        return (P[0] / -P[2]) * d; // transverse position scaled back to distance d
      };
      const fl = see(-s / (2 * g), -d + s / 2);
      const fr = see(s / (2 * g), -d + s / 2);
      const bl = see(-s / (2 * g), -d - s / 2);
      close(fr - fl, s / g, 2e-3, `front face width, β=${b}`);
      close(fl - bl, b * s, 2e-3, `trailing face width, β=${b}`);
      close(rv.terrellRotation(0, b), Math.asin(b), 1e-12, 'rotation abeam = arcsin β');
      notes.push(`β=${b}: ${(fr - fl).toFixed(3)} + ${(fl - bl).toFixed(3)}`);
    }
    return notes.join(', ');
  },
};
