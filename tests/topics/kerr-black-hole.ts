import { assert, close } from '../assert.ts';
import * as k from '../../src/topics/kerr-black-hole/physics.ts';

type Suite = () => string | void;

/** Integrate a geodesic until it crosses r_stop or leaves r_out. */
function run(g: k.Geodesic, rStop: number, rOut = 60, maxSteps = 2_000_000, onStep?: () => void): number {
  let n = 0;
  while (n < maxSteps && g.s[0] > rStop && g.s[0] < rOut) {
    k.step(g, k.stepSize(g.s[0], g.a));
    if (onStep) onStep();
    n++;
  }
  return n;
}

export const suites: Record<string, Suite> = {
  'kerr: a=0 horizons and ergosphere match Schwarzschild (r+=2M, r−=0, r_E=2M)': () => {
    close(k.rPlus(0), 2, 1e-15, 'r+');
    close(k.rMinus(0), 0, 1e-15, 'r−');
    close(k.rErgo(0, 0.3), 2, 1e-15, 'r_E');
    close(k.omegaDrag(5, 0), 0, 0, 'ω');
    // extremal: both horizons at M, ergosphere still reaches 2M at the equator and touches r+ at the poles
    close(k.rPlus(1), 1, 1e-15, 'r+ extremal');
    close(k.rErgo(0.7, Math.PI / 2), 2, 1e-15, 'equatorial r_E');
    close(k.rErgo(0.7, 0), k.rPlus(0.7), 1e-15, 'polar r_E');
    return 'r+ = 2M, r− = 0, r_E = 2M at a = 0';
  },
  'kerr: BPT ISCO gives 6M at a=0, M prograde and 9M retrograde at a=1': () => {
    close(k.rIsco(0, true), 6, 1e-12, 'a=0 pro');
    close(k.rIsco(0, false), 6, 1e-12, 'a=0 retro');
    close(k.rIsco(1, true), 1, 1e-12, 'a=1 pro');
    close(k.rIsco(1, false), 9, 1e-12, 'a=1 retro');
    // Cross-check at a=0.5 against the minimum of E_circ(r), found by a direct scan.
    for (const pro of [true, false]) {
      let best = Infinity;
      let rBest = 0;
      for (let r = 2; r < 10; r += 1e-4) {
        const E = k.circular(r, 0.5, pro).E;
        if (Number.isFinite(E) && E < best) {
          best = E;
          rBest = r;
        }
      }
      close(rBest, k.rIsco(0.5, pro), 2e-3, `a=0.5 ${pro ? 'pro' : 'retro'} scan`);
    }
    return `a=0.9: pro ${k.rIsco(0.9, true).toFixed(3)} M, retro ${k.rIsco(0.9, false).toFixed(3)} M`;
  },
  'kerr: frame dragging falls off as 2J/r³ (J = aM) at large r': () => {
    const a = 0.8;
    const r = 1e4;
    const ratio = k.omegaDrag(r, a) / ((2 * a * k.M) / r ** 3);
    close(ratio, 1, 1e-6, 'ω r³ / 2J');
    return `ω r³/2J = ${ratio.toFixed(9)} at r = 10⁴ M`;
  },
  'kerr: thin-disc efficiency 1 − E_ISCO is 5.72% at a=0 and → 1 − 1/√3 (42.3%) as a → 1': () => {
    const e0 = k.efficiency(0);
    close(e0, 1 - Math.sqrt(8 / 9), 1e-12, 'a=0');
    close(e0, 0.0572, 5e-5, 'a=0 rounded');
    const e1 = k.efficiency(1 - 1e-12);
    close(e1, 1 - 1 / Math.sqrt(3), 2e-3, 'a→1');
    return `η(0) = ${(e0 * 100).toFixed(2)}%, η(0.998) = ${(k.efficiency(0.998) * 100).toFixed(1)}%, η(1⁻) = ${(e1 * 100).toFixed(1)}%`;
  },
  'kerr: Penrose maximum efficiency for an extremal hole is (√2 − 1)/2 ≈ 20.7%': () => {
    const eta = k.penroseMaxEfficiency(1);
    close(eta, (Math.SQRT2 - 1) / 2, 1e-15, 'formula');
    close(eta, 0.2071, 1e-4, 'value');
    return `${(eta * 100).toFixed(2)}%`;
  },
  'kerr: circular-orbit E, L from BPT satisfy R = 0 and dR/dr = 0': () => {
    let worst = 0;
    for (const a of [0, 0.5, 0.9]) {
      for (const pro of [true, false]) {
        const r = k.rIsco(a, pro) + 1.3;
        const { E, L } = k.circular(r, a, pro);
        worst = Math.max(worst, Math.abs(k.radialR(r, a, E, L)) / r ** 4, Math.abs(k.radialRprime(r, a, E, L)) / r ** 3);
      }
    }
    assert(worst < 1e-12, `residual ${worst}`);
    return `max residual ${worst.toExponential(1)}`;
  },
  'kerr: a=0 radial drop from 10M matches the Schwarzschild cycloid proper time': () => {
    const g = k.newGeodesic();
    k.dropFrom(g, 0, 10, 0);
    run(g, 2.5);
    // Linear interpolation is not needed: compare τ at the actual stop radius.
    const r = g.s[0];
    const eta = Math.acos((2 * r) / 10 - 1);
    const tau = Math.sqrt(1000 / 8) * (eta + Math.sin(eta));
    close(g.s[4], tau, 1e-6, 'τ');
    return `τ = ${g.s[4].toFixed(6)} M at r = ${r.toFixed(4)} M`;
  },
  'kerr: L=0 drop at a=0.9 co-rotates with dφ/dt = ω(r) and keeps its constraint': () => {
    const a = 0.9;
    const g = k.newGeodesic();
    k.dropFrom(g, a, 8, 0);
    let worstW = 0;
    let worstC = 0;
    run(g, k.rPlus(a) + 0.02, 60, 2_000_000, () => {
      const r = g.s[0];
      const w = k.phiDot(r, a, g.E, g.L) / k.tDot(r, a, g.E, g.L);
      worstW = Math.max(worstW, Math.abs(w / k.omegaDrag(r, a) - 1));
      worstC = Math.max(worstC, k.constraint(g));
    });
    assert(g.s[2] > 1, `swept only ${g.s[2]} rad`);
    assert(worstW < 1e-12, `dφ/dt vs ω ${worstW}`);
    assert(worstC < 1e-8, `constraint ${worstC}`);
    return `swept ${((g.s[2] * 180) / Math.PI).toFixed(0)}° prograde, constraint ≤ ${worstC.toExponential(1)}`;
  },
  'kerr: Penrose split at a=0.998 conserves E and L, E1 < 0, fragment 2 escapes with more than E0': () => {
    const a = 0.998;
    const r = k.penroseRadius(a);
    assert(Number.isFinite(r) && r < 2 && r > k.rPlus(a), `split radius ${r}`);
    const sp = k.penroseSplit(a, r, 0.1, 0.15);
    close(sp.frag1.E + sp.frag2.E, 1, 1e-12, 'E conservation');
    close(sp.frag1.L + sp.frag2.L, sp.L0, 1e-12, 'L conservation');
    assert(sp.frag1.E < 0, `E1 = ${sp.frag1.E}`);
    assert(sp.gain < k.penroseMaxEfficiency(a), 'gain above bound');
    // Each fragment satisfies its own mass shell: r⁴ṙ² = R(E/μ, L/μ)
    for (const f of [sp.frag1, sp.frag2]) close(r ** 4 * f.rdot ** 2, k.radialR(r, a, f.E / f.mu, f.L / f.mu), 1e-10, 'mass shell');
    const g1 = k.newGeodesic();
    Object.assign(g1, { a, E: sp.frag1.E / 0.1, L: sp.frag1.L / 0.1 });
    g1.s[0] = r;
    g1.s[1] = sp.frag1.rdot;
    run(g1, k.rPlus(a) + 0.01);
    const g2 = k.newGeodesic();
    Object.assign(g2, { a, E: sp.frag2.E / 0.1, L: sp.frag2.L / 0.1 });
    g2.s[0] = r;
    g2.s[1] = sp.frag2.rdot;
    run(g2, k.rPlus(a) + 0.01, 60);
    assert(g1.s[0] < 1.5 && g2.s[0] >= 60, `fates r1=${g1.s[0]} r2=${g2.s[0]}`);
    return `split at ${r.toFixed(3)} M, E1 = ${sp.frag1.E.toFixed(3)}, gain ${(sp.gain * 100).toFixed(1)}% (bound ${(k.penroseMaxEfficiency(a) * 100).toFixed(1)}%)`;
  },
};
