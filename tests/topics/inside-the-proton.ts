import { assert, close } from '../assert.ts';
import * as P from '../../src/topics/inside-the-proton/physics.ts';

type Suite = () => string | void;

const SCALES = [1, 4, 100, 1e4];

export const suites: Record<string, Suite> = {
  'proton: charges of uud sum to +1, neutron udd to 0': () => {
    close(P.totalCharge('proton'), 1, 1e-12, 'proton charge');
    close(P.totalCharge('neutron'), 0, 1e-12, 'neutron charge');
    return `Q_p = ${P.totalCharge('proton').toFixed(3)}, Q_n = ${P.totalCharge('neutron').toFixed(3)}`;
  },
  'proton: Higgs-given valence quark masses are about 1% of m_p (PDG: 2m_u + m_d = 9.02 MeV)': () => {
    close(P.valenceQuarkMass('proton'), 9.02, 1e-9, '2m_u + m_d');
    const f = P.quarkMassFraction('proton');
    close(f, 9.02 / 938.272, 1e-9, 'fraction');
    assert(f < 0.02, `fraction ${f}`);
    assert(P.quarkMassFraction('neutron') < 0.02, 'neutron fraction');
    return `${(f * 100).toFixed(2)}% of the proton, ${(P.quarkMassFraction('neutron') * 100).toFixed(2)}% of the neutron`;
  },
  'proton: momentum sum rule ∫x[Σq + g]dx = 1 by numerical integration': () => {
    const out: string[] = [];
    for (const Q2 of SCALES) {
      const s = P.momentumSum(Q2);
      close(s, 1, 1e-4, `momentum sum at Q² = ${Q2}`);
      out.push(s.toFixed(5));
    }
    return out.join(', ');
  },
  'proton: valence number sum rules ∫u_v = 2, ∫d_v = 1': () => {
    for (const Q2 of SCALES) {
      const { u, d } = P.valenceNumbers(Q2);
      close(u, 2, 1e-4, `∫u_v at Q² = ${Q2}`);
      close(d, 1, 1e-4, `∫d_v at Q² = ${Q2}`);
    }
    const { u, d } = P.valenceNumbers(4);
    return `∫u_v = ${u.toFixed(5)}, ∫d_v = ${d.toFixed(5)}`;
  },
  'proton: LO evolution sends quark momentum to 3n_f/(16+3n_f) = 3/7 and gluons to 4/7': () => {
    const m = P.evolveMoments(1e-30);
    close(m.quarks, 3 / 7, 1e-6, 'asymptotic quark share');
    close(m.gluon, 4 / 7, 1e-6, 'asymptotic gluon share');
    // Gluon share grows monotonically with Q² and is near 40-46% over the HERA range.
    let prev = 0;
    for (const Q2 of SCALES) {
      const g = P.moments(Q2).gluon;
      assert(g > prev, 'gluon share must grow with Q²');
      assert(g > 0.35 && g < 0.5, `gluon share ${g} at Q² = ${Q2}`);
      prev = g;
    }
    return `g(4 GeV²) = ${P.moments(4).gluon.toFixed(3)}, g(10⁴ GeV²) = ${P.moments(1e4).gluon.toFixed(3)}`;
  },
  'proton: one-loop α_s gives about 0.12 at M_Z': () => {
    const a = P.alphaS(91.1876 ** 2);
    close(a, 0.118, 0.006, 'α_s(M_Z)');
    return `α_s(M_Z) = ${a.toFixed(4)}`;
  },
  'proton: valence peak near x ≈ 0.2 and sea rises at small x': () => {
    const p = P.pdfParams(4);
    const xPeak = p.a / (p.a + p.b);
    assert(xPeak > 0.15 && xPeak < 0.3, `x u_v peak at ${xPeak}`);
    const lo = P.xpdf(1e-3, p);
    const hi = P.xpdf(1e-2, p);
    assert(lo.sea > hi.sea && lo.g > hi.g, 'sea and gluon must rise toward small x');
    return `x u_v peaks at x = ${xPeak.toFixed(3)}`;
  },
  'proton: Yang et al. (2018) lattice mass decomposition adds to 100% within rounding': () => {
    const sum = P.MASS_DECOMPOSITION.reduce((s, d) => s + d.pct, 0);
    close(sum, 100, 3, 'sum of pieces');
    return `sum ${sum}%`;
  },
};
