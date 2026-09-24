import { assert, close } from '../assert.ts';
import * as qc from '../../src/topics/quark-confinement/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'quark confinement: Cornell potential values and limits': () => {
    // a = (4/3)(0.33)(0.19733) = 0.086825 GeV fm. V(1 fm) = 0.9 - a.
    const a = (4 / 3) * 0.33 * qc.HBARC;
    close(qc.cornell(1, 0.33, 0.9), 0.9 - a, 1e-12, 'V(1 fm)');
    close(qc.cornell(0.5, 0.33, 0.9), 0.45 - 2 * a, 1e-12, 'V(0.5 fm)');
    // Zero crossing at r0 = sqrt(a / sigma).
    close(qc.cornell(Math.sqrt(a / 0.9), 0.33, 0.9), 0, 1e-12, 'V(r0)');
    // Long distance: force tends to sigma. Short distance: Coulomb dominates.
    close(qc.cornellForce(50, 0.33, 0.9), 0.9, 1e-4, 'force at large r');
    assert(Math.abs(qc.cornell(0.01, 0.33, 0.9) + a / 0.01) < 0.01, 'Coulomb dominates at 0.01 fm');
    // 0.9 GeV/fm is 1.44e5 N, the weight of about 14.7 tonnes. 1 GeV/fm is about 16.3 tonnes.
    close(qc.tensionNewtons(0.9), 1.442e5, 1e2, 'newtons');
    close(qc.tensionTonnes(0.9), 14.70, 0.02, 'tonnes at 0.9 GeV/fm');
    close(qc.tensionTonnes(1.0), 16.34, 0.02, 'tonnes at 1 GeV/fm');
    return `V(1 fm) = ${qc.cornell(1, 0.33, 0.9).toFixed(4)} GeV, 0.9 GeV/fm = ${qc.tensionTonnes(0.9).toFixed(1)} t`;
  },
  'quark confinement: breaking distance solves V(r_b) = E_th': () => {
    for (const [eTh, as, s] of [[1.1, 0.33, 0.9], [0.7, 0.2, 0.5], [1.5, 0.5, 1.4]]) {
      const rb = qc.breakingDistance(eTh, as, s);
      close(qc.cornell(rb, as, s), eTh, 1e-12, `V(r_b) for E=${eTh}`);
    }
    // Without the Coulomb term, r_b = E_th / sigma exactly.
    close(qc.breakingDistance(1.1, 0, 0.9), 1.1 / 0.9, 1e-12, 'pure string limit');
    const rb = qc.breakingDistance(1.1, qc.CHARM_FIT.alphaS, 0.9);
    // Lattice QCD (Bali et al. 2005) finds string breaking near 1.25 fm.
    assert(rb > 1.15 && rb < 1.4, `r_b = ${rb}`);
    return `r_b = ${rb.toFixed(3)} fm at E_th = 1.1 GeV`;
  },
  'quark confinement: one-loop alpha_s gives 0.118 at M_Z and grows at low Q': () => {
    close(qc.alphaS(qc.MZ), 0.118, 1e-12, 'alpha_s(M_Z)');
    // Closed form at 10 GeV: 0.118 / (1 + (23 / 12pi) 0.118 ln(100 / M_Z^2)).
    const b0 = 23 / (12 * Math.PI);
    close(qc.alphaS(10), 0.118 / (1 + b0 * 0.118 * Math.log(100 / qc.MZ ** 2)), 1e-12, 'alpha_s(10)');
    let prev = Infinity;
    for (const Q of [1.5, 3, 10, 30, 91.1876, 300, 1000]) {
      const a = qc.alphaS(Q);
      assert(a < prev, `not decreasing at Q=${Q}`);
      prev = a;
    }
    assert(qc.alphaS(1000) < 0.118 && qc.alphaS(2) > 0.25, 'range');
    // The one-loop Landau pole with five flavours sits near 90 MeV.
    close(qc.landauPole(), 0.0878, 0.001, 'Landau pole');
    return `alpha_s(10 GeV) = ${qc.alphaS(10).toFixed(3)}, alpha_s(1 TeV) = ${qc.alphaS(1000).toFixed(3)}`;
  },
  'quark confinement: shooting method matches Airy zeros for a linear potential': () => {
    // For V = sigma r alone, E_n = (hbar^2 c^2 sigma^2 / 2 mu)^(1/3) |a_n| with Airy zeros a_n.
    const p = { alphaS: 0, sigma: 0.9, mq: 1.34, c0: 0 };
    const scale = Math.cbrt((qc.HBARC ** 2 * 0.81) / (2 * (p.mq / 2)));
    const zeros = [2.338107410, 4.087949444, 5.520559828];
    for (let n = 0; n < 3; n++) close(qc.levelEnergy(n, p), scale * zeros[n], 1e-6, `E_${n + 1}`);
    return `E_1S = ${qc.levelEnergy(0, p).toFixed(5)} GeV`;
  },
  'quark confinement: charmonium fit reproduces J/psi and psi(2S) splitting within 5%': () => {
    const p = qc.CHARM_FIT;
    const m1 = qc.quarkoniumMass(0, p);
    const m2 = qc.quarkoniumMass(1, p);
    const split = m2 - m1;
    const target = qc.M_PSI2S - qc.M_JPSI; // 0.589 GeV
    const err = Math.abs(split - target) / target;
    assert(err < 0.05, `splitting ${split} vs ${target}`);
    close(m1, qc.M_JPSI, 0.02, 'J/psi mass');
    close(m2, qc.M_PSI2S, 0.02, 'psi(2S) mass');
    // psi(2S) sits below the open-charm threshold, as observed.
    assert(m2 < qc.M_DD, 'psi(2S) below D Dbar threshold');
    return `1S ${m1.toFixed(3)}, 2S ${m2.toFixed(3)} GeV, splitting error ${(err * 100).toFixed(2)}%`;
  },
};
