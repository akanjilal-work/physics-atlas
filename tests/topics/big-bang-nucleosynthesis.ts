import { assert, close } from '../assert.ts';
import * as bbn from '../../src/topics/big-bang-nucleosynthesis/physics.ts';

type Suite = () => string | void;

const STD = { eta: bbn.ETA_PLANCK, Nnu: 3, tau: bbn.TAU_N };

export const suites: Record<string, Suite> = {
  'BBN: sudden freeze-out n/p = exp(−Q/kT_f) and the full weak-rate freeze-out': () => {
    // Closed form: Q = 1.293 MeV, kT_f = 0.8 MeV gives e^{-1.616} = 0.1986.
    close(bbn.npEquilibrium(0.8), Math.exp(-1.293 / 0.8), 1e-12, 'closed form');
    close(bbn.npEquilibrium(0.8), 0.1986, 5e-4, 'n/p at 0.8 MeV');
    // kT_f = 0.72 MeV gives the often-quoted 1/6.
    close(bbn.npEquilibrium(0.72), 1 / 6, 0.003, 'n/p at 0.72 MeV');
    // Integrated weak rates: after the rates die out (T = 0.25 MeV, t ≈ 12 s) n/p should sit
    // between 1/6 and 1/5. Weinberg's "First Three Minutes" quotes 17% neutrons at 13.8 s.
    const r = bbn.runBBN(STD);
    const Xn = r.npFreeze / (1 + r.npFreeze);
    assert(r.npFreeze > 1 / 6 && r.npFreeze < 0.21, `n/p after freeze-out ${r.npFreeze}`);
    close(Xn, 0.17, 0.01, 'neutron fraction at freeze-out');
    return `e^(−Q/0.8) = ${bbn.npEquilibrium(0.8).toFixed(4)}, network n/p = ${r.npFreeze.toFixed(3)} (X_n = ${Xn.toFixed(3)})`;
  },

  'BBN: helium formula Y_p = 2(n/p)/(1+n/p)': () => {
    close(bbn.heliumFromNP(1 / 7), 0.25, 1e-12, 'n/p = 1/7');
    close(bbn.heliumFromNP(1), 1, 1e-12, 'n/p = 1 means all helium');
    close(bbn.heliumFromNP(0), 0, 1e-12, 'no neutrons');
    // The network's final helium matches the formula applied to its own n/p at nucleosynthesis.
    const r = bbn.runBBN(STD);
    close(r.Yp, bbn.heliumFromNP(r.npNuc), 0.004, 'network Y_p vs formula');
    return `formula(1/7) = 0.25, network Y_p = ${r.Yp.toFixed(4)} vs formula(${r.npNuc.toFixed(4)}) = ${bbn.heliumFromNP(r.npNuc).toFixed(4)}`;
  },

  'BBN: neutron decay lowers n/p to about 1/7 by nucleosynthesis': () => {
    // Free decay alone: 1/6 for 120 s gives 1/7 (analytic).
    close(bbn.npAfterDecay(1 / 6, 120, 879), 1 / 7, 0.002, 'decay 1/6 for 120 s');
    // Network: from ~1/5 at freeze-out to ~1/7 when half the neutrons are in nuclei.
    const r = bbn.runBBN(STD);
    assert(r.npNuc < r.npFreeze * 0.8, 'decay should remove >20% of free neutrons');
    close(r.npNuc, 1 / 7, 0.006, 'n/p at nucleosynthesis');
    // Timing: the bottleneck breaks near kT ≈ 0.07 MeV, a few minutes in.
    close(r.TNuc, 0.072, 0.006, 'temperature at nucleosynthesis (MeV)');
    assert(r.tNuc > 180 && r.tNuc < 300, `t_nuc = ${r.tNuc}`);
    // Saha estimate of the bottleneck temperature.
    close(bbn.sahaDeuteriumT(bbn.ETA_PLANCK), 0.066, 0.004, 'Saha T_D');
    return `n/p ${r.npFreeze.toFixed(3)} → ${r.npNuc.toFixed(3)} (1/${(1 / r.npNuc).toFixed(1)}) at t = ${r.tNuc.toFixed(0)} s, kT = ${r.TNuc.toFixed(3)} MeV`;
  },

  'BBN: network conserves baryon number': () => {
    let worst = 0;
    for (const eta of [1e-10, 6e-10, 3e-9]) {
      const r = bbn.runBBN({ eta, Nnu: 3, tau: 878.4 });
      worst = Math.max(worst, r.baryonErr);
      let s = 0;
      for (let i = 0; i < bbn.NSP; i++) s += bbn.A_NUC[i] * r.Y[i];
      close(s, 1, 1e-10, `Σ A·Y at η = ${eta}`);
    }
    assert(worst < 1e-10, `max drift ${worst}`);
    return `max |Σ A_i Y_i − 1| = ${worst.toExponential(1)}`;
  },

  'BBN: D/H falls monotonically with η, Y_p rises slowly': () => {
    const g = bbn.etaGrid(40, 1e-10, 1e-9);
    const s = bbn.schramm(3, 878.4, g);
    for (let i = 1; i < g.length; i++) {
      assert(s.DH[i] < s.DH[i - 1], `D/H not falling at η = ${g[i].toExponential(2)}`);
      assert(s.Yp[i] > s.Yp[i - 1], `Y_p not rising at η = ${g[i].toExponential(2)}`);
    }
    // D/H roughly ∝ η^−1.6 near the Planck value (Steigman 2012 fit).
    const lo = bbn.runBBN({ ...STD, eta: 5e-10 }).DH;
    const hi = bbn.runBBN({ ...STD, eta: 7e-10 }).DH;
    const slope = Math.log(hi / lo) / Math.log(7 / 5);
    close(slope, -1.6, 0.15, 'd ln(D/H) / d ln η');
    return `D/H ${s.DH[0].toExponential(2)} → ${s.DH[g.length - 1].toExponential(2)}, slope ${slope.toFixed(2)}`;
  },

  'BBN: Planck η reproduces standard BBN (PRIMAT 2018: Y_p 0.2471, D/H 2.46e-5, ³He/H 1.07e-5, ⁷Li/H 5.6e-10)': () => {
    const r = bbn.runBBN(STD);
    close(r.Yp, 0.2471, 0.003, 'Y_p');
    close(r.DH / 2.46e-5, 1, 0.08, 'D/H ratio');
    close(r.He3H / 1.07e-5, 1, 0.1, '³He/H ratio');
    close(r.Li7H / 5.6e-10, 1, 0.15, '⁷Li/H ratio');
    // Lithium problem: prediction is about 3× the Spite plateau.
    const f = r.Li7H / bbn.LI_OBS;
    assert(f > 2.5 && f < 4.5, `Li excess ${f}`);
    return `Y_p ${r.Yp.toFixed(4)}, D/H ${r.DH.toExponential(3)}, ³He/H ${r.He3H.toExponential(2)}, Li/H ${r.Li7H.toExponential(2)} (${f.toFixed(1)}× observed)`;
  },

  'BBN: one extra neutrino species raises Y_p by about 0.013': () => {
    const y3 = bbn.runBBN(STD).Yp;
    const y4 = bbn.runBBN({ ...STD, Nnu: 4 }).Yp;
    close(y4 - y3, 0.013, 0.002, 'ΔY_p per ΔN_ν');
    // Clock check: t = 0.738 s at kT = 1 MeV with g* = 10.75 (radiation era, 2.42 s/√g*).
    close(bbn.cosmology(3).tOfT(1), 2.42 / Math.sqrt(10.75), 0.02, 't(1 MeV)');
    // After e± annihilation T_ν/T = (4/11)^{1/3}.
    close(bbn.cosmology(3).Tnu(0.01) / 0.01, Math.cbrt(4 / 11), 0.002, 'T_ν/T');
    return `Y_p(3) = ${y3.toFixed(4)}, Y_p(4) = ${y4.toFixed(4)}, Δ = ${(y4 - y3).toFixed(4)}`;
  },
};
