import { assert, close } from '../assert.ts';
import * as P from '../../src/topics/chladni-figures/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'chladni: clamped circular plate roots match Bessel values 3.196 and 4.611': () => {
    const k0 = P.circleRoots('clamped', 0, 1)[0];
    const k1 = P.circleRoots('clamped', 1, 1)[0];
    const k2 = P.circleRoots('clamped', 0, 2)[1];
    // Tabulated roots of J_n(k) I_n'(k) − I_n(k) J_n'(k) = 0 (Leissa 1969): 3.1962, 4.6109, 6.3064.
    close(k0, 3.1962, 2e-4, 'λ(0,0)');
    close(k1, 4.6109, 2e-4, 'λ(1,0)');
    close(k2, 6.3064, 2e-4, 'λ(0,1)');
    // The mode shape must satisfy both clamped conditions: w(1) = 0, w'(1) = 0.
    const m = P.circleModes('clamped', 0.3, 11)[0];
    const w1 = P.circleRadial(m, 1);
    const dw = (P.circleRadial(m, 1) - P.circleRadial(m, 1 - 1e-5)) / 1e-5;
    assert(Math.abs(w1) < 1e-9 && Math.abs(dw) < 1e-4, `edge w=${w1}, w'=${dw}`);
    return `λ = ${k0.toFixed(4)}, ${k1.toFixed(4)}, ${k2.toFixed(4)}`;
  },
  'chladni: free circular plate (ν = 0.3) matches published Ω = λ²': () => {
    // Amabili et al., J. Sound Vib. 191 (1996): 5.358, 9.003, 12.439, 20.475, 21.835.
    const ref: [number, number, number][] = [[2, 0, 5.358], [0, 1, 9.003], [3, 0, 12.439], [1, 1, 20.475], [4, 0, 21.835]];
    const modes = P.circleModes('free', 0.3, 25);
    const out: string[] = [];
    ref.forEach(([n, s, O], i) => {
      const m = modes[i];
      assert(m.n === n && m.s === s, `mode ${i} is (${m.n},${m.s}), expected (${n},${s})`);
      close(m.Omega, O, O * 2e-3, `Ω(${n},${s})`);
      out.push(m.Omega.toFixed(3));
    });
    return out.join(', ');
  },
  'chladni: Ritz free square plate matches Leissa (13.47, 19.60, 24.27) and names modes': () => {
    const s = P.solveSquareFree(12, 0.3, 80);
    const ref = [13.468, 19.596, 24.27, 34.8, 34.8];
    const names = ['(1, 1)', '(0, 2)−', '(0, 2)+'];
    ref.forEach((O, i) => close(s.modes[i].Omega, O, O * 0.01, `Ω mode ${i + 1}`));
    names.forEach((nm, i) => assert(s.modes[i].label === nm, `mode ${i + 1} is ${s.modes[i].label}, expected ${nm}`));
    // Ritz is variational: each estimate sits above the accurate value.
    for (let i = 0; i < 3; i++) assert(s.modes[i].Omega >= ref[i] - 1e-3, 'Ritz must be an upper bound');
    // Modes are orthonormal in the beam-function basis.
    let err = 0;
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
      let d = 0;
      for (let k = 0; k < s.modes[a].c.length; k++) d += s.modes[a].c[k] * s.modes[b].c[k];
      err = Math.max(err, Math.abs(d - (a === b ? 1 : 0)));
    }
    assert(err < 1e-9, `orthonormality ${err}`);
    return s.modes.slice(0, 5).map((m) => `${m.label} ${m.Omega.toFixed(2)}`).join(', ');
  },
  'chladni: approximate square modes obey the swap and mirror symmetries and ∇⁴w = Ω²w': () => {
    let worst = 0;
    const cases: [number, number][] = [[2, 0], [3, 1], [4, 2], [5, 1], [1, 4]];
    for (const [n, m] of cases) {
      for (let k = 0; k < 40; k++) {
        const x = (k * 0.6180339) % 1;
        const y = (k * 0.4142135) % 1;
        const p = P.chladniApprox(n, m, 1, x, y);
        const q = P.chladniApprox(n, m, -1, x, y);
        // Swap x ↔ y: plus is symmetric, minus is antisymmetric.
        worst = Math.max(worst, Math.abs(P.chladniApprox(n, m, 1, y, x) - p), Math.abs(P.chladniApprox(n, m, -1, y, x) + q));
        // Swap n ↔ m: plus unchanged, minus flips sign.
        worst = Math.max(worst, Math.abs(P.chladniApprox(m, n, 1, x, y) - p), Math.abs(P.chladniApprox(m, n, -1, x, y) + q));
        // Mirror x → 1 − x: parity (−1)^n when n and m have the same parity.
        if ((n - m) % 2 === 0) worst = Math.max(worst, Math.abs(P.chladniApprox(n, m, 1, 1 - x, y) - (-1) ** n * p));
      }
      // Biharmonic eigen-equation by finite differences at an interior point.
      const h = 1e-3;
      const f = (x: number, y: number) => P.chladniApprox(n, m, 1, x, y);
      const lap = (x: number, y: number) => (f(x + h, y) + f(x - h, y) + f(x, y + h) + f(x, y - h) - 4 * f(x, y)) / (h * h);
      const x0 = 0.31;
      const y0 = 0.17;
      const bi = (lap(x0 + h, y0) + lap(x0 - h, y0) + lap(x0, y0 + h) + lap(x0, y0 - h) - 4 * lap(x0, y0)) / (h * h);
      const O = P.approxOmega(n, m);
      close(bi / (O * O * f(x0, y0)), 1, 2e-3, `∇⁴w/Ω²w for (${n},${m})`);
    }
    assert(worst < 1e-12, `symmetry error ${worst}`);
    return `max symmetry error ${worst.toExponential(1)}`;
  },
  'chladni: hopping sand concentrates on nodal lines (density at nodes ≫ antinodes)': () => {
    const G = 81;
    const absW = new Float32Array(G * G);
    const hop = new Float32Array(G * G);
    let mx = 0;
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const w = Math.abs(P.chladniApprox(3, 1, -1, i / (G - 1), j / (G - 1)));
      absW[i * G + j] = w;
      mx = Math.max(mx, w);
    }
    for (let k = 0; k < G * G; k++) hop[k] = (10 * absW[k]) / mx; // plate throws grains where |w| > max/10
    const rand = P.rng32(7);
    const n = 4000;
    const u = new Float32Array(n);
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) { u[i] = rand(); v[i] = rand(); }
    const c0 = P.nodeConcentration(u, v, n, absW, G, null, 0.1);
    for (let s = 0; s < 600; s++) P.sandStep(u, v, n, hop, G, false, 0.004, rand);
    const c1 = P.nodeConcentration(u, v, n, absW, G, null, 0.1);
    // Density near nodes (|w| < 0.1 max) versus near antinodes (|w| > 0.6 max), per unit area.
    let aN = 0, aA = 0, gN = 0, gA = 0;
    for (let k = 0; k < G * G; k++) { const r = absW[k] / mx; if (r < 0.1) aN++; else if (r > 0.6) aA++; }
    for (let i = 0; i < n; i++) { const r = P.bilinear(absW, G, u[i], v[i]) / mx; if (r < 0.1) gN++; else if (r > 0.6) gA++; }
    const dN = gN / aN;
    const dA = gA / aA;
    assert(c0 > 0.8 && c0 < 1.2, `uniform sand should give ~1, got ${c0}`);
    assert(c1 > 3, `concentration after hopping ${c1}`);
    assert(dA === 0 || dN / dA > 50, `node/antinode density ratio ${dN / dA}`);
    // With sub-threshold rattling the grains also move from the edge of the quiet band onto the line.
    const near0 = P.nodeConcentration(u, v, n, absW, G, null, 0.03);
    for (let s = 0; s < 600; s++) P.sandStep(u, v, n, hop, G, false, 0.004, rand, 0.35);
    const near1 = P.nodeConcentration(u, v, n, absW, G, null, 0.03);
    assert(near1 > 2 * near0 && near1 > 2.5, `rattling should sharpen the lines: ${near0} → ${near1}`);
    return `concentration ${c0.toFixed(2)} → ${c1.toFixed(2)}, grains at antinodes ${gA}, within 3% of a node ${near0.toFixed(1)}× → ${near1.toFixed(1)}×`;
  },
  'chladni: frequencies rise monotonically within each mode family': () => {
    for (const edge of ['clamped', 'free'] as const) {
      const ms = P.circleModes(edge, 0.3, 90);
      const get = (n: number, s: number) => ms.find((m) => m.n === n && m.s === s)?.Omega;
      for (let n = 0; n <= 4; n++) for (let s = 0; s < 3; s++) {
        const a = get(n, s);
        const b = get(n, s + 1);
        const c = get(n + 1, s);
        if (a !== undefined && b !== undefined) assert(b > a, `${edge} (${n},${s + 1}) ≤ (${n},${s})`);
        if (a !== undefined && c !== undefined) assert(c > a, `${edge} (${n + 1},${s}) ≤ (${n},${s})`);
      }
    }
    const sq = P.solveSquareFree(12, 0.3, 320);
    for (const sign of [1, -1]) {
      let prev = 0;
      for (let n = 2; n <= 6; n++) {
        const m = sq.modes.find((x) => x.m === 0 && x.n === n && x.sign === sign);
        assert(!!m, `(0,${n}) sign ${sign} missing`);
        assert(m!.Omega > prev, `(0,${n}) out of order`);
        prev = m!.Omega;
      }
    }
    for (let n = 1; n < 8; n++) assert(P.approxOmega(n + 1, 1) > P.approxOmega(n, 1), 'approx order');
    return 'circle (n,s) and square (0,n)± families ordered';
  },
  'chladni: driven response peaks at resonance with |a| = F/(2ζω²)': () => {
    const re = new Float64Array(1);
    const im = new Float64Array(1);
    const wk = 300;
    const zeta = 0.005;
    P.modalResponse([wk], [2], wk, zeta, re, im);
    const a = Math.hypot(re[0], im[0]);
    close(a, 2 / (2 * zeta * wk * wk), 1e-12, 'peak amplitude');
    close(Math.atan2(im[0], re[0]), -Math.PI / 2, 1e-12, 'phase lag at resonance');
    P.modalResponse([wk], [2], wk * 1.05, zeta, re, im);
    const off = Math.hypot(re[0], im[0]);
    assert(off / a < 0.12, `5% off resonance keeps ${off / a} of the peak`);
    return `off-resonance ratio ${(off / a).toFixed(3)}`;
  },
};
