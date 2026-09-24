import { assert, close } from '../assert.ts';
import * as am from '../../src/topics/antimatter/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'antimatter: pair threshold 2mₑc² = 1.022 MeV near a nucleus, 4mₑc² = 2.044 MeV on an electron': () => {
    close(am.pairThresholdMeV(), 1.0219979, 1e-6, 'nucleus (infinite mass)');
    // Lead-208 nucleus, about 193 700 MeV: the recoil correction is only a few eV.
    close(am.pairThresholdMeV(193_700) - am.pairThresholdMeV(), 2 * am.ME_MEV * (am.ME_MEV / 193_700), 1e-12, 'lead recoil');
    close(am.pairThresholdMeV(am.ME_MEV), 4 * am.ME_MEV, 1e-12, 'triplet production');
    const { tPlus, tMinus } = am.splitPair(5, 0.3);
    close(tPlus + tMinus + 2 * am.ME_MEV, 5, 1e-12, 'energy balance');
    assert(am.splitPair(0.9, 0.5).tPlus === 0, 'no kinetic energy below threshold');
    return `${am.pairThresholdMeV().toFixed(4)} MeV`;
  },
  'antimatter: annihilation at rest gives two back-to-back 511 keV photons': () => {
    const [e1, e2] = am.twoPhotonEnergies(2 * am.ME_MEV, 0);
    close(e1 * 1000, 511.0, 0.01, 'photon 1 (keV)');
    close(e2 * 1000, 511.0, 0.01, 'photon 2 (keV)');
    // Momentum balance: back to back means equal and opposite momenta.
    close(e1 - e2, 0, 1e-15, 'net momentum');
    // In flight the photons share E and p: a 1 MeV positron on a resting electron.
    const e = 1 + 2 * am.ME_MEV;
    const p = am.momentumMeV(1);
    const [f, b] = am.twoPhotonEnergies(e, p);
    close(f + b, e, 1e-12, 'energy conserved in flight');
    close(f - b, p, 1e-12, 'momentum conserved in flight');
    close(am.PARA_PS_NS * 1000, 125, 1, 'para-positronium ≈ 125 ps');
    close(am.ORTHO_PS_NS, 142, 0.5, 'ortho-positronium ≈ 142 ns');
    return `${(e1 * 1000).toFixed(3)} keV each`;
  },
  'antimatter: r = p/(eB) (1 GeV/c in 1 T gives 3.336 m), and e⁺/e⁻ of equal momentum curve with equal radii, opposite sense': () => {
    close(am.gyroRadiusM(1000, 1), 3.33564, 1e-5, 'r for 1 GeV/c, 1 T');
    const rng = am.mulberry32(1);
    const base = { t0: 2, bz: 0.1, x0: 0, y0: 0, dir0: 0, ds: 5e-4, lossPerM: 0, scatterX0: Infinity, rMax: 10, plateX: 0, plateMm: 0, tMin: 0 };
    const buf = new Float32Array(3 * 4000);
    const fitR = (q: number): { r: number; cy: number; spread: number } => {
      const n = am.traceTrack({ ...base, q }, buf, rng).n;
      // Centre lies on the y-axis for a start at the origin heading +x.
      const r0 = am.gyroRadiusM(am.momentumMeV(2), 0.1);
      const cy = (q > 0 ? -1 : 1) * r0;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(buf[i * 3], buf[i * 3 + 1] - cy);
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      return { r: (lo + hi) / 2, cy, spread: hi - lo };
    };
    const pos = fitR(+1);
    const ele = fitR(-1);
    const r0 = am.gyroRadiusM(am.momentumMeV(2), 0.1);
    close(pos.r, r0, 1e-5, 'positron radius');
    close(ele.r, r0, 1e-5, 'electron radius');
    assert(pos.spread < 1e-5 && ele.spread < 1e-5, 'tracks are circles');
    assert(Math.sign(am.signedCurvature(1, 2, 0.1)) === -Math.sign(am.signedCurvature(-1, 2, 0.1)), 'opposite curvature');
    assert(am.signedCurvature(1, 2, 0.1) < 0, 'positron turns clockwise for B out of the page');
    return `r = ${(r0 * 100).toFixed(2)} cm for 2 MeV in 0.1 T`;
  },
  'antimatter: lead plate mean loss obeys dE/dx = E/X0 + (dE/dx)_ion in the thin limit, and slow electrons stop': () => {
    const T = 63;
    const eps = 1e-4;
    const rate = (T - am.plateExitKinetic(T, eps)) / eps;
    close(rate, T / am.PB_X0_MM + am.PB_DEDX_MEV_PER_MM, 1e-3, 'thin-plate loss rate (MeV/mm)');
    // Thick plate: mean exit energy for a 63 MeV positron through 6 mm.
    const out = am.plateExitKinetic(T, 6);
    assert(out > 5 && out < 30, `63 MeV through 6 mm: ${out}`);
    assert(am.plateExitKinetic(0.5, 6) === 0, 'slow electrons stop in the plate');
    return `63 MeV through 6 mm of lead: mean exit ${out.toFixed(1)} MeV`;
  },
  'antimatter: backprojection of a point source peaks at the source': () => {
    const n = 64;
    const half = 16;
    const R = 40;
    const N = 180;
    const img = new Float32Array(n * n);
    const rng = am.mulberry32(3);
    const sx = 5.3;
    const sy = -3.1;
    for (let k = 0; k < 600; k++) {
      const phi = rng() * 2 * Math.PI;
      const a1 = am.ringHitAngle(sx, sy, phi, R);
      const a2 = am.ringHitAngle(sx, sy, phi + Math.PI, R);
      // Quantise to detector centres, as a real ring does.
      const d1 = (am.detectorIndex(a1, N) * 2 * Math.PI) / N;
      const d2 = (am.detectorIndex(a2, N) * 2 * Math.PI) / N;
      am.backproject(img, n, half, R * Math.cos(d1), R * Math.sin(d1), R * Math.cos(d2), R * Math.sin(d2));
    }
    const pk = am.imagePeak(img, n, half);
    const err = Math.hypot(pk.x - sx, pk.y - sy);
    assert(err < 0.8, `peak error ${err.toFixed(2)} cm`);
    // A lone line through the centre deposits its chord length inside the image.
    const one = new Float32Array(n * n);
    am.backproject(one, n, half, -R, 0, R, 0);
    close(one.reduce((a, b) => a + b, 0), 2 * half, 1e-4, 'chord length');
    return `peak at (${pk.x.toFixed(2)}, ${pk.y.toFixed(2)}) cm, error ${err.toFixed(2)} cm`;
  },
  'antimatter: 1 g of antimatter has mc² = 8.99e13 J, 1.80e14 J (43 kt TNT) with 1 g of matter': () => {
    close(am.restEnergyJ(1e-3), 8.98755e13, 1e8, 'rest energy of 1 g');
    close(am.annihilationEnergyJ(1e-3), 1.79751e14, 1e9, 'annihilation with 1 g matter');
    close(am.annihilationEnergyJ(1e-3) / am.KILOTON_J, 42.96, 0.05, 'kilotons');
    return `${am.restEnergyJ(1e-3).toExponential(3)} J`;
  },
  'antimatter: release model is symmetric without gravity and follows the sign of a_g on a slow ramp': () => {
    const p = { depth: 4, width: 0.12, tilt: 0.1, ag: 1, bias: 0 };
    const down = (ag: number, bias: number, T: number) => {
      const r = am.simulateRelease({ ...p, ag, bias }, 300, T, 7);
      return r.down / (r.up + r.down);
    };
    const g = down(1, 0, 15);
    const zero = down(0, 0, 15);
    const up = down(-1, 0, 15);
    assert(g > 0.7, `a = +g: ${g}`);
    assert(Math.abs(zero - 0.5) < 0.08, `a = 0: ${zero}`);
    assert(up < 0.3, `a = −g: ${up}`);
    close(down(1, -1, 15), zero, 1e-12, 'a bias of −1 g cancels gravity exactly');
    assert(down(1, 0, 2) < g, 'a fast ramp washes out the asymmetry');
    return `P(down) = ${g.toFixed(2)} / ${zero.toFixed(2)} / ${up.toFixed(2)} for +g / 0 / −g`;
  },
};
