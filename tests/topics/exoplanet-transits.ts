import { assert, close } from '../assert.ts';
import * as x from '../../src/topics/exoplanet-transits/physics.ts';

type Suite = () => string | void;
const DEG = Math.PI / 180;

export const suites: Record<string, Suite> = {
  'exoplanet: depth (Rp/R★)² is ~84 ppm for Earth–Sun, ~1% for Jupiter, ~1.46% for HD 209458 b': () => {
    const dE = x.transitDepth(x.R_EARTH, x.R_SUN);
    const dJ = x.transitDepth(x.R_JUP, x.R_SUN);
    const dH = x.transitDepth(1.359 * x.R_JUP, 1.155 * x.R_SUN);
    close(dE * 1e6, 84, 0.5, 'Earth depth (ppm)');
    close(dJ * 100, 1.06, 0.01, 'Jupiter depth (%)');
    // Knutson et al. (2007) measured Rp/R★ = 0.1209 for HD 209458 b.
    close(Math.sqrt(dH), 0.1209, 0.001, 'HD 209458 b radius ratio');
    return `Earth ${(dE * 1e6).toFixed(1)} ppm, Jupiter ${(dJ * 100).toFixed(3)}%, HD 209458 b ${(dH * 100).toFixed(2)}%`;
  },

  'exoplanet: numerical light curve matches the exact uniform-disk overlap, and (Rp/R★)² at centre': () => {
    const p = 0.1;
    close((1 - x.occultedFlux(0, p, 0, 0)) / (p * p), 1, 1e-5, 'central depth / p²');
    let worst = 0;
    for (const pp of [0.0092, 0.1, 0.3]) {
      for (let i = 0; i <= 60; i++) {
        const z = (i / 60) * (1 + pp) * 1.02;
        const num = 1 - x.occultedFlux(z, pp, 0, 0, 512);
        const ex = x.uniformOverlap(z, pp);
        worst = Math.max(worst, Math.abs(num - ex) / (pp * pp));
      }
    }
    assert(worst < 2e-4, `worst relative error ${worst}`);
    // Limb darkening: a small planet at disk centre blocks I(1)/<I>, deeper than p².
    const u1 = 0.4;
    const u2 = 0.26;
    const small = 0.01;
    close((1 - x.occultedFlux(0, small, u1, u2)) / (small * small), 1 / x.diskFlux(u1, u2), 1e-3, 'limb-darkened centre depth');
    return `max error ${worst.toExponential(1)} of p²`;
  },

  'exoplanet: T14 formula agrees with contact times found numerically, Earth central transit ≈ 13 h': () => {
    // HD 209458 b: a/R★ ≈ 8.76, k = 0.1209, i = 86.71°, P = 3.5247 d.
    const P = 3.52474859 * x.DAY;
    const aR = (0.04707 * x.AU) / (1.155 * x.R_SUN);
    const k = 0.1209;
    const inc = 86.71 * DEG;
    const T14 = x.transitDuration(P, aR, k, inc);
    // Bisection for z(θ) = 1 + k on the near side.
    const contact = (edge: number) => {
      let lo = 0;
      let hi = Math.PI / 2;
      for (let i = 0; i < 80; i++) {
        const m = (lo + hi) / 2;
        if (x.skySeparation(aR, inc, m) < edge) lo = m;
        else hi = m;
      }
      return ((2 * lo) / x.TAU) * P;
    };
    close(T14 / 3600, contact(1 + k) / 3600, 1e-6, 'T14 (h)');
    close(x.transitDuration(P, aR, k, inc, true) / 3600, contact(1 - k) / 3600, 1e-6, 'T23 (h)');
    // Published T14 for HD 209458 b is about 3.0 h.
    close(T14 / 3600, 3.0, 0.1, 'HD 209458 b T14');
    const PE = x.period(x.AU, x.M_SUN, x.M_EARTH);
    close(PE / x.DAY, 365.25, 0.1, 'Earth period (d)');
    const TE = x.transitDuration(PE, x.AU / x.R_SUN, x.R_EARTH / x.R_SUN, Math.PI / 2) / 3600;
    close(TE, 13.1, 0.1, 'Earth central transit (h)');
    return `HD 209458 b T14 ${(T14 / 3600).toFixed(3)} h, Earth ${TE.toFixed(2)} h`;
  },

  'exoplanet: RV semi-amplitude ≈ 0.09 m/s (Earth), 12.5 m/s (Jupiter), 84 m/s (HD 209458 b)': () => {
    const PE = x.period(x.AU, x.M_SUN, x.M_EARTH);
    const KE = x.rvSemiAmplitude(PE, x.M_EARTH, x.M_SUN);
    const aJ = 5.2038 * x.AU;
    const PJ = x.period(aJ, x.M_SUN, x.M_JUP);
    const KJ = x.rvSemiAmplitude(PJ, x.M_JUP, x.M_SUN);
    close(KE, 0.0895, 0.001, 'Earth K');
    close(KJ, 12.5, 0.1, 'Jupiter K');
    // The Mp ≪ M★ form differs from the exact one by (1 + Mp/M★)^{2/3}.
    close(x.rvSemiAmplitude(PJ, x.M_JUP, x.M_SUN, Math.PI / 2, 0, false) / KJ, Math.pow(1 + x.M_JUP / x.M_SUN, 2 / 3), 1e-12, 'approx ratio');
    const PH = 3.52474859 * x.DAY;
    const KH = x.rvSemiAmplitude(PH, 0.682 * x.M_JUP, 1.119 * x.M_SUN, 86.71 * DEG);
    close(KH, 84.3, 1.5, 'HD 209458 b K');
    return `Earth ${KE.toFixed(4)}, Jupiter ${KJ.toFixed(2)}, HD 209458 b ${KH.toFixed(1)} m/s`;
  },

  'exoplanet: habitable zone of the Sun ≈ 0.98 to 1.69 AU, and Kepler periods for HD 209458 b and TRAPPIST-1e': () => {
    const [i, o] = x.habitableZone(1, 5780);
    close(i, 0.981, 0.005, 'inner edge');
    close(o, 1.689, 0.005, 'outer edge');
    const PH = x.period(0.04707 * x.AU, 1.119 * x.M_SUN) / x.DAY;
    close(PH, 3.5247, 0.01, 'HD 209458 b period (d)');
    const Pe = x.period(0.02925 * x.AU, 0.0898 * x.M_SUN) / x.DAY;
    close(Pe, 6.101, 0.02, 'TRAPPIST-1e period (d)');
    return `Sun HZ ${i.toFixed(3)} to ${o.toFixed(3)} AU, P = ${PH.toFixed(4)} d, ${Pe.toFixed(3)} d`;
  },

  'exoplanet: box-transit S/N equals δ/σ · √(T / 30 min)': () => {
    const n = 1000;
    const dt = 60;
    const arr = new Float64Array(n);
    for (let i = 300; i < 300 + 780; i++) if (i < n) arr[i] = 84e-6;
    // 700 in-transit minutes: (84/100) √(700/30)
    const snr = x.transitSNR(arr, n, dt, 100e-6);
    close(snr, 0.84 * Math.sqrt(700 / 30), 1e-9, 'box S/N');
    return `S/N ${snr.toFixed(2)}`;
  },
};
