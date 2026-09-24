import { assert, close } from '../assert.ts';
import * as ma from '../../src/topics/matter-asymmetry/physics.ts';

type Suite = () => string | void;

const LAMBDA = 1e13;

export const suites: Record<string, Suite> = {
  'matter asymmetry: toy survivor fraction equals the bias for small bias': () => {
    const notes: string[] = [];
    for (const eps of [1e-9, 1e-6, 1e-3]) {
      const h = ma.toyHistory({ bias: eps, lambda: LAMBDA });
      // Once antimatter is gone the survivors are exactly the conserved excess D over the start yield,
      // and D/Y0 = eps/(1 + eps/2) to first order, so the fraction equals eps for small eps.
      close(h.survivorFraction / (h.bias / h.Y[0]), 1, 1e-9, `excess conserved for eps=${eps}`);
      close(h.survivorFraction / eps, 1, 1e-3, `survivors for eps=${eps}`);
      assert(h.antiFraction < 1e-3 * eps, `antimatter left ${h.antiFraction}`);
      notes.push(`${eps}: ${h.survivorFraction.toExponential(3)}`);
    }
    return notes.join(', ');
  },
  'matter asymmetry: zero bias leaves a tiny symmetric relic, far below 1e-9': () => {
    const h = ma.toyHistory({ bias: 0, lambda: LAMBDA });
    assert(h.survivorFraction < 1e-11, `relic ${h.survivorFraction}`);
    close(h.Y[h.Y.length - 1], h.Yb[h.Yb.length - 1], 1e-30, 'Y = Yb when unbiased');
    return `relic fraction ${h.survivorFraction.toExponential(2)}`;
  },
  'matter asymmetry: implicit solver matches the exact Bernoulli solution when pair creation is off': () => {
    // Start cold (x = 60, Yeq ~ e^-60), where the ODE reduces to dYb/ds = -Yb(Yb + D).
    for (const D of [0, 1e-3]) {
      const lambda = 1e5;
      const n = 20000;
      const xa = 60, xb = 6000;
      let yb = 0.01;
      const u0 = Math.log(xa), du = (Math.log(xb) - u0) / n;
      let xPrev = xa;
      for (let i = 1; i <= n; i++) {
        const x = Math.exp(u0 + i * du);
        yb = ma.implicitStep(yb, D, lambda, x, x - xPrev);
        xPrev = x;
      }
      const exact = ma.annihilationClosedForm(0.01, D, lambda, xa, xb);
      close(yb / exact, 1, 5e-3, `D=${D}`);
    }
    return 'agreement better than 0.5 %';
  },
  'kaons: PDG lifetimes 0.08954 ns and 51.16 ns and mixing probabilities sum to the survival norm': () => {
    close(ma.TAU_S, 0.08954, 1e-6, 'tau_S');
    close(ma.TAU_L, 51.16, 1e-6, 'tau_L');
    const k0 = ma.makeKaon(false);
    const p = { pK0: 0, pK0bar: 0, norm: 0 };
    for (const t of [0, 0.05, 0.3, 0.6, 2, 20]) {
      ma.kaonProbs(k0, t, p);
      // Without CP violation, P(K0)+P(K0bar) = (e^-Gs t + e^-GL t)/2 exactly.
      close(p.pK0 + p.pK0bar, 0.5 * (Math.exp(-t / ma.TAU_S) + Math.exp(-t / ma.TAU_L)), 1e-14, `sum at t=${t}`);
    }
    ma.kaonProbs(k0, 0, p);
    close(p.pK0, 1, 1e-14, 'pure K0 at t=0');
    // Late times: pure K_L, half K0 and half K0bar.
    ma.kaonProbs(k0, 10, p);
    close(p.pK0 / p.norm, 0.5, 1e-12, 'K_L is half K0');
    return 'P(K0)+P(K0bar) = (e^-t/tS + e^-t/tL)/2';
  },
  'kaons: closed form agrees with RK4 integration of i dpsi/dt = (M - i Gamma/2) psi': () => {
    const k = ma.makeKaon(true);
    const H = ma.kaonHamiltonian(k);
    const psi = new Float64Array([1, 0, 0, 0]);
    const h = 1e-4;
    let t = 0;
    const p = { pK0: 0, pK0bar: 0, norm: 0 };
    let worst = 0;
    for (let i = 1; i <= 30000; i++) {
      ma.schrodingerStep(H, psi, h);
      t += h;
      if (i % 2500 === 0) {
        ma.kaonProbs(k, t, p);
        worst = Math.max(worst, Math.abs(psi[0] ** 2 + psi[1] ** 2 - p.pK0), Math.abs(psi[2] ** 2 + psi[3] ** 2 - p.pK0bar));
      }
    }
    assert(worst < 1e-9, `max deviation ${worst}`);
    return `max |dP| ${worst.toExponential(1)} up to t=${t.toFixed(1)} ns`;
  },
  'kaons: semileptonic asymmetry equals 2 Re(eps) and matches the measured 3.3e-3': () => {
    const k = ma.makeKaon(true);
    const d = ma.deltaL(k);
    const twoRe = 2 * k.er;
    close(d, twoRe / (1 + k.er ** 2 + k.ei ** 2), 1e-15, 'exact form');
    close(d, twoRe, 1e-7, '2 Re eps');
    close(d, ma.DELTA_L_MEASURED, 0.15e-3, 'vs PDG (3.32 +- 0.06)e-3');
    // Late-time lepton rates reproduce the same asymmetry.
    const r = { pipi: 0, pipiS: 0, pipiL: 0, lplus: 0, lminus: 0, other: 0, total: 0 };
    ma.kaonRates(k, 20, r);
    close((r.lplus - r.lminus) / (r.lplus + r.lminus), d, 1e-9, 'rate asymmetry at 20 ns');
    const k0 = ma.makeKaon(false);
    close(ma.deltaL(k0), 0, 1e-18, 'no CP violation');
    return `delta_L = ${d.toExponential(3)}, 2Re(eps) = ${twoRe.toExponential(3)}`;
  },
  'kaons: BR(K_L -> pi pi) = |eps|^2 Gamma_S/Gamma_L matches PDG 2.83e-3; total decay probability is 1': () => {
    const k = ma.makeKaon(true);
    const br = ma.brLpipiModel(k);
    close(br / ma.BR_L_PIPI, 1, 0.02, 'BR model vs PDG');
    // Integrate all decay rates for a K0 beam over time: must equal 1 (to the tiny K_S semileptonic width we ignore).
    const tab = ma.decayTable(k, 1e-4, 5000, 20000);
    const tot = tab.cdf[tab.cdf.length - 1];
    close(tot, 1, 2e-3, 'integrated decay probability');
    return `BR = ${br.toExponential(3)}, integral = ${tot.toFixed(5)}`;
  },
};
