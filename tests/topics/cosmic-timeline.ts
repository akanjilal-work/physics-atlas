import { readFileSync } from 'node:fs';
import { assert, close } from '../assert.ts';
import * as P from '../../src/topics/cosmic-timeline/physics.ts';

type Suite = () => string | void;

const th = P.buildThermal();
const c = th.cosmo;

export const suites: Record<string, Suite> = {
  'cosmic timeline: radiation-era prefactor (45/16π³)^(1/4) √(M_Pl ħ/1 s) ≈ 1.55 MeV': () => {
    close(P.RAD_PREFACTOR_MEV, 1.5557, 2e-3, 'prefactor');
    // Textbook forms: t = 2.42 s g*^(-1/2) (T/MeV)^(-2), and t = 1.32 s (T/MeV)^(-2) after e± annihilation (g* = 3.36).
    close(P.radiationTime(1, 1), 2.42, 0.01, 't(1 MeV, g*=1)');
    close(P.radiationTime(1, 3.36), 1.32, 0.01, 't(1 MeV, g*=3.36)');
    return `C = ${P.RAD_PREFACTOR_MEV.toFixed(4)} MeV`;
  },
  'cosmic timeline: Friedmann table follows T = 1.56 g*^(-1/4) t^(-1/2) MeV where g* is flat': () => {
    let worst = 0;
    for (const t of [1e-30, 1e-20, 1e-13, 1e-2, 0.3, 1e4]) {
      const T = P.tempAt(th, t);
      const r = P.radiationT(t, P.gStar(T)) / T;
      worst = Math.max(worst, Math.abs(r - 1));
    }
    assert(worst < 5e-3, `worst mismatch ${worst}`);
    // Small residuals come from the history of g*: the instantaneous law ignores earlier annihilations.
    // At 1 s the plasma is at about 0.86 MeV (g* = 10.75).
    close(P.tempAt(th, 1), 1.5557 * 10.75 ** -0.25, 0.01, 'T(1 s)');
    return `max |ratio - 1| = ${worst.toExponential(1)}`;
  },
  'cosmic timeline: T ∝ 1/a, and a·T jumps by (11/4)^(1/3) across e± annihilation': () => {
    const aT = (t: number) => P.scaleAt(th, t) * P.tempAt(th, t);
    close(aT(1e5) / aT(1e9), 1, 1e-6, 'aT constant after annihilation');
    close(aT(1e5) / aT(0.01), Math.cbrt(11 / 4), 0.01, 'entropy heating');
    close(P.mevToKelvin(P.tempAt(th, P.ageToday(th))), 2.7255, 1e-3, 'T today');
    return `ratio ${(aT(1e5) / aT(0.01)).toFixed(4)}`;
  },
  'cosmic timeline: ΛCDM age at z = 1090 is about 380,000 yr (within 10%)': () => {
    const t = P.timeAtZ(th, 1090) / P.YEAR_S;
    close(t / 380000, 1, 0.1, 't(z=1090)');
    // Independent quadrature with constant Ω_r agrees.
    close(P.ageAtZ(c, 1090) / P.YEAR_S / t, 1, 1e-3, 'independent quadrature');
    return `${(t / 1e3).toFixed(0)} kyr`;
  },
  'cosmic timeline: age today is 13.8 Gyr (Planck 2018: 13.787 ± 0.020)': () => {
    const t = P.ageToday(th) / P.GYR_S;
    close(t, 13.8, 0.05, 'age');
    close(P.ageAtZ(c, 0) / P.GYR_S, t, 0.01, 'independent quadrature');
    return `${t.toFixed(3)} Gyr`;
  },
  'cosmic timeline: matter-radiation equality near z = 3400, t ≈ 50 kyr': () => {
    const zeq = P.zEquality(c);
    close(zeq / 3387, 1, 0.03, 'z_eq vs Planck 3387');
    const t = P.timeAtZ(th, zeq) / P.YEAR_S;
    close(t / 50000, 1, 0.1, 't_eq');
    // Closed form for radiation plus matter: t_eq = (4 - 2√2)/3 · a_eq² / (H0 √Ω_r).
    const aeq = c.Or / c.Om;
    const tAn = (((4 - 2 * Math.SQRT2) / 3) * aeq * aeq) / (P.h0PerSecond(c.H0) * Math.sqrt(c.Or)) / P.YEAR_S;
    close(t / tAn, 1, 0.005, 'analytic t_eq');
    return `z_eq = ${zeq.toFixed(0)}, t_eq = ${(t / 1e3).toFixed(1)} kyr`;
  },
  'cosmic timeline: epochs in increasing time order, table values match the model': () => {
    const E = P.EPOCHS;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      assert(e.t0 <= e.t && e.t <= e.t1, `${e.id}: t outside its range`);
      if (i > 0) assert(E[i - 1].t < e.t, `${e.id} is before ${E[i - 1].id}`);
    }
    let checked = 0;
    for (const e of E) {
      if (e.TK !== null && e.t > P.INFLATION_END) {
        const TK = P.mevToKelvin(P.tempAt(th, e.t));
        close(e.TK / TK, 1, 0.06, `${e.id} temperature`);
        checked++;
      }
      if (e.z !== null && e.z > 0) {
        close((1 + e.z) / (1 + P.redshiftAt(th, e.t)), 1, 0.06, `${e.id} redshift`);
        checked++;
      }
    }
    return `${E.length} epochs, ${checked} values checked`;
  },
  'cosmic timeline: every link points at a topic in src/catalog.ts': () => {
    const src = readFileSync(new URL('../../src/catalog.ts', import.meta.url), 'utf8');
    const ids = new Set([...src.matchAll(/\{\s*id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]));
    assert(ids.size > 50, `parsed only ${ids.size} catalog ids`);
    for (const e of P.EPOCHS) {
      const m = /^#\/t\/([a-z0-9-]+)$/.exec(e.link);
      assert(!!m, `${e.id}: bad link ${e.link}`);
      assert(ids.has(m![1]), `${e.id}: ${m![1]} not in catalog`);
    }
    assert(P.EPOCHS.some((e) => e.link === '#/t/fate-of-universe'), 'future links to fate-of-universe');
    return `${P.EPOCHS.length} links ok`;
  },
};
