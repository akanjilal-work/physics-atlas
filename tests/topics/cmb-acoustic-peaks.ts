import { assert, close } from '../assert.ts';
import * as cmb from '../../src/topics/cmb-acoustic-peaks/physics.ts';

type Suite = () => string | void;

const bg = cmb.background(cmb.PLANCK);
const D = cmb.toySpectrum(cmb.PLANCK, 2500, bg);

export const suites: Record<string, Suite> = {
  'cmb: Wien peak of a 2.7255 K blackbody is about 1.06 mm (and 160 GHz)': () => {
    const lam = cmb.wienLambda(cmb.T0);
    close(lam * 1e3, 1.063, 0.003, 'λ_max (mm)');
    // Check the Wien constant against the Planck function itself: scan B_λ for its maximum.
    let best = 0;
    let bestLam = 0;
    for (let l = 0.5e-3; l < 2e-3; l += 1e-7) {
      const b = cmb.planckLambda(l, cmb.T0);
      if (b > best) {
        best = b;
        bestLam = l;
      }
    }
    close(bestLam, lam, 2e-7, 'numerical B_λ peak');
    const nu = cmb.wienNu(cmb.T0) / 1e9;
    close(nu, 160.2, 0.2, 'ν_max (GHz)');
    return `λ_max = ${(lam * 1e3).toFixed(3)} mm, ν_max = ${nu.toFixed(1)} GHz`;
  },
  'cmb: temperature scales as (1+z); about 2970 K at z = 1089, and the spectrum stays Planckian': () => {
    const T = cmb.tempAtZ(1089);
    close(T, 2.7255 * 1090, 1e-9, 'T(z)');
    close(T, 2970.8, 0.1, 'T at recombination');
    // Redshifting a blackbody gives a blackbody: B_ν(ν(1+z), T(1+z)) = (1+z)³ B_ν(ν, T).
    const z = 1089;
    for (const nu of [5e10, 1.6e11, 4e11]) {
      const ratio = cmb.planckNu(nu * (1 + z), cmb.tempAtZ(z)) / cmb.planckNu(nu, cmb.T0);
      close(ratio / (1 + z) ** 3, 1, 1e-9, `self-similarity at ${nu / 1e9} GHz`);
    }
    return `T(1089) = ${T.toFixed(1)} K`;
  },
  'cmb: background at last scattering matches Planck 2018 (r* 144.4 Mpc, r_d 147.1 Mpc, 100θ* 1.041, z* 1090)': () => {
    close(bg.zStar, 1089.9, 4, 'z*');
    close(bg.rsStar, 144.43, 1.0, 'r_s(z*)');
    close(bg.rsDrag, 147.09, 0.5, 'r_d');
    close(bg.zDrag, 1059.9, 5, 'z_drag');
    close(100 * bg.thetaStar, 1.04109, 0.006, '100 θ*');
    close(bg.DM, 13870, 80, 'D_M(z*)');
    close(bg.Rstar, 0.62, 0.02, 'R*');
    return `z*=${bg.zStar.toFixed(1)}, r*=${bg.rsStar.toFixed(2)}, r_d=${bg.rsDrag.toFixed(2)} Mpc, 100θ*=${(100 * bg.thetaStar).toFixed(4)}, D_M=${bg.DM.toFixed(0)} Mpc`;
  },
  'cmb: toy peaks sit near the measured ℓ ≈ 220, 540, 810': () => {
    const pk = cmb.findPeaks(D, 100);
    const target = [220, 537.5, 810.8];
    target.forEach((t, i) => close(pk[i], t, 15, `peak ${i + 1}`));
    // The heights are in the right ballpark of the Planck best fit (about 5750, 2600, 2550 μK²).
    close(D[pk[0]], 5750, 600, 'first peak height');
    assert(D[pk[1]] < 0.5 * D[pk[0]], 'second peak well below first');
    return `peaks at ℓ = ${pk.slice(0, 3).join(', ')} with D = ${pk.slice(0, 3).map((l) => D[l].toFixed(0)).join(', ')} μK²`;
  },
  'cmb: peak spacing is uniform and close to ℓ_A = π D_A / r_s': () => {
    const pk = cmb.findPeaks(D, 100).slice(0, 5);
    const gaps = pk.slice(1).map((l, i) => l - pk[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    close(mean / bg.lA, 1, 0.05, 'mean spacing / ℓ_A');
    for (const g of gaps) close(g / mean, 1, 0.08, 'gap uniformity');
    // Curvature: closing space shrinks D_M and moves every peak to lower ℓ.
    const closed = cmb.background({ ...cmb.PLANCK, ok: -0.1 });
    const pkC = cmb.findPeaks(cmb.toySpectrum({ ...cmb.PLANCK, ok: -0.1 }, 1200, closed), 100);
    assert(closed.DM < bg.DM && pkC[0] < pk[0] - 20, 'closed universe moves the first peak left');
    return `gaps ${gaps.join(', ')}, mean ${mean.toFixed(0)} vs ℓ_A = ${bg.lA.toFixed(1)}; Ω_k = −0.1 puts ℓ₁ at ${pkC[0]}`;
  },
  'cmb: more baryons raise odd peaks against even ones': () => {
    const ratio = (wb: number) => {
      const d = cmb.toySpectrum({ ...cmb.PLANCK, wb }, 1200);
      const pk = cmb.findPeaks(d, 100);
      return d[pk[1]] / d[pk[0]];
    };
    const lo = ratio(0.012);
    const mid = ratio(0.02237);
    const hi = ratio(0.035);
    assert(lo > mid && mid > hi, `ratio should fall with ω_b: ${lo}, ${mid}, ${hi}`);
    // Baryon loading at recombination is R = 3ρ_b/4ρ_γ ≈ 0.62 for ω_b = 0.0224.
    close(cmb.baryonLoading(0.02237, 1 / 1090.9), 0.6225, 0.005, 'R*');
    return `D₂/D₁ = ${lo.toFixed(2)}, ${mid.toFixed(2)}, ${hi.toFixed(2)} for ω_b = 0.012, 0.022, 0.035`;
  },
  'cmb: a random sky reproduces its input C_ℓ within cosmic variance': () => {
    const lmax = 64;
    const w = cmb.makeSkyWork(lmax, 160, 320);
    const cl = new Float64Array(lmax + 1);
    const Dl = cmb.toySpectrum(cmb.PLANCK, lmax, bg);
    for (let l = 2; l <= lmax; l++) cl[l] = cmb.clFromDl(Dl[l], l);
    const map = new Float32Array(160 * 320);
    const notes: string[] = [];
    let worst = 0;
    for (const seed of [1, 2]) {
      const alm = cmb.unitAlm(seed, lmax);
      cmb.synthesize(alm, cl, w, map);
      const est = cmb.analyze(map, w, lmax);
      // Compare band powers over Δℓ = 5 bins, where cosmic variance is σ/C = sqrt(2 / Σ(2ℓ+1)).
      for (const l0 of [10, 30, 50]) {
        let s = 0;
        let s0 = 0;
        let nmodes = 0;
        for (let l = l0; l < l0 + 5; l++) {
          s += (2 * l + 1) * est[l];
          s0 += (2 * l + 1) * cl[l];
          nmodes += 2 * l + 1;
        }
        const dev = (s / s0 - 1) / Math.sqrt(2 / nmodes);
        worst = Math.max(worst, Math.abs(dev));
        assert(Math.abs(dev) < 3.5, `seed ${seed} ℓ≈${l0}: ${dev.toFixed(2)}σ`);
        if (seed === 1) notes.push(`ℓ${l0}: ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}σ`);
      }
      // Quadrature is faithful: the recovered C_ℓ equals Σ|a_lm|²/(2ℓ+1) of the realisation itself.
      for (const l of [5, 20, 40]) {
        let s = alm.re[cmb.lmIndex(l, 0)] ** 2;
        for (let m = 1; m <= l; m++) s += 2 * (alm.re[cmb.lmIndex(l, m)] ** 2 + alm.im[cmb.lmIndex(l, m)] ** 2);
        close(est[l] / ((cl[l] * s) / (2 * l + 1)), 1, 2e-3, `quadrature at ℓ=${l}`);
      }
    }
    return `${notes.join(', ')} (worst ${worst.toFixed(1)}σ)`;
  },
};
