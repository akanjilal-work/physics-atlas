import { assert, close } from '../assert.ts';
import * as ce from '../../src/topics/carnot-engines/physics.ts';

type Suite = () => string | void;

const CYCLES: ce.CycleId[] = ['carnot', 'otto', 'stirling', 'diesel'];
const GAMMAS = [5 / 3, 7 / 5];

export const suites: Record<string, Suite> = {
  'carnot engines: P-V loop area equals the sum of leg works for every cycle': () => {
    let worst = 0;
    for (const cycle of CYCLES) {
      for (const gamma of GAMMAS) {
        for (const [Th, Tc, r] of [[900, 300, 8], [600, 300, 12], [1500, 250, 30], [400, 350, 3]]) {
          for (const regen of [false, true]) {
            const c = ce.buildCycle({ cycle, Th, Tc, r, gamma, regen });
            const area = ce.loopAreaPV(ce.sampleLoop(c, 4000));
            const rel = Math.abs(area - c.W) / c.W;
            assert(c.W > 0, `${cycle}: W should be positive, got ${c.W}`);
            assert(rel < 1e-5, `${cycle} γ=${gamma.toFixed(2)} Th=${Th} Tc=${Tc}: area ${area} vs W ${c.W}`);
            // First law per cycle: W = Q_net
            let qnet = 0;
            for (const l of c.legs) qnet += l.Q;
            close(qnet, c.W, 1e-9 * c.W, `${cycle}: net heat vs work`);
            worst = Math.max(worst, rel);
          }
        }
      }
    }
    return `worst relative gap ${worst.toExponential(1)}`;
  },
  'carnot engines: Carnot efficiency from leg heats is 1 - Tc/Th': () => {
    for (const gamma of GAMMAS) {
      for (const [Th, Tc, r] of [[600, 300, 8], [1200, 300, 40], [500, 450, 2]]) {
        const c = ce.buildCycle({ cycle: 'carnot', Th, Tc, r, gamma });
        close(c.eta, 1 - Tc / Th, 1e-12, `Carnot η at Th=${Th}, Tc=${Tc}`);
        // Clausius: Qin/Th = Qout/Tc on the two isotherms
        close(c.Qin / Th, c.Qout / Tc, 1e-12, 'Qh/Th = Qc/Tc');
      }
    }
    const c = ce.buildCycle({ cycle: 'carnot', Th: 600, Tc: 300, r: 8, gamma: 5 / 3 });
    return `η = ${c.eta.toFixed(6)} at 600 K / 300 K`;
  },
  'carnot engines: Otto efficiency is 1 - r^(1-γ) and below Carnot': () => {
    for (const gamma of GAMMAS) {
      for (const r of [2, 5, 8, 10]) {
        const c = ce.buildCycle({ cycle: 'otto', Th: 2500, Tc: 300, r, gamma });
        assert(!c.rCapped, 'r should not be capped here');
        close(c.eta, ce.ottoEta(r, gamma), 1e-12, `Otto η at r=${r}`);
        assert(c.eta < c.etaCarnot, 'Otto must fall below Carnot');
      }
    }
    // Textbook value: r = 10, air (γ = 1.4) gives η = 0.602
    const c = ce.buildCycle({ cycle: 'otto', Th: 2500, Tc: 300, r: 10, gamma: 1.4 });
    close(c.eta, 0.6019, 1e-4, 'Otto r=10 air');
    return `r=10, γ=1.4: η = ${c.eta.toFixed(4)}`;
  },
  'carnot engines: Diesel efficiency matches the cutoff-ratio formula': () => {
    const gamma = 1.4;
    const c = ce.buildCycle({ cycle: 'diesel', Th: 2000, Tc: 300, r: 16, gamma });
    const rc = c.legs[1].b.V / c.legs[1].a.V;
    close(c.eta, ce.dieselEta(c.rEff, rc, gamma), 1e-12, 'Diesel η');
    assert(c.eta < ce.ottoEta(c.rEff, gamma), 'Diesel is below Otto at the same r');
    return `r=${c.rEff.toFixed(1)}, rc=${rc.toFixed(2)}: η = ${c.eta.toFixed(4)}`;
  },
  'carnot engines: total gas ΔS is zero, and world ΔS is zero only for reversible exchange': () => {
    for (const cycle of CYCLES) {
      for (const gamma of GAMMAS) {
        for (const regen of [false, true]) {
          const c = ce.buildCycle({ cycle, Th: 900, Tc: 300, r: 8, gamma, regen });
          const scale = c.Qin / 300;
          close(ce.gasEntropyChange(c), 0, 1e-12 * scale, `${cycle}: gas ΔS`);
          const sw = ce.entropyGenerated(c, false);
          const sf = ce.entropyGenerated(c, true);
          const reversible = cycle === 'carnot' || (cycle === 'stirling' && regen);
          if (reversible) {
            close(sw, 0, 1e-12 * scale, `${cycle}: engine world ΔS`);
            close(sf, 0, 1e-12 * scale, `${cycle}: fridge world ΔS`);
          } else {
            assert(sw > 1e-6 * scale, `${cycle}: engine should make entropy, got ${sw}`);
            assert(sf > 1e-6 * scale, `${cycle}: fridge should make entropy, got ${sf}`);
          }
          // For a reversible cycle, the T-S loop area is also the work.
          close(ce.loopAreaTS(ce.sampleLoop(c, 4000)), c.W, 1e-5 * c.W, `${cycle}: T-S area`);
        }
      }
    }
    return 'Σ ΔS_gas = 0 for all cycles; ΔS_world = 0 for Carnot and regenerated Stirling';
  },
  'carnot engines: Carnot fridge COP is Tc/(Th - Tc), heat pump Th/(Th - Tc)': () => {
    for (const [Th, Tc] of [[310, 270], [600, 300], [330, 300]]) {
      const c = ce.buildCycle({ cycle: 'carnot', Th, Tc, r: 10, gamma: 1.4 });
      close(ce.copFridge(c), Tc / (Th - Tc), 1e-10, `fridge COP ${Th}/${Tc}`);
      close(ce.copHeatPump(c), Th / (Th - Tc), 1e-10, `heat pump COP ${Th}/${Tc}`);
      close(ce.copHeatPump(c) - ce.copFridge(c), 1, 1e-10, 'COP_hp = COP_f + 1');
    }
    const c = ce.buildCycle({ cycle: 'carnot', Th: 310, Tc: 270, r: 10, gamma: 1.4 });
    return `310 K / 270 K: COP = ${ce.copFridge(c).toFixed(3)}`;
  },
  'carnot engines: Stirling with ideal regenerator reaches Carnot, without it falls short': () => {
    const a = ce.buildCycle({ cycle: 'stirling', Th: 900, Tc: 300, r: 4, gamma: 5 / 3, regen: true });
    const b = ce.buildCycle({ cycle: 'stirling', Th: 900, Tc: 300, r: 4, gamma: 5 / 3, regen: false });
    close(a.eta, 2 / 3, 1e-12, 'regenerated Stirling');
    // Analytic: W = nR (Th - Tc) ln r, Qin = nR Th ln r + nCv (Th - Tc)
    const lnr = Math.log(4);
    const expect = (600 * lnr) / (900 * lnr + 1.5 * 600);
    close(b.eta, expect, 1e-12, 'plain Stirling');
    return `with ${a.eta.toFixed(3)}, without ${b.eta.toFixed(3)}`;
  },
  'carnot engines: endoreversible power peaks at the Curzon-Ahlborn efficiency': () => {
    const Th = 800;
    const Tc = 300;
    // Golden-section search for the best inner temperature Ti in (Tc, Th)
    let lo = Tc + 1e-9;
    let hi = Th - 1e-9;
    const g = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 200; k++) {
      const x1 = hi - g * (hi - lo);
      const x2 = lo + g * (hi - lo);
      if (ce.endoreversiblePower(Th, Tc, x1) > ce.endoreversiblePower(Th, Tc, x2)) hi = x2;
      else lo = x1;
    }
    const Ti = 0.5 * (lo + hi);
    close(Ti, Math.sqrt(Th * Tc), 1e-6, 'optimal Ti');
    const eta = 1 - Tc / Ti;
    close(eta, ce.curzonAhlbornEta(Th, Tc), 1e-9, 'η at max power');
    return `η* = ${eta.toFixed(4)} vs Carnot ${(1 - Tc / Th).toFixed(4)}`;
  },
};
