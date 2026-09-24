import { assert, close } from '../assert.ts';
import * as qh from '../../src/topics/quantum-hall/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'quantum hall: R_K = h/e^2 from the exact 2019 SI values is 25812.80745 ohm': () => {
    // CODATA 2018/2022: R_K = 25 812.807 45... ohm (exact since h and e are fixed).
    close(qh.R_K, 25812.80745, 1e-5, 'R_K');
    // The 1990 conventional value agrees to 2 parts in 10^8.
    const rel = Math.abs(qh.R_K / qh.R_K90 - 1);
    assert(rel < 2e-8, `R_K-90 offset ${rel}`);
    return `R_K = ${qh.R_K.toFixed(5)} ohm, R_K/R_K90 - 1 = ${(qh.R_K / qh.R_K90 - 1).toExponential(2)}`;
  },
  'quantum hall: GaAs Landau spacing hbar e B / m* is 1.7279 meV per tesla (m* = 0.067 m_e)': () => {
    // hbar e / (0.067 m_e) = 1.05457e-34 / 6.10329e-32 J/T = 1.72788 meV/T. Textbook: about 1.73 meV/T for GaAs.
    const perT = qh.cyclotronMeV(1);
    close(perT, 1.72788, 1e-5, 'hbar omega_c at 1 T');
    close(qh.cyclotronMeV(10), 10 * perT, 1e-12, 'linear in B');
    // Model level spacing equals hbar omega_c for the same spin.
    const hw = qh.cyclotronMeV(5);
    close(qh.levelEnergy(2, hw, 0.3) - qh.levelEnergy(0, hw, 0.3), hw, 1e-12, 'E_1 - E_0');
    close(qh.levelEnergy(0, hw, 0), hw / 2, 1e-12, 'zero-point hbar omega_c / 2');
    return `${perT.toFixed(4)} meV/T`;
  },
  'quantum hall: level degeneracy eB/h = 2.418e14 per m^2 per tesla, and nu = nh/(eB)': () => {
    // e/h = 2.417989242e14 /(T m^2), the inverse of the flux quantum h/e.
    close(qh.degeneracy(1) / 2.417989242e14, 1, 1e-9, 'e/h');
    const n = 3e15;
    const B = 6;
    close(qh.fillingFactor(n, B), n / qh.degeneracy(B), 1e-12, 'nu = n / (eB/h)');
    close(qh.fillingFactor(n, qh.fieldForFilling(n, 2)), 2, 1e-12, 'round trip');
    // Classical Hall line crosses R_K/nu exactly at filling nu.
    close(qh.classicalHall(qh.fieldForFilling(n, 3), n), qh.R_K / 3, 1e-9, 'classical R_xy = R_K/nu');
    return `nu(3e11 cm^-2, 6 T) = ${qh.fillingFactor(n, B).toFixed(3)}`;
  },
  'quantum hall: model R_xy = h/(nu e^2) exactly and R_xx = 0 at plateau centres (T = 0)': () => {
    const p = { ...qh.DEFAULT_PARAMS, T: 0 };
    const notes: string[] = [];
    for (const nu of [1, 2, 3, 4, 6]) {
      const r = qh.solveQH(qh.fieldForFilling(p.n, nu), p);
      close(r.Rxy / (qh.R_K / nu), 1, 1e-12, `R_xy at nu=${nu}`);
      assert(r.Rxx === 0, `R_xx at nu=${nu} is ${r.Rxx}`);
      assert(qh.plateauIndex(r.Rxy, r.Rxx) === nu, `plateau index at nu=${nu}`);
      notes.push(`${nu}`);
    }
    // Reversing B flips the sign of R_xy only.
    const a = qh.solveQH(qh.fieldForFilling(p.n, 2), p);
    const b = qh.solveQH(-qh.fieldForFilling(p.n, 2), p);
    close(b.Rxy, -a.Rxy, 1e-9, 'odd in B');
    return `exact at nu = ${notes.join(', ')}`;
  },
  'quantum hall: low field and clean limit follow the classical line B/(ne)': () => {
    // With almost no localized states (gamma << w_ext) sigma_xy = nu exactly, so R_xy sits near B/(ne).
    const p = { ...qh.DEFAULT_PARAMS, gamma: 0.02, T: 1 };
    let worst = 0;
    for (const B of [0.3, 0.5, 0.8, 1.2]) {
      const r = qh.solveQH(B, p);
      const rel = Math.abs(r.Rxy / qh.classicalHall(B, p.n) - 1);
      worst = Math.max(worst, rel);
      assert(r.resid < 1e-6, `density residual ${r.resid}`);
    }
    assert(worst < 0.005, `worst deviation ${worst}`);
    return `max |R_xy/(B/ne) - 1| = ${worst.toExponential(1)}`;
  },
  'quantum hall: heat blurs the plateau (activated deviation grows with T)': () => {
    const base = { ...qh.DEFAULT_PARAMS };
    const d1 = qh.nu2Deviation({ ...base, T: 1 });
    const d10 = qh.nu2Deviation({ ...base, T: 10 });
    const d30 = qh.nu2Deviation({ ...base, T: 30 });
    assert(d1 < 1e-9, `T=1 K deviation ${d1}`);
    assert(d10 > d1 && d30 > d10, 'monotone');
    assert(d30 > 0.01, `T=30 K deviation ${d30}`);
    return `dev(1 K)=${d1.toExponential(1)}, dev(10 K)=${d10.toExponential(1)}, dev(30 K)=${d30.toExponential(1)}`;
  },
  'quantum hall: skipping orbits run one way along each edge, and flip with B': () => {
    const L = 10, W = 3.6;
    const run = (omega: number, top: boolean) => {
      // start near the wall, heading into it, so the orbit is cut by the wall
      const s = new Float64Array([0, top ? W / 2 - 0.1 : -W / 2 + 0.1, 0, top ? 1 : -1]);
      const hit = new Uint8Array(1);
      const g = new Float64Array(2);
      let x = 0;
      for (let k = 0; k < 200; k++) {
        const x0 = s[0];
        qh.stepElectrons(s, 1, 1 / 400, 10, omega, L, W, null, hit, g);
        let dx = s[0] - x0;
        if (dx > L / 2) dx -= L;
        if (dx < -L / 2) dx += L;
        x += dx;
      }
      // speed must be conserved by the magnetic rotation
      close(Math.hypot(s[2], s[3]), 1, 1e-9, 'speed');
      return Math.sign(x);
    };
    for (const om of [4, -4]) {
      assert(run(om, true) === qh.skipDirection(om, true), `top wall, omega ${om}`);
      assert(run(om, false) === qh.skipDirection(om, false), `bottom wall, omega ${om}`);
    }
    assert(qh.skipDirection(4, true) === -qh.skipDirection(-4, true), 'reversal');
    return 'chirality matches skipDirection';
  },
};
