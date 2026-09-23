import { assert, close } from '../assert.ts';
import * as bs from '../../src/topics/band-structure/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'band structure: transfer matrix matches the closed Kronig–Penney form, below and above V0': () => {
    const p = { V0: 4, a: 5, b: 1 };
    let worst = 0;
    for (const E of [0.3, 1.1, 2.5, 3.9, 4.2, 7, 15]) worst = Math.max(worst, Math.abs(bs.kpD(E, p) - bs.kpClosedForm(E, p)));
    assert(worst < 1e-10, `max difference ${worst}`);
    return `max |ΔD| = ${worst.toExponential(1)}`;
  },
  'band structure: V0 = 0 reduces to free electrons E = ħ²k²/2m (folded)': () => {
    const p = { V0: 0, a: 5, b: 1 };
    const e = bs.bandEdges(p);
    const G = (2 * Math.PI) / p.a;
    let worst = 0;
    for (const f of [0.1, 0.35, 0.6, 0.9]) {
      const k = (f * Math.PI) / p.a;
      worst = Math.max(worst, Math.abs(bs.bandEnergy(p, e, 1, k) - bs.HB2M * k * k));
      worst = Math.max(worst, Math.abs(bs.bandEnergy(p, e, 2, k) - bs.HB2M * (G - k) ** 2));
      worst = Math.max(worst, Math.abs(bs.bandEnergy(p, e, 3, k) - bs.HB2M * (G + k) ** 2));
    }
    close(e[1], bs.HB2M * (Math.PI / p.a) ** 2, 1e-2, 'top of band 1 at free (π/a)² value');
    assert(worst < 1e-8, `max error ${worst} eV`);
    return `max error ${worst.toExponential(1)} eV`;
  },
  'band structure: band edges sit at k = 0 and k = π/a': () => {
    const p = { V0: 4, a: 5, b: 1 };
    const e = bs.bandEdges(p);
    for (let n = 1; n <= 4; n++) {
      const N = 60;
      let prev = bs.bandEnergy(p, e, n, 0);
      let dir = 0;
      let lo = prev, hi = prev;
      for (let i = 1; i <= N; i++) {
        const E = bs.bandEnergy(p, e, n, (i / N) * (Math.PI / p.a));
        const d = Math.sign(E - prev);
        if (dir === 0) dir = d;
        assert(d === dir || Math.abs(E - prev) < 1e-9, `band ${n} not monotonic at i=${i}`);
        lo = Math.min(lo, E);
        hi = Math.max(hi, E);
        prev = E;
      }
      close(lo, e[2 * n - 2], 1e-4, `band ${n} bottom`);
      close(hi, e[2 * n - 1], 1e-4, `band ${n} top`);
      // Odd bands start at k = 0, even bands at k = π/a.
      assert((n % 2 === 1) === (dir > 0), `band ${n} bottom on the wrong side`);
    }
    return `gaps ${[1, 2, 3].map((n) => (e[2 * n] - e[2 * n - 1]).toFixed(2)).join(', ')} eV`;
  },
  'band structure: thin tall barriers reach the Dirac-comb (delta) limit': () => {
    const a = 5;
    const V0b = 4; // eV·Å, held fixed
    let worst = 0;
    for (const E of [0.4, 1.3, 3, 6]) {
      const p = { V0: V0b / 1e-4, a, b: 1e-4 };
      worst = Math.max(worst, Math.abs(bs.kpD(E, p) - bs.deltaCombD(E, a, V0b)));
    }
    assert(worst < 2e-3, `max difference ${worst}`);
    return `max |ΔD| = ${worst.toExponential(1)}`;
  },
  'band structure: Bloch wave obeys ψ(x + a) = e^{ika} ψ(x) and the Schrödinger equation': () => {
    const p = { V0: 4, a: 5, b: 1 };
    const e = bs.bandEdges(p);
    const k = 0.37 * Math.PI / p.a;
    const E = bs.bandEnergy(p, e, 2, k);
    const n = 200;
    const xs = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) { xs[i] = 0.1 + (i / n) * p.a; xs[i + n] = xs[i] + p.a; }
    const re = new Float64Array(2 * n), im = new Float64Array(2 * n);
    bs.blochWave(p, E, k, xs, re, im);
    const c = Math.cos(k * p.a), s = Math.sin(k * p.a);
    let worst = 0;
    for (let i = 0; i < n; i++) {
      worst = Math.max(worst, Math.hypot(re[i + n] - (re[i] * c - im[i] * s), im[i + n] - (re[i] * s + im[i] * c)));
    }
    assert(worst < 1e-8, `Bloch residual ${worst}`);
    // −C ψ'' + V ψ = E ψ, checked by finite differences inside the well (0 < x < w).
    const h = 1e-3;
    const x3 = new Float64Array([1.5 - h, 1.5, 1.5 + h]);
    const r3 = new Float64Array(3), i3 = new Float64Array(3);
    bs.blochWave(p, E, k, x3, r3, i3);
    const lap = (r3[0] - 2 * r3[1] + r3[2]) / (h * h);
    close(-bs.HB2M * lap, E * r3[1], 1e-4, 'Schrödinger residual (real part)');
    return `Bloch residual ${worst.toExponential(1)}`;
  },
  'band structure: tight-binding bandwidth is 4t and m* = ħ²/(2ta²)': () => {
    const t = 0.8, a = 3, eps = 1.5;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const E = bs.tbChain(-Math.PI / a + (i / 400) * (2 * Math.PI / a), eps, t, a);
      lo = Math.min(lo, E);
      hi = Math.max(hi, E);
    }
    close(hi - lo, 4 * t, 1e-9, 'bandwidth');
    const h = 1e-4;
    const d2 = (bs.tbChain(h, eps, t, a) - 2 * bs.tbChain(0, eps, t, a) + bs.tbChain(-h, eps, t, a)) / (h * h);
    const mNum = bs.effMassFromCurvature(d2);
    close(mNum, bs.tbEffMass(t, a), 1e-5, 'effective mass ratio');
    // ħ²/(2ta²) with ħ²/(2mₑ) = 3.81 eV·Å² gives 3.81 / (0.8 · 9) mₑ.
    close(bs.tbEffMass(t, a), 3.80998 / 7.2, 1e-9, 'closed form');
    return `m*/mₑ = ${mNum.toFixed(4)}`;
  },
  'band structure: graphene has E = 0 at the K point and 3t at Γ': () => {
    const K = bs.diracK();
    const eK = bs.grapheneE(K, 0);
    assert(eK < 1e-12, `E(K) = ${eK}`);
    // The other corners of the hexagonal zone are Dirac points too.
    const eK2 = bs.grapheneE(K / 2, (K * Math.sqrt(3)) / 2);
    assert(eK2 < 1e-12, `E(K') = ${eK2}`);
    close(bs.grapheneE(0, 0), 3 * bs.GRAPHENE.t, 1e-12, 'E(Γ)');
    // Cone slope near K: E ≈ (3/2) t a_cc |q|
    const q = 1e-4;
    close(bs.grapheneE(K + q, 0) / q, 1.5 * bs.GRAPHENE.t * bs.GRAPHENE.acc, 1e-3, 'Dirac cone slope ħv_F (eV·Å)');
    return `ħv_F = ${(bs.grapheneE(K + q, 0) / q).toFixed(3)} eV·Å`;
  },
  'band structure: filling gives metals for odd counts and a mid-gap Fermi level for even ones': () => {
    const p = { V0: 3.3, a: 5, b: 1 };
    const e = bs.bandEdges(p);
    const f1 = bs.fill(p, e, 1);
    assert(f1.cls === 'metal' && f1.partial, 'one electron per cell should half fill band 1');
    const f2 = bs.fill(p, e, 2);
    close(f2.EF, 0.5 * (e[1] + e[2]), 1e-12, 'mid-gap Fermi level');
    assert(f2.cls === 'semiconductor', `class ${f2.cls}`);
    close(bs.KB * 300, 0.0259, 1e-4, 'kT at 300 K');
    return `semiconductor preset gap ${f2.gap.toFixed(3)} eV`;
  },
};
