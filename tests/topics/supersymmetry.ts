import { assert, close } from '../assert.ts';
import * as su from '../../src/topics/supersymmetry/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'supersymmetry: inputs at M_Z and beta coefficients from particle content': () => {
    const [a1, a2, a3] = su.ALPHA_INV_MZ;
    close(a1, 59.0, 0.1, '1/alpha1(MZ)');
    close(a2, 29.6, 0.1, '1/alpha2(MZ)');
    close(a3, 8.5, 0.1, '1/alpha3(MZ)');
    const sm = su.B_SM;
    const ms = su.B_MSSM;
    close(sm[0], 41 / 10, 1e-12, 'b1 SM');
    close(sm[1], -19 / 6, 1e-12, 'b2 SM');
    close(sm[2], -7, 1e-12, 'b3 SM');
    close(ms[0], 33 / 5, 1e-12, 'b1 MSSM');
    close(ms[1], 1, 1e-12, 'b2 MSSM');
    close(ms[2], -3, 1e-12, 'b3 MSSM');
    return `1/α = (${a1.toFixed(2)}, ${a2.toFixed(2)}, ${a3.toFixed(2)})`;
  },
  'supersymmetry: one-loop running formula, composition and alpha_s(1 TeV)': () => {
    // Linear in ln(mu): running MZ -> 1e5 -> 1e10 equals running MZ -> 1e10 directly.
    const b = -7;
    const a0 = su.ALPHA_INV_MZ[2];
    const direct = su.runOneLoop(a0, b, su.MZ, 1e10);
    const twoStep = su.runOneLoop(su.runOneLoop(a0, b, su.MZ, 1e5), b, 1e5, 1e10);
    close(direct, twoStep, 1e-10, 'composition');
    close(direct, a0 + (7 / (2 * Math.PI)) * Math.log(1e10 / su.MZ), 1e-10, 'closed form');
    // One-loop alpha_s at 1 TeV: 1/(8.475 + 7 ln(1000/91.19)/2pi) = 0.0898. CMS measures about 0.088 there.
    const as1TeV = 1 / su.couplingsAt(1000, 'SM', 0)[2];
    close(as1TeV, 0.0898, 0.001, 'alpha_s(1 TeV) one loop');
    assert(Math.abs(as1TeV - 0.088) < 0.004, `alpha_s(1 TeV) far from data: ${as1TeV}`);
    // Below the SUSY scale, MSSM running is SM running.
    const x = su.couplingsAt(500, 'MSSM', 2000);
    const y = su.couplingsAt(500, 'SM', 0);
    for (let i = 0; i < 3; i++) close(x[i], y[i], 1e-12, `threshold ${i}`);
    return `αs(1 TeV) = ${as1TeV.toFixed(4)}`;
  },
  'supersymmetry: MSSM lines meet near 2e16 GeV with a small mismatch': () => {
    const u = su.unification('MSSM', su.MZ);
    const mu = 10 ** u.log10mu;
    assert(mu > 1e16 && mu < 3e16, `M_GUT = ${mu.toExponential(2)}`);
    assert(u.spread < 0.2, `spread ${u.spread}`);
    // Hand calculation: alpha1 = alpha2 at ln(mu/MZ) = 2pi (59.02 - 29.58)/5.6, 1/alpha_GUT near 24.3.
    close(u.aInv, 24.3, 0.2, '1/alpha_GUT');
    // With partners at 1 TeV the fit is still good.
    const u1 = su.unification('MSSM', 1000);
    assert(u1.spread < 0.5 && u1.log10mu > 15.9 && u1.log10mu < 16.5, `1 TeV: ${JSON.stringify(u1)}`);
    return `M_GUT = ${mu.toExponential(2)} GeV, spread ${u.spread.toFixed(3)}`;
  },
  'supersymmetry: Standard Model lines miss by much more': () => {
    const sm = su.unification('SM', 0);
    const mssm = su.unification('MSSM', su.MZ);
    assert(sm.spread > 3, `SM spread ${sm.spread}`);
    assert(sm.spread > 20 * mssm.spread, `ratio ${sm.spread / mssm.spread}`);
    // alpha1 = alpha2 crossing: ln(mu/MZ) = 2pi (29.44)/(41/10 + 19/6) -> about 1e13 GeV.
    const c12 = su.pairCrossings('SM', 0)[0];
    close(c12.log10mu, 13.0, 0.1, 'SM alpha1-alpha2 crossing');
    return `SM spread ${sm.spread.toFixed(2)} vs MSSM ${mssm.spread.toFixed(3)}`;
  },
  'supersymmetry: top and stop quadratic pieces cancel, fine-tuning grows as m_stop^2': () => {
    const q = su.quadraticPieces(1e16);
    assert(Math.abs(q.sum) < 1e-12 * Math.abs(q.top), 'quadratic cancellation');
    close(su.fineTuning(su.MT, 1e16), 0, 1e-9, 'exact SUSY: no leftover');
    // Heavy stop: Delta(2m)/Delta(m) = 4 ln(L^2/4m^2)/ln(L^2/m^2) up to the small m_t^2 term.
    const L = 1e16;
    const m = 2000;
    const r = su.fineTuning(2 * m, L) / su.fineTuning(m, L);
    const expect = (4 * Math.log((L * L) / (4 * m * m)) * (4 * m * m - su.MT ** 2)) / (Math.log((L * L) / (m * m)) * (4 * m * m - 4 * su.MT ** 2));
    close(r, expect, 1e-9, 'ratio');
    assert(r > 3.8 && r < 4.05, `ratio ${r}`);
    // Hand value at 1 TeV: 3(0.94^2)/(8pi^2) (1e6 - 172.6^2) ln(1e32/1e6) / (125.2^2/2) = 248.
    close(su.fineTuning(1000, L), 248, 3, 'Delta at 1 TeV');
    return `Δ(1 TeV) = ${su.fineTuning(1000, L).toFixed(0)}, Δ(4)/Δ(2) = ${r.toFixed(3)}`;
  },
};
