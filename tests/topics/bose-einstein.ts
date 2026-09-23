import { assert, close } from '../assert.ts';
import * as be from '../../src/topics/bose-einstein/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'bose-einstein: zeta(3) = 1.2020569 and g_nu(1) = zeta(nu)': () => {
    close(be.ZETA3, 1.2020569, 1e-7, 'zeta(3) constant');
    // brute-force sum with an integral tail, independent of the constant
    let s = 0;
    const K = 20000;
    for (let k = 1; k <= K; k++) s += 1 / k ** 3;
    s += 1 / (2 * (K + 0.5) ** 2);
    close(s, 1.2020569, 1e-7, 'sum 1/k^3');
    close(be.g(3, 1), be.ZETA3, 1e-12, 'g3(1)');
    close(be.g(2, 1), Math.PI ** 2 / 6, 1e-12, 'g2(1)');
    close(be.g(1.5, 1), 2.6123753, 1e-7, 'g3/2(1)');
    // series and near-1 expansion agree where they meet, and Li2(1/2) = pi^2/12 - ln^2(2)/2
    for (const nu of [1.5, 2, 3] as const) close(be.g(nu, 0.7499999), be.g(nu, 0.7500001), 1e-6, `g${nu} continuity`);
    close(be.g(2, 0.5), Math.PI ** 2 / 12 - Math.log(2) ** 2 / 2, 1e-12, 'Li2(1/2)');
    close(be.g(2, 0.9), 1.2997147230049588, 1e-9, 'Li2(0.9)');
    return `zeta(3) = ${be.ZETA3.toFixed(7)}`;
  },
  'bose-einstein: Tc for a typical Rb-87 trap is hundreds of nK': () => {
    // JILA/MIT scale: N = 1e6, trap mean frequency 100 Hz
    const { wbar } = be.trapFreqs(100, 3);
    const Tc = be.criticalT(1e6, wbar);
    // hbar*2pi*100 Hz / kB = 4.799 nK; (1e6/zeta3)^(1/3) = 94.05
    close(Tc * 1e9, 4.7992 * 94.05, 0.5, 'Tc (nK)');
    assert(Tc > 100e-9 && Tc < 1000e-9, 'order of hundreds of nK');
    close(be.criticalT(2e6, wbar) / Tc, Math.cbrt(2), 1e-12, 'doubling N raises Tc by 2^(1/3)');
    // de Broglie wavelength of Rb-87 at 100 nK is about 0.59 um
    close(be.deBroglie(be.SPECIES.rb87.m, 100e-9) * 1e6, 0.5924, 0.002, 'lambda_dB (um)');
    return `Tc = ${(Tc * 1e9).toFixed(1)} nK`;
  },
  'bose-einstein: condensate fraction endpoints and the Tc criterion n lambda^3 = zeta(3/2)': () => {
    close(be.fractionHarmonic(0), 1, 0, 'harmonic t=0');
    close(be.fractionHarmonic(1), 0, 0, 'harmonic t=1');
    close(be.fractionHarmonic(1.4), 0, 0, 'harmonic t>1');
    close(be.fractionHarmonic(0.5), 0.875, 1e-15, 'harmonic t=0.5');
    close(be.fractionBox(0), 1, 0, 'box t=0');
    close(be.fractionBox(1), 0, 0, 'box t=1');
    close(be.fractionBox(0.5), 1 - Math.SQRT1_2 / 2, 1e-15, 'box t=0.5');
    // semiclassical fugacity: z -> 1 exactly at Tc, and the peak phase-space density reaches zeta(3/2)
    const { wbar } = be.trapFreqs(100, 3);
    const Tc = be.criticalT(1e6, wbar);
    const at = be.thermo(1e6, Tc * 1.0000001, wbar);
    close(at.z, 1, 1e-4, 'z at Tc');
    close(at.psd, 2.612, 0.02, 'peak n lambda^3 at Tc');
    const hot = be.thermo(1e6, Tc * 3, wbar);
    // far above Tc, g3(z) ~ z so z ~ zeta(3)/27
    close(hot.z, 0.0426, 0.002, 'fugacity at 3 Tc');
    return `psd(Tc) = ${at.psd.toFixed(3)}`;
  },
  'bose-einstein: direct level sum matches 1 - (T/Tc)^3 at large N': () => {
    const N = 1e6;
    const k = 1;
    const { wbar, wz } = be.trapFreqs(100, k);
    const Tc = be.criticalT(N, wbar);
    const bMin = (be.HBAR * wz) / (be.KB * Tc * 1.3);
    const ls = new be.LevelSum(k, be.LevelSum.levelsFor(bMin));
    const out: string[] = [];
    for (const t of [0.3, 0.5, 0.7, 0.9]) {
      const b = (be.HBAR * wz) / (be.KB * Tc * t);
      const f = ls.fraction(N, b);
      close(f, be.fractionHarmonic(t), 0.02, `level sum vs 1-t^3 at t=${t}`);
      // and it matches the published finite-size correction much more closely
      close(f, be.fractionFiniteN(t, N, 1), 0.004, `level sum vs finite-N formula at t=${t}`);
      out.push(`t=${t}: ${f.toFixed(4)}`);
    }
    return out.join(', ');
  },
  'bose-einstein: binned level sum equals the unbinned sum (elongated trap, k = 3)': () => {
    const k = 3;
    const N = 2e4;
    const { wbar, wz } = be.trapFreqs(150, k);
    const Tc = be.criticalT(N, wbar);
    const b = (be.HBAR * wz) / (be.KB * Tc * 0.6);
    const ls = new be.LevelSum(k, be.LevelSum.levelsFor(b));
    const f = ls.fraction(N, b);
    // brute force with every level, same mu
    let lo = Math.log(1e-14), hi = Math.log(60);
    const deg = (m: number) => { const j = Math.floor(m / k); return ((j + 1) * (j + 2)) / 2; };
    const tot = (x: number) => { let s = 1 / Math.expm1(x); for (let m = 1; m < 40 / b + 2; m++) s += deg(m) / Math.expm1(x + b * m); return s; };
    for (let i = 0; i < 64; i++) { const mid = 0.5 * (lo + hi); if (tot(Math.exp(mid)) > N) lo = mid; else hi = mid; }
    const fx = 1 / Math.expm1(Math.exp(0.5 * (lo + hi))) / N;
    close(f, fx, 2e-4, 'binned vs exact');
    const wm = (2 * Math.cbrt(k) + 1 / Math.cbrt(k * k)) / 3;
    close(f, be.fractionFiniteN(0.6, N, wm), 0.01, 'finite-N formula with arithmetic-mean frequency');
    return `N0/N = ${f.toFixed(4)} (1 - t^3 = ${be.fractionHarmonic(0.6).toFixed(4)})`;
  },
  'bose-einstein: Castin-Dum expansion inverts the aspect ratio of a cigar condensate': () => {
    const eps = 0.1;
    const { bp, bz, dtau } = be.castinDum(eps, 20, 0.01);
    const i = Math.round(10 / dtau);
    const tau = 10;
    // analytic small-eps solution (Castin and Dum 1996)
    close(bp[i], Math.sqrt(1 + tau * tau), 0.02 * Math.sqrt(1 + tau * tau), 'b_perp');
    const bzA = 1 + eps * eps * (tau * Math.atan(tau) - Math.log(Math.sqrt(1 + tau * tau)));
    close(bz[i], bzA, 0.01, 'b_z');
    const aspect0 = 1 / eps; // R_z / R_perp in the trap
    const aspect = (aspect0 * bz[bz.length - 1]) / bp[bp.length - 1];
    assert(aspect < 1, `aspect after 20 radial periods/2pi should invert, got ${aspect}`);
    return `R_z/R_perp: ${aspect0.toFixed(1)} -> ${aspect.toFixed(2)}`;
  },
};
