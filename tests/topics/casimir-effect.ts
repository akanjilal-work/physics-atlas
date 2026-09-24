import { assert, close } from '../assert.ts';
import * as ce from '../../src/topics/casimir-effect/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'casimir: plate pressure is 1.30 mPa at 1 um and about 1.3 atm at 10 nm': () => {
    const p1 = ce.platePressure(1e-6);
    close(p1, -1.3001e-3, 2e-6, 'P(1 um) in Pa');
    const p10 = ce.platePressure(10e-9);
    close(p10 / ce.ATM, -1.2831, 1e-3, 'P(10 nm) in atm');
    const d1 = ce.gapForPressure(ce.ATM);
    close(d1 * 1e9, 10.64, 0.01, 'gap for 1 atm in nm');
    return `P(1µm)=${(p1 * 1e3).toFixed(3)} mPa, P(10nm)=${(p10 / ce.ATM).toFixed(3)} atm, 1 atm at ${(d1 * 1e9).toFixed(2)} nm`;
  },
  'casimir: pressure scales as 1/d^4, halving the gap gives x16': () => {
    for (const d of [5e-9, 1e-7, 3e-6]) {
      close(ce.platePressure(d / 2) / ce.platePressure(d), 16, 1e-9, `ratio at ${d}`);
      close(ce.logSlope(ce.platePressure, d), -4, 1e-6, `slope at ${d}`);
    }
    // P = -dE/dd with E/A = -pi^2 hbar c / 720 d^3
    const d = 2e-7;
    const h = d * 1e-5;
    const dEdd = (ce.plateEnergyPerArea(d + h) - ce.plateEnergyPerArea(d - h)) / (2 * h);
    close(-dEdd / ce.platePressure(d), 1, 1e-8, 'P = -dE/dd');
    return 'slope -4, ratio 16, P = -dE/dd';
  },
  'casimir: 1D exponential-cutoff mode sum tends to -pi/(24 d)': () => {
    const d = 1;
    const exact = ce.casimir1DExact(d);
    let prevErr = Infinity;
    const out: string[] = [];
    for (const eps of [0.3, 0.1, 0.03, 0.01, 0.003]) {
      const err = Math.abs(ce.casimir1DExp(d, eps) - exact);
      assert(err < prevErr, `error did not shrink at eps=${eps}`);
      prevErr = err;
      out.push(err.toExponential(0));
    }
    assert(prevErr < 1e-5, `final error ${prevErr}`);
    // the leftover error is O(eps^2): +pi^3 eps^2 / (480 d^3) at leading order
    const eps = 0.01;
    close(ce.casimir1DExp(d, eps) - exact, (Math.PI ** 3 * eps * eps) / (480 * d ** 3), 1e-9, 'O(eps^2) term');
    // other gaps: -pi/(24 d) scaling
    close(ce.casimir1DExp(2.5, 0.005), ce.casimir1DExact(2.5), 1e-5, 'd = 2.5');
    return `errors ${out.join(', ')}; limit ${exact.toFixed(6)}`;
  },
  'casimir: 1D Gaussian cutoff gives the same -pi/(24 d) (cutoff independence)': () => {
    const d = 1.7;
    const v = ce.casimir1DGauss(d, 2e-3);
    close(v, ce.casimir1DExact(d), 1e-6, 'gauss cutoff');
    return `${v.toFixed(7)} vs ${ce.casimir1DExact(d).toFixed(7)}`;
  },
  'casimir: 3D EM cutoff sum tends to -pi^2/(720 d^3)': () => {
    const d = 1;
    const exact = -(Math.PI ** 2) / 720;
    // error shrinks like eps^2: halving eps cuts it by 4
    const e1 = ce.casimir3DExp(d, 0.04) - exact;
    const e2 = ce.casimir3DExp(d, 0.02) - exact;
    const e3 = ce.casimir3DExp(d, 0.01) - exact;
    close(e1 / e2, 4, 0.05, 'eps^2 convergence (0.04 to 0.02)');
    close(e2 / e3, 4, 0.05, 'eps^2 convergence (0.02 to 0.01)');
    // Richardson extrapolation to eps -> 0
    const lim = (4 * ce.casimir3DExp(d, 0.01) - ce.casimir3DExp(d, 0.02)) / 3;
    close(lim / exact, 1, 1e-5, 'extrapolated limit');
    const lim2 = (4 * ce.casimir3DExp(0.5, 0.005) - ce.casimir3DExp(0.5, 0.01)) / 3;
    close(lim2 / (exact * 8), 1, 1e-5, '1/d^3 scaling');
    return `limit ${lim.toExponential(6)} vs ${exact.toExponential(6)}`;
  },
  'casimir: PFA sphere force equals the plate pressure integrated over the sphere': () => {
    const R = 98e-6;
    for (const d of [1e-7, 1e-6]) {
      const rings = ce.sphereForceByRings(R, d);
      const pfa = ce.sphereForcePFA(R, d);
      // exact ring sum differs from 2 pi R E(d) by a relative d/(2R) edge term
      close(rings / pfa, 1 - d / (2 * R), 1e-5, `d=${d}`);
    }
    close(ce.sphereForcePFA(R, 1e-7), 2 * Math.PI * R * ce.plateEnergyPerArea(1e-7), 1e-24, 'F = 2 pi R E/A');
    close(ce.logSlope((d) => ce.sphereForcePFA(R, d), 3e-7), -3, 1e-6, 'slope -3');
    return `rings/PFA at 100 nm = ${(ce.sphereForceByRings(R, 1e-7) / ce.sphereForcePFA(R, 1e-7)).toFixed(6)}`;
  },
  'casimir: Lamoreaux-scale force is a few 1e-10 N at 1 um': () => {
    const F = ce.sphereForcePFA(ce.LAMOREAUX.R, 1e-6);
    close(F, -3.08e-10, 0.01e-10, 'F(R=11.3 cm, d=1 um)');
    return `${F.toExponential(3)} N`;
  },
};
