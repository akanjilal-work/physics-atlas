import { assert, close } from '../assert.ts';
import * as nb from '../../src/topics/nuclear-binding/physics.ts';

type Suite = () => string | void;

const pct = (f: number, m: number) => ((f - m) / m) * 100;

export const suites: Record<string, Suite> = {
  'nuclear-binding: formula within 1.5% of AME2020 for 56Fe and 238U': () => {
    const fe = nb.measured(26, 30)!;
    const u = nb.measured(92, 146)!;
    const eFe = pct(nb.bindingPerA(26, 30), fe.ba);
    const eU = pct(nb.bindingPerA(92, 146), u.ba);
    assert(Math.abs(eFe) < 1.5, `56Fe off by ${eFe.toFixed(2)}%`);
    assert(Math.abs(eU) < 1.5, `238U off by ${eU.toFixed(2)}%`);
    // Hand check of 56Fe from the published coefficients.
    const A = 56;
    const c = Math.cbrt(A);
    const hand = 15.8 * A - 18.3 * c * c - (0.714 * 26 * 25) / c - (23.2 * 16) / A + 12 / Math.sqrt(A);
    close(nb.binding(26, 30), hand, 1e-9, 'B(56Fe) by hand');
    return `56Fe ${eFe.toFixed(2)}%, 238U ${eU.toFixed(2)}%`;
  },
  'nuclear-binding: formula B/A peaks at A = 56 to 62, and 62Ni is the measured maximum': () => {
    const pk = nb.peakBA();
    assert(pk.A >= 56 && pk.A <= 62, `formula peak at A=${pk.A}`);
    close(pk.ba, 8.79, 0.05, 'peak B/A');
    const best = nb.AME2020.reduce((a, b) => (b.ba > a.ba ? b : a));
    assert(best.Z === 28 && best.N === 34, 'AME2020 table maximum should be 62Ni');
    return `formula peak ${nb.nuclideName(pk.Z, pk.A - pk.Z)} at ${pk.ba.toFixed(3)} MeV`;
  },
  'nuclear-binding: 235U + n symmetric fission releases 150 to 220 MeV': () => {
    const f = nb.fission(92, 143, 0.5);
    assert(f.Z1 + f.Z2 === 92 && f.Z1 + f.N1 + f.Z2 + f.N2 === 236, 'charge and nucleon number conserved');
    assert(f.Q > 150 && f.Q < 220, `Q = ${f.Q.toFixed(1)} MeV`);
    // Asymmetric split near the observed mass peaks (A ≈ 95 and 140) also lands in range.
    const g = nb.fission(92, 143, 0.4);
    assert(g.Q > 150 && g.Q < 220, `asymmetric Q = ${g.Q.toFixed(1)} MeV`);
    // Fusion of two 56Fe costs energy, fusion of two 12C releases it.
    assert(nb.fusionQ(26, 30) < 0 && nb.fusionQ(6, 6) > 0, 'fusion sign flips past iron');
    return `symmetric ${f.Q.toFixed(0)} MeV, 94:142 split ${g.Q.toFixed(0)} MeV`;
  },
  'nuclear-binding: valley Z0(A) matches the discrete minimum and known stable isobars': () => {
    for (let A = 11; A <= 261; A += 2) {
      const z0 = nb.valleyZ(A);
      const zm = nb.argminZ(A);
      assert(Math.abs(z0 - zm) <= 0.5 + 1e-9, `A=${A}: analytic ${z0.toFixed(2)} vs argmin ${zm}`);
    }
    // Odd-A isobars with a single stable member (Mattauch rule).
    const known: [number, number][] = [[27, 13], [55, 25], [59, 27], [89, 39], [127, 53], [133, 55], [165, 67], [197, 79]];
    let worst = 0;
    for (const [A, Z] of known) worst = Math.max(worst, Math.abs(nb.valleyZ(A) - Z));
    assert(worst <= 1, `worst |Z0 − Z_stable| = ${worst.toFixed(2)}`);
    // Without Coulomb the valley sits on N ≈ Z (the tiny shift is the n–p mass difference).
    const noC = { ...nb.ALL_ON, coulomb: false };
    close(nb.valleyZ(200, noC), 100 + (nb.DELTA_NH * 200) / (8 * 23.2), 1e-9, 'Z0 without Coulomb');
    assert(Math.abs(2 * nb.valleyZ(200, noC) - 200) < 2, 'N ≈ Z without Coulomb');
    return `worst stable-isobar miss ${worst.toFixed(2)}`;
  },
  'nuclear-binding: 4He is poorly fit (expected: the formula has no shell effects)': () => {
    // ⁴He is doubly magic and far too small for a liquid drop. The formula underbinds it by about 20%.
    const e = pct(nb.bindingPerA(2, 2), nb.measured(2, 2)!.ba);
    assert(e < -15 && e > -30, `4He error ${e.toFixed(1)}%`);
    const d = pct(nb.bindingPerA(1, 1), nb.measured(1, 1)!.ba);
    assert(d < -100, 'deuteron is not even bound in the formula');
    return `4He ${e.toFixed(1)}% (documented), 2H ${d.toFixed(0)}%`;
  },
  'nuclear-binding: 250 stable ground states, mostly in the formula\'s stable valley': () => {
    const list = nb.stableList();
    assert(list.length === 250, `got ${list.length}`);
    const near = list.filter((s) => Math.abs(s.Z - nb.valleyZ(s.Z + s.N)) <= 2.5).length;
    assert(near / list.length > 0.95, `${near} of ${list.length} within 2.5 of Z0`);
    assert(nb.decayMode(27, 33) === 'beta-' && nb.decayMode(92, 146) === 'alpha', 'Co-60 is β−, U-238 is α');
    return `${near}/${list.length} within ΔZ ≤ 2.5 of the valley`;
  },
};
