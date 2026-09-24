import { assert, close } from '../assert.ts';
import * as fd from '../../src/topics/feynman-diagrams/physics.ts';

type Suite = () => string | void;

const both = { a: true, b: true };

export const suites: Record<string, Suite> = {
  'feynman: sigma(ee->mumu) = 86.8 nb / s[GeV^2] and scales as 1/s': () => {
    const s10 = fd.sigmaMuMu(10);
    close(s10, 0.8686, 2e-3, 'sigma at 10 GeV (nb)');
    for (const e of [1, 3.7, 12, 29]) close(fd.sigmaMuMu(e) / fd.sigmaMuMu(2 * e), 4, 1e-12, `ratio at ${e} GeV`);
    close(fd.sigmaMuMu(1) * 1 * 1, (4 * Math.PI * fd.ALPHA ** 2 / 3) * fd.GEV2_NB, 1e-9, '4 pi alpha^2 / 3');
    return `sigma(10 GeV) = ${s10.toFixed(4)} nb`;
  },
  'feynman: integrating (alpha^2/4s)(1+cos^2) over 4 pi reproduces 4 pi alpha^2/(3s)': () => {
    for (const e of [2, 10, 35]) {
      const num = fd.sigmaNumeric('mumu', e, both, 200);
      close(num / fd.sigmaMuMu(e), 1, 1e-10, `mumu at ${e} GeV`);
    }
    // Bhabha s-channel alone is exactly the muon-pair distribution.
    for (const c of [-0.9, -0.3, 0, 0.5, 0.95]) close(fd.dsdo('bhabha', c, 10, { a: true, b: false }), fd.dsdo('mumu', c, 10), 1e-12, `s-only at c=${c}`);
    // Klein-Nishina: numerical integral equals the closed-form total.
    for (const k of [0.01, 1, 20]) close(fd.sigmaNumeric('compton', k, both, 4000) / fd.kleinNishinaTotal(k), 1, 1e-6, `KN at k=${k}`);
    return 'mumu exact to 1e-10, KN to 1e-6';
  },
  'feynman: Klein-Nishina reduces to Thomson at low energy, and to (pi re^2/k)(ln 2k + 1/2) at high energy': () => {
    close(fd.THOMSON_BARN, 0.6652459, 1e-6, 'Thomson cross section (b)');
    close(fd.kleinNishinaTotal(1e-3) / fd.THOMSON_BARN, 1, 2.5e-3, 'total at k=1e-3');
    close(fd.kleinNishinaTotal(1e-6) / fd.THOMSON_BARN, 1, 1e-5, 'total at k=1e-6');
    // Series check: sigma/sigma_T = 1 - 2k + 26k^2/5 - 133k^3/10 near k = 0
    const k = 2e-3;
    close(fd.kleinNishinaTotal(k) / fd.THOMSON_BARN, 1 - 2 * k + 5.2 * k * k - 13.3 * k ** 3, 1e-8, 'series');
    for (const c of [-1, -0.5, 0, 0.7, 1]) close(fd.kleinNishina(c, 1e-7) / (0.5 * fd.RE2_BARN * (1 + c * c)), 1, 1e-6, `Thomson shape at c=${c}`);
    const kh = 1e4;
    const asym = (Math.PI * fd.RE2_BARN / kh) * (Math.log(2 * kh) + 0.5);
    close(fd.kleinNishinaTotal(kh) / asym, 1, 1e-3, 'high-energy limit');
    return `sigma_T = ${fd.THOMSON_BARN.toFixed(5)} b`;
  },
  'feynman: R ratio 3 sum q^2 gives 2, 10/3, 11/3 for 3, 4, 5 quarks': () => {
    close(fd.rRatio(3), 2, 1e-12, 'uds');
    close(fd.rRatio(4), 10 / 3, 1e-12, 'udsc');
    close(fd.rRatio(5), 11 / 3, 1e-12, 'udscb');
    close(fd.rRatio(5, 1), 11 / 9, 1e-12, 'no colour');
    assert(fd.activeQuarks(2) === 3 && fd.activeQuarks(5) === 4 && fd.activeQuarks(20) === 5, 'thresholds');
    return 'R(5) = 11/3';
  },
  'feynman: Bhabha and Moller match the textbook half-angle forms': () => {
    for (const c of [-0.8, -0.2, 0, 0.4, 0.9]) {
      const th = Math.acos(c);
      const s2 = Math.sin(th / 2) ** 2;
      const c4 = Math.cos(th / 2) ** 4;
      const bh = (fd.ALPHA ** 2 / (2 * 100)) * ((1 + c4) / (s2 * s2) - (2 * c4) / s2 + (1 + c * c) / 2) * fd.GEV2_NB;
      close(fd.dsdo('bhabha', c, 10) / bh, 1, 1e-12, `Bhabha at c=${c}`);
      const mo = (fd.ALPHA ** 2 / 100) * ((3 + c * c) ** 2 / Math.sin(th) ** 4) * fd.GEV2_NB;
      close(fd.dsdo('moller', c, 10) / mo, 1, 1e-12, `Moller at c=${c}`);
      close(fd.dsdo('moller', c, 10), fd.dsdo('moller', -c, 10), 1e-12, 'Moller symmetry');
    }
    const ib = fd.interferenceShare('bhabha', both);
    const im = fd.interferenceShare('moller', both);
    assert(ib < 0 && im > 0, `interference signs ${ib} ${im}`);
    return `interference share: Bhabha ${(ib * 100).toFixed(2)}%, Moller +${(im * 100).toFixed(1)}%`;
  },
};
