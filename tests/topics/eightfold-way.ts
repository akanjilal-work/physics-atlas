import { assert, close } from '../assert.ts';
import * as ew from '../../src/topics/eightfold-way/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'eightfold way: Gell-Mann–Nishijima Q = I3 + Y/2 holds for all 27 hadrons': () => {
    const { maxResidual } = ew.gmnAudit();
    assert(ew.HADRONS.length === 27, `expected 27 hadrons, got ${ew.HADRONS.length}`);
    assert(maxResidual < 1e-9, `max residual ${maxResidual}`);
    // Spot checks against textbook values (Griffiths, Introduction to Elementary Particles, ch. 1).
    const k = ew.qn(ew.byId('K+')!);
    assert(k.S === 1 && k.Y === 1 && k.I3 === 0.5, 'K+ should have S=+1, Y=+1, I3=+1/2');
    const o = ew.qn(ew.byId('Omega-')!);
    assert(o.S === -3 && o.Y === -2 && o.I3 === 0 && o.B === 1, 'Omega- should have S=-3, Y=-2, I3=0, B=1');
    return `max |Q − I3 − Y/2| = ${maxResidual}`;
  },
  'eightfold way: multiplet counts are 8+1 (mesons), 8 (octet), 10 (decuplet)': () => {
    const nm = ew.inMultiplet('meson').length;
    const no = ew.inMultiplet('octet').length;
    const nd = ew.inMultiplet('decuplet').length;
    assert(nm === 9 && no === 8 && nd === 10, `got ${nm}, ${no}, ${nd}`);
    // 3 ⊗ 3 ⊗ 3 has 10 distinct symmetric flavour contents, and the decuplet uses each once.
    const keys = new Set(ew.inMultiplet('decuplet').map((h) => ew.contentKey(h.q)));
    assert(keys.size === 10, `decuplet contents not distinct: ${keys.size}`);
    return 'mesons 9 = 8 + 1, octet 8, decuplet 10';
  },
  'eightfold way: decuplet spacing within 15% of uniform (≈146 MeV per step)': () => {
    const { gaps, mean } = ew.decupletLevels();
    for (const g of gaps) assert(Math.abs(g / mean - 1) < 0.15, `gap ${g.toFixed(1)} vs mean ${mean.toFixed(1)}`);
    close(mean, 146.8, 1, 'mean spacing (1672.45 − 1232)/3');
    return `gaps ${gaps.map((g) => g.toFixed(1)).join(', ')} MeV, mean ${mean.toFixed(1)}`;
  },
  'eightfold way: equal spacing predicts Ω⁻ near 1680 MeV, within 20 MeV of PDG 1672.45': () => {
    const { step, fit } = ew.predictOmega();
    assert(Math.abs(step - ew.OMEGA_MASS) < 20, `step prediction ${step}`);
    assert(Math.abs(fit - ew.OMEGA_MASS) < 20, `fit prediction ${fit}`);
    assert(step > 1670 && fit < 1690, 'predictions should bracket ~1680');
    return `2Ξ* − Σ* = ${step.toFixed(1)}, linear fit ${fit.toFixed(1)} MeV`;
  },
  'eightfold way: quark content gives the measured charge for every hadron': () => {
    const { chargeMismatches } = ew.gmnAudit();
    assert(chargeMismatches.length === 0, `mismatch: ${chargeMismatches.join(',')}`);
    close(ew.contentQN(['u', 'u', 'd']).Q, 1, 1e-12, 'uud');
    close(ew.contentQN(['u', 'd', 'd']).Q, 0, 1e-12, 'udd');
    close(ew.contentQN(['u', 'u', 'u']).Q, 2, 1e-12, 'uuu');
    close(ew.contentQN(['s', 's', 's']).Q, -1, 1e-12, 'sss');
    close(ew.contentQN(['u', 'S']).Q, 1, 1e-12, 'us̄');
    close(ew.contentQN(['s', 'U']).Q, -1, 1e-12, 'sū');
    return 'all 27 charges match';
  },
  'eightfold way: builder identifies uud as p or Δ⁺, and sss as Ω⁻ only': () => {
    const a = ew.identify(['d', 'u', 'u']).map((h) => h.id).sort();
    assert(a.join() === 'Delta+,p', `uud -> ${a}`);
    const b = ew.identify(['s', 's', 's']).map((h) => h.id);
    assert(b.join() === 'Omega-', `sss -> ${b}`);
    const c = ew.identify(['u', 'S']).map((h) => h.id);
    assert(c.join() === 'K+', `us̄ -> ${c}`);
    const d = ew.identify(['s', 'S']).map((h) => h.id).sort();
    assert(d.join() === 'eta,etap,pi0', `ss̄ -> ${d}`);
    return 'uud → p/Δ⁺, sss → Ω⁻, us̄ → K⁺';
  },
  'eightfold way: octet GMO 2(N+Ξ) = 3Λ+Σ within 1%, and m_n − m_p = 1.293 MeV': () => {
    const { lhs, rhs, rel } = ew.octetGMO();
    assert(Math.abs(rel) < 0.01, `rel ${rel}`);
    close(ew.byId('n')!.mass - ew.byId('p')!.mass, 1.29333, 1e-4, 'n − p mass difference (PDG)');
    return `${lhs.toFixed(1)} vs ${rhs.toFixed(1)} MeV (${(rel * 100).toFixed(2)}%)`;
  },
};
