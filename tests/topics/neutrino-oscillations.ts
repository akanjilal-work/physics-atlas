import { assert, close } from '../assert.ts';
import * as nu from '../../src/topics/neutrino-oscillations/physics.ts';

type Suite = () => string | void;

const DEG = Math.PI / 180;

/** Small deterministic PRNG so the checks are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function twoFlavour(theta: number, dm2: number): nu.MixParams {
  return { th12: theta, th13: 0, th23: 0, delta: 0, dm21: dm2, dm31: dm2 };
}

export const suites: Record<string, Suite> = {
  'neutrino: constants K = 1.267 and matter coefficient 1.52e-4 eV^2 per (g/cm^3 GeV)': () => {
    close(nu.K, 1.267, 5e-4, 'K');
    close(nu.A_COEF, 1.526e-4, 2e-7, 'A coefficient');
    return `K=${nu.K.toFixed(5)}, A=${nu.A_COEF.toExponential(4)}`;
  },
  'neutrino: two-flavour formula peaks at 1 for maximal mixing when K dm2 L/E = pi/2': () => {
    const dm2 = 2.5e-3;
    const L = 295;
    const E = nu.firstMaxEnergy(dm2, L);
    close(nu.p2(Math.PI / 4, dm2, L, E), 1, 1e-12, 'P at maximum');
    close(nu.p2(0.3, dm2, L, E), Math.sin(0.6) ** 2, 1e-12, 'P = sin^2 2theta at maximum');
    // The general 3x3 machinery reproduces the formula for a decoupled 2x2 block.
    const r = rng(7);
    let worst = 0;
    for (let n = 0; n < 200; n++) {
      const th = r() * Math.PI / 2;
      const d = 1e-5 + r() * 5e-3;
      const LL = r() * 3000;
      const EE = 0.1 + r() * 5;
      const sys = nu.buildSystem(twoFlavour(th, d), EE);
      const P = nu.probs(sys, 0, LL);
      worst = Math.max(worst, Math.abs(P[1] - nu.p2(th, d, LL, EE)), Math.abs(P[0] - (1 - nu.p2(th, d, LL, EE))), Math.abs(P[2]));
    }
    assert(worst < 1e-12, `system vs formula ${worst}`);
    return `E_max=${E.toFixed(4)} GeV, max |diff| ${worst.toExponential(1)}`;
  },
  'neutrino: PMNS is unitary (NuFIT NO and IO, any delta)': () => {
    let worst = 0;
    for (const base of [nu.NUFIT_NO, nu.NUFIT_IO]) {
      for (const d of [0, 0.7, Math.PI, 4.1, 5.9]) {
        const e = nu.unitarityError(nu.pmns({ ...base, delta: d }));
        worst = Math.max(worst, e);
      }
    }
    assert(worst < 1e-15, `unitarity ${worst}`);
    // |U_e3| = sin(theta13) is the small element.
    const U = nu.pmns(nu.NUFIT_NO);
    close(Math.hypot(U.re[2], U.im[2]), Math.sin(8.52 * DEG), 1e-15, '|U_e3|');
    return `max error ${worst.toExponential(1)}`;
  },
  'neutrino: three-flavour probabilities sum to 1 (vacuum, matter, nu and anti-nu)': () => {
    const r = rng(11);
    let worst = 0;
    for (let n = 0; n < 300; n++) {
      const base = r() < 0.5 ? nu.NUFIT_NO : nu.NUFIT_IO;
      const p = { ...base, delta: r() * 2 * Math.PI };
      const E = Math.pow(10, -3 + r() * 4);
      const rho = r() < 0.5 ? 0 : r() * 12;
      const sys = nu.buildSystem(p, E, { rho, antineutrino: r() < 0.5 });
      worst = Math.max(worst, nu.unitarityError(sys.U));
      for (let a = 0; a < 3; a++) {
        const L = r() * 13000;
        const P = nu.probs(sys, a, L);
        const Pa = nu.probs(sys, a, L, r() * 500);
        worst = Math.max(worst, Math.abs(P[0] + P[1] + P[2] - 1), Math.abs(Pa[0] + Pa[1] + Pa[2] - 1));
        for (let b = 0; b < 3; b++) assert(P[b] > -1e-12 && P[b] < 1 + 1e-12, `P out of range ${P[b]}`);
      }
    }
    assert(worst < 1e-12, `sum rule ${worst}`);
    return `max |sum - 1| ${worst.toExponential(1)}`;
  },
  'neutrino: three flavours reduce to two when theta13 = 0 and dm21 = 0': () => {
    const th23 = 48.5 * DEG;
    const dm31 = 2.534e-3;
    const p: nu.MixParams = { th12: 33.68 * DEG, th13: 0, th23, delta: 1.2, dm21: 0, dm31 };
    let worst = 0;
    for (const E of [0.3, 0.6, 2.5, 10]) {
      const sys = nu.buildSystem(p, E);
      for (const L of [10, 295, 810, 1300, 7000, 12742]) {
        const Pmu = nu.probs(sys, 1, L);
        const Pe = nu.probs(sys, 0, L);
        const f = nu.p2(th23, dm31, L, E);
        worst = Math.max(worst, Math.abs(Pmu[2] - f), Math.abs(Pmu[1] - (1 - f)), Math.abs(Pe[0] - 1));
      }
    }
    assert(worst < 1e-13, `reduction ${worst}`);
    return `max |diff| ${worst.toExponential(1)}`;
  },
  'neutrino: T2K first numu disappearance maximum at 295 km sits near 0.6 GeV': () => {
    const L = 295;
    const e2 = nu.firstMaxEnergy(nu.NUFIT_NO.dm31, L);
    close(e2, 0.6, 0.02, 'two-flavour estimate');
    // Full three-flavour scan for the minimum of P(mu -> mu).
    let best = 1, bestE = 0;
    for (let E = 0.3; E <= 1.2; E += 0.0005) {
      const P = nu.probs(nu.buildSystem(nu.NUFIT_NO, E), 1, L);
      if (P[1] < best) { best = P[1]; bestE = E; }
    }
    close(bestE, 0.6, 0.03, 'three-flavour minimum');
    assert(best < 0.03, `P_mumu at minimum ${best}`);
    return `2-flavour ${e2.toFixed(3)} GeV, 3-flavour ${bestE.toFixed(3)} GeV, P_mumu=${best.toFixed(3)}`;
  },
  'neutrino: solar vacuum average P_ee = c13^4 (1 - sin^2 2theta12 / 2) + s13^4': () => {
    const p = nu.NUFIT_NO;
    const sys = nu.buildSystem(p, 0.000862);
    const avg = nu.probs(sys, 0, nu.AU_KM, 0.01 * nu.AU_KM);
    const c13 = Math.cos(p.th13), s13 = Math.sin(p.th13);
    const expect = c13 ** 4 * (1 - 0.5 * Math.sin(2 * p.th12) ** 2) + s13 ** 4;
    close(avg[0], expect, 1e-6, 'window-averaged P_ee at 1 AU');
    close(nu.averagedProbs(sys, 0)[0], expect, 1e-14, 'incoherent sum');
    return `P_ee = ${expect.toFixed(4)}`;
  },
  'neutrino: MSW resonance gives full conversion in two-flavour constant matter': () => {
    const th = 10 * DEG;
    const dm2 = 2.5e-3;
    const E = 1;
    // Resonance: A = dm2 cos 2theta. Then dm2_matter = dm2 sin 2theta and sin^2 2theta_m = 1.
    const rho = (dm2 * Math.cos(2 * th)) / (nu.A_COEF * nu.YE * E);
    const dmM = dm2 * Math.sin(2 * th);
    const L = (Math.PI / 2) * E / (nu.K * dmM);
    const P = nu.probs(nu.buildSystem(twoFlavour(th, dm2), E, { rho }), 0, L);
    close(P[1], 1, 1e-9, 'P(e->mu) at resonance');
    const Pv = nu.p2(th, dm2, L, E);
    assert(Pv < 0.2, 'vacuum value should be small');
    // Antineutrinos feel -A: no resonance, strongly suppressed.
    const Pa = nu.probs(nu.buildSystem(twoFlavour(th, dm2), E, { rho, antineutrino: true }), 0, L);
    assert(Pa[1] < 0.05, `antineutrino ${Pa[1]}`);
    // Vacuum limit of the matter code equals the PMNS result.
    const s0 = nu.buildSystem(nu.NUFIT_NO, 2.5);
    const s1 = nu.buildSystem(nu.NUFIT_NO, 2.5, { rho: 1e-9 });
    const a0 = nu.probs(s0, 1, 1300), a1 = nu.probs(s1, 1, 1300);
    close(a1[0], a0[0], 1e-7, 'vacuum limit P_mue');
    return `rho_res=${rho.toFixed(2)} g/cm^3, L=${L.toFixed(0)} km, vacuum P=${Pv.toFixed(3)}, anti P=${Pa[1].toFixed(3)}`;
  },
  'neutrino: CPT in vacuum, P(anti a -> anti b) = P(b -> a)': () => {
    const p = { ...nu.NUFIT_NO, delta: 250 * DEG };
    const s = nu.buildSystem(p, 0.8);
    const sb = nu.buildSystem(p, 0.8, { antineutrino: true });
    let worst = 0;
    let cp = 0;
    for (const L of [295, 810, 1300]) {
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          worst = Math.max(worst, Math.abs(nu.probs(sb, a, L)[b] - nu.probs(s, b, L)[a]));
        }
      }
      cp = Math.max(cp, Math.abs(nu.probs(s, 1, L)[0] - nu.probs(sb, 1, L)[0]));
    }
    assert(worst < 1e-13, `CPT ${worst}`);
    assert(cp > 1e-3, 'delta = 250 deg should give a visible CP asymmetry');
    return `CPT error ${worst.toExponential(1)}, CP asymmetry up to ${cp.toFixed(3)}`;
  },
};
